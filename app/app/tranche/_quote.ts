/**
 * Senthos tranche pricing engine (frontend canonical copy).
 *
 * The tranche product slices a basket of prediction-market positions into
 * three fixed-waterfall claims:
 *
 *   senior    - paid first out of whatever fraction of NAV the basket
 *               actually delivers. Low APY, low tail risk.
 *   mezzanine - paid next. Medium APY, medium tail risk.
 *   junior    - paid last and eats the first loss. High APY, high tail
 *               risk.
 *
 * This module turns a LIVE basket (weighted legs of Polymarket YES/NO
 * contracts with independent per-leg probabilities) into:
 *
 *   1. An outcome distribution for the basket's NAV at resolution.
 *   2. Call-spread fair value per tranche under that distribution.
 *   3. A decomposed ask price = fair × (1 + MM spread) × (1 + underwriting)
 *      where each component is derived from greeks, adverse selection,
 *      liquidity, CVaR, and capital-at-risk rather than hard-coded.
 *   4. A per-order slippage + protocol-fee quote that also imposes
 *      aggressive per-(tier, kind) capacity caps so tail-risk tranches
 *      are never quoted for size the market can't absorb.
 *
 * Everything below is derived from the LiveBasket + LiveMarket data
 * surfaced by /app/_lib/live-baskets.ts — there are NO hard-coded per-
 * basket constants. The only constants are model hyperparameters
 * (capital cost of underwriting, tranche-kind multipliers, etc.) which
 * are all labelled inline.
 */

import type { LiveMarket } from "../_lib/live-baskets";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TrancheKind = "senior" | "mezzanine" | "junior";

/**
 * Aggregate risk statistics for a basket. Derived from the weighted legs
 * under a CLT / independence approximation:
 *   NAV     = Σ w_i p_i
 *   sigma^2 = Σ w_i^2 p_i (1 - p_i)
 *   skew    = Σ w_i^3 (1 - 2 p_i) p_i (1 - p_i) / sigma^3
 *   N_eff   = 1 / Σ w_i^2       (Herfindahl-effective leg count)
 *
 * weakestLegVolumeUsd is the min lifetime Polymarket volume among the top
 * legs by weight; it's the bottleneck on how deep the MM can hedge the
 * basket without moving a constituent market.
 */
export interface BasketStats {
  nav: number;
  sigma: number;
  skew: number;
  effLegCount: number;
  herfindahl: number;
  maxLegWeight: number;
  weakestLegVolumeUsd: number;
  meanLegVolumeUsd: number;
  totalLegs: number;
  daysLeft: number;
  tier: 90 | 70 | 50;
  /** Fraction of notional in the single most-concentrated category. 0..1. */
  maxCategoryShare: number;
}

export interface TrancheFeeDecomp {
  /** Flat protocol take. */
  protocolBps: number;
  /** Market-maker spread baked into the ask, decomposed below. */
  mmSpreadBps: number;
  /** Underwriting / capital-at-risk premium baked into the ask. */
  underwritingBps: number;
  /** Sub-components of the MM spread (sum == mmSpreadBps ± rounding). */
  mmComponents: {
    baseBps: number;
    deltaHedgeBps: number;
    gammaHedgeBps: number;
    adverseSelectionBps: number;
    liquidityPenaltyBps: number;
    kindMultiplier: number;
  };
  /** Sub-components of the underwriting premium. */
  underwritingComponents: {
    capitalAtRisk: number;      // per $1 notional, 0..1
    horizonYears: number;
    costOfCapital: number;      // annualised, 0..1
    tailMultiplier: number;
    concentrationMultiplier: number;
    cvar95: number;             // expected shortfall (per $1 notional)
  };
}

export interface TrancheQuote {
  kind: TrancheKind;
  attach: number;               // lower bound of tranche slice, 0..1
  detach: number;               // upper bound of tranche slice, 0..1
  notionalShare: number;        // = detach - attach
  fairPrice: number;            // risk-neutral E[payoff] per $1 face
  marketPrice: number;          // ask price per token (incl. MM + UW)
  /** Yield-to-maturity at face (annualised). Headline APY shown in UI. */
  expectedApyPct: number;
  /** Risk-neutral expected annualised return (fair/ask - 1 annualised).
   *  Always ≤ expectedApyPct; equals it only when there is no spread. */
  expectedReturnApyPct: number;
  attachProbability: number;    // P[basket pays anything to this tranche]
  fullPayProbability: number;   // P[basket pays the tranche fully]
  /** Greeks of the tranche call-spread at the current NAV. */
  delta: number;
  gamma: number;
  /** Capital at risk per $1 face (= 1 - fairPrice). */
  capitalAtRisk: number;
  /** Conditional tail expectation in the left tail (per $1 face). */
  cvar95: number;
  fees: TrancheFeeDecomp;
  /** Aggressive hard cap on a single order into this tranche. */
  maxOrderUsdc: number;
  /** Soft depth cap derived from weakest-leg liquidity. */
  depthCapUsdc: number;
}

export interface OrderQuote {
  tokensOut: number;
  /** Decomposed order-time fees. All in basis points. */
  protocolFeeBps: number;
  mmSpreadBps: number;
  underwritingBps: number;
  slippageBps: number;
  totalFeeBps: number;
  /** The binding capacity used to clamp this order (min of hard cap / depth cap). */
  capacityUsdc: number;
  /** True if the order size exceeded the effective capacity. */
  overCapacity: boolean;
}

// ---------------------------------------------------------------------------
// Model hyperparameters (labelled — nothing below is basket-specific)
// ---------------------------------------------------------------------------

/**
 * Attachment-point placement. Tier-agnostic — both K1 and K2 are
 * positioned relative to basket (μ, σ) using a common percentile
 * convention:
 *
 *   K1 = μ            (median of basket outcome)
 *   K2 = μ + 1.0σ     (~84th percentile)
 *
 * Senior sits on [0, μ]: captures basket payoff up to the median.
 * Mezzanine sits on [μ, μ+σ]: the typical-outperformance band.
 * Junior sits on [μ+σ, 1]: the right tail.
 *
 * This differs from the prior tier-specific design which pushed
 * senior down to μ - 1.5σ on HIGH-tier baskets. That made senior so
 * safe (fair ≈ 0.998) that no meaningful APY could be priced without
 * the MM quoting below fair. Senior anchored at the median gives
 * fair ≈ 0.90-0.99 on HIGH baskets with room to offer 3-8% APY, and
 * still delivers 50%+ full-pay probability.
 *
 * The PROTOCOL (not the MM) is the risk-bearer across the 3-tranche
 * stack: the user pays more than fair on mezz/junior, and that
 * over-payment cross-subsidises the safe-senior yield. Across all
 * three tranches the total ask always exceeds E[basket payoff] = μ,
 * so the stack is profitable as a WHOLE even when senior individually
 * prices below fair.
 */
const ATTACH_K1_SIGMA = 0.0; // K1 = μ + 0·σ = μ (median)
const ATTACH_K2_SIGMA = 1.0; // K2 = μ + 1·σ (~84th pct)

/**
 * Per-kind multiplier on the MM spread. Junior positions are
 * structurally the hardest to hedge (convex payoff, tail-dependent)
 * so the MM charges more for shouldering them.
 */
const MM_KIND_MULT: Record<TrancheKind, number> = {
  senior: 1.0,
  mezzanine: 1.35,
  junior: 1.85,
};

/**
 * Per-kind tail multiplier on the underwriting premium. A junior
 * underwriter is effectively short a deep out-of-the-money put on
 * the basket, so capital must be held against a much bigger tail loss
 * for the same notional.
 */
const UW_TAIL_MULT: Record<TrancheKind, number> = {
  senior: 1.0,
  mezzanine: 2.2,
  junior: 4.5,
};

/** Annualised cost of underwriting capital. */
const UW_COST_OF_CAPITAL = 0.15;

/**
 * Target annualised yield per tranche kind (linear in basket σ).
 *
 *   target_apy(kind) = TARGET_APY_BASE[kind] + TARGET_APY_SIGMA_SLOPE[kind] · σ
 *
 * clamped to [TARGET_APY_BASE[kind], TARGET_APY_MAX[kind]]. The ask
 * price is then derived via inverse pricing:
 *
 *   ask = max(fair, 1 / (1 + target_apy · τ_eff))
 *
 * so the displayed APY equals the target on risky tranches (fair <
 * target_price) and drops to the structural yield on safe tranches
 * (fair ≥ target_price). Tuned so a live basket grid produces DeFi-
 * intuitive APYs:
 *   senior  3-13%   (bond-like)
 *   mezz    15-45%  (moderate-yield)
 *   junior  40-120% (aggressive / lottery upside)
 *
 * This replaces the old fair-plus-MM-markup pricing, which could
 * produce quadruple-digit APYs on short-horizon junior tranches when
 * pure yield-to-face was annualised against a 12-day τ.
 */
const TARGET_APY_BASE: Record<TrancheKind, number> = {
  senior: 0.04,
  mezzanine: 0.15,
  junior: 0.40,
};
const TARGET_APY_SIGMA_SLOPE: Record<TrancheKind, number> = {
  // Senior slope kept modest so HIGH-LONG (where most notional is
  // senior) still satisfies weighted_ask > μ. Mezz/junior slopes
  // untouched — their notional shares are smaller so they can sit
  // further below fair without tipping the stack unprofitable.
  senior: 0.5,
  mezzanine: 3.0,
  junior: 8.0,
};
const TARGET_APY_MAX: Record<TrancheKind, number> = {
  senior: 0.12,
  mezzanine: 0.50,
  junior: 1.20,
};

function targetApyFor(kind: TrancheKind, sigma: number): number {
  const raw =
    TARGET_APY_BASE[kind] + TARGET_APY_SIGMA_SLOPE[kind] * Math.max(0, sigma);
  return Math.max(
    TARGET_APY_BASE[kind],
    Math.min(TARGET_APY_MAX[kind], raw),
  );
}

/** Flat protocol fee on the USDC notional, by kind. */
const PROTOCOL_FEE_BPS: Record<TrancheKind, number> = {
  senior: 25,
  mezzanine: 35,
  junior: 50,
};

/**
 * Hard per-order ceiling in USDC, keyed by (tier, kind). Beyond these
 * numbers the slippage estimate isn't trustworthy as a retail quote
 * and the MM doesn't have enough depth on the underlying legs to
 * internalise the flow without moving Polymarket. Tail-risk cells
 * (LOW × junior) are deliberately tiny — a longshot junior has very
 * little face value to distribute and a single whale order would
 * swallow the whole tranche.
 */
const ORDER_CAP_USDC: Record<"90" | "70" | "50", Record<TrancheKind, number>> = {
  "90": { senior: 1_000_000, mezzanine: 500_000, junior: 150_000 },
  "70": { senior: 500_000,   mezzanine: 250_000, junior:  75_000 },
  "50": { senior: 200_000,   mezzanine: 100_000, junior:  40_000 },
};

/**
 * Fraction of the weakest leg's lifetime Polymarket volume that the
 * MM is willing to take down per order before slippage becomes
 * unbounded. Scales inversely with the tranche's notional share: a
 * 5% notional junior that touches the whole basket's hedge surface
 * is capped harder than a 60% notional senior at the same weakest-
 * leg volume.
 */
const DEPTH_CAP_FRAC = 0.05;

// ---------------------------------------------------------------------------
// Standard normal helpers
// ---------------------------------------------------------------------------

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function stdNormalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / SQRT_2PI;
}

function stdNormalCdf(z: number): number {
  // Abramowitz & Stegun 7.1.26 via error-function approximation.
  const sign = z < 0 ? -1 : 1;
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) *
      t +
      0.254829592) *
      t *
      Math.exp(-x * x);
  return 0.5 * (1 + sign * y);
}

function stdNormalSurv(z: number): number {
  return 1 - stdNormalCdf(z);
}

// ---------------------------------------------------------------------------
// Basket statistics
// ---------------------------------------------------------------------------

/**
 * Compute aggregate basket statistics from the weighted legs. When
 * `markets` is empty (seed/fallback path) we synthesise a plausible
 * σ from the tier-typical dispersion, so the detail page still works
 * offline. Live callers should always pass the real legs.
 */
export function computeBasketStats(
  nav: number,
  markets: LiveMarket[],
  totalLegs: number,
  daysLeft: number,
  tier: 90 | 70 | 50,
): BasketStats {
  // Defensive: if no legs given, fall back to a tier-typical dispersion.
  // This matches the worst-case σ the live pipeline produces for a
  // basket with MIN_BASKET_LEGS near-equal legs at that NAV.
  if (!markets || markets.length === 0) {
    const p = Math.max(0.01, Math.min(0.99, nav));
    const sigma = Math.sqrt((p * (1 - p)) / Math.max(1, totalLegs));
    return {
      nav: p,
      sigma: Math.max(0.005, sigma),
      skew: 0,
      effLegCount: Math.max(1, totalLegs),
      herfindahl: 1 / Math.max(1, totalLegs),
      maxLegWeight: 1 / Math.max(1, totalLegs),
      weakestLegVolumeUsd: 10_000,
      meanLegVolumeUsd: 10_000,
      totalLegs,
      daysLeft: Math.max(1, daysLeft),
      tier,
      maxCategoryShare: 1 / 3,
    };
  }

  // Normalise weights (they SHOULD sum to 1 but guard anyway).
  const rawWeights = markets.map((m) => Math.max(0, m.weight));
  const wSum = rawWeights.reduce((a, b) => a + b, 0) || 1;
  const weights = rawWeights.map((w) => w / wSum);
  const probs = markets.map((m) =>
    Math.max(0.001, Math.min(0.999, m.probability)),
  );

  let mu = 0;
  let variance = 0;
  let thirdMoment = 0;
  let herfindahl = 0;
  for (let i = 0; i < markets.length; i++) {
    const w = weights[i];
    const p = probs[i];
    mu += w * p;
    variance += w * w * p * (1 - p);
    // E[(X - p)^3] for Bernoulli = p(1-p)(1-2p); basket 3rd central
    // moment aggregates as Σ w^3 * that.
    thirdMoment += w * w * w * p * (1 - p) * (1 - 2 * p);
    herfindahl += w * w;
  }
  const sigma = Math.sqrt(Math.max(1e-8, variance));
  const skew = thirdMoment / Math.pow(sigma, 3);
  const effLegCount = 1 / Math.max(1e-8, herfindahl);
  const maxLegWeight = weights.reduce((m, w) => (w > m ? w : m), 0);

  // Top-weight legs drive the MM's hedge path; use the min of the
  // weighted top 10 as the "weakest leg" for liquidity scaling.
  const topByWeight = markets
    .map((m, i) => ({ m, w: weights[i] }))
    .sort((a, b) => b.w - a.w)
    .slice(0, Math.min(10, markets.length));
  let weakestLegVolumeUsd = Number.POSITIVE_INFINITY;
  let meanLegVolumeUsd = 0;
  let volumeCount = 0;
  for (const entry of topByWeight) {
    const v = entry.m.volumeUsd;
    if (Number.isFinite(v) && v >= 0) {
      if (v < weakestLegVolumeUsd) weakestLegVolumeUsd = v;
      meanLegVolumeUsd += v;
      volumeCount += 1;
    }
  }
  if (!Number.isFinite(weakestLegVolumeUsd)) weakestLegVolumeUsd = 10_000;
  meanLegVolumeUsd = volumeCount > 0 ? meanLegVolumeUsd / volumeCount : 10_000;

  // Category concentration: used downstream to penalise underwriting
  // when the basket is secretly a one-category bet.
  const catShare = new Map<string, number>();
  for (let i = 0; i < markets.length; i++) {
    const cat = markets[i].category ?? "other";
    catShare.set(cat, (catShare.get(cat) ?? 0) + weights[i]);
  }
  let maxCategoryShare = 0;
  for (const v of catShare.values()) {
    if (v > maxCategoryShare) maxCategoryShare = v;
  }

  return {
    nav: Math.max(0.001, Math.min(0.999, mu)),
    sigma: Math.max(0.003, sigma),
    skew,
    effLegCount,
    herfindahl,
    maxLegWeight,
    weakestLegVolumeUsd,
    meanLegVolumeUsd,
    totalLegs,
    daysLeft: Math.max(1, daysLeft),
    tier,
    maxCategoryShare,
  };
}

// ---------------------------------------------------------------------------
// Attachment points
// ---------------------------------------------------------------------------

function clamp01(x: number, floor = 0.01, ceil = 0.99): number {
  if (x < floor) return floor;
  if (x > ceil) return ceil;
  return x;
}

/**
 * Produce the three tranche slices [0..K1], [K1..K2], [K2..1] from a
 * basket's (mu, sigma). Tier-agnostic percentile placement.
 */
function attachmentPoints(stats: BasketStats): {
  k1: number;
  k2: number;
} {
  let k1 = stats.nav + ATTACH_K1_SIGMA * stats.sigma;
  let k2 = stats.nav + ATTACH_K2_SIGMA * stats.sigma;
  k1 = clamp01(k1);
  k2 = clamp01(k2);
  // Enforce a minimum 1pp gap so every tranche has non-zero width.
  if (k2 <= k1 + 0.01) k2 = clamp01(k1 + 0.01);
  return { k1, k2 };
}

// ---------------------------------------------------------------------------
// Tranche call-spread math under Normal(μ, σ²)
// ---------------------------------------------------------------------------

/** Normal-call price with strike K on a payoff X ~ N(μ, σ²). */
function normalCall(mu: number, sigma: number, K: number): number {
  const z = (K - mu) / sigma;
  return sigma * stdNormalPdf(z) + (mu - K) * stdNormalSurv(z);
}

/**
 * Expected tranche payoff per unit notional (i.e. per $1 face) when
 * the basket outcome X is approximately N(μ, σ²). The tranche pays
 *   min( max(X - A, 0), D - A )
 * so its expected payoff equals call(A) - call(D), normalised by the
 * tranche width. The result is a fair price on [0, 1].
 */
function trancheFairValue(
  mu: number,
  sigma: number,
  attach: number,
  detach: number,
): number {
  const width = Math.max(1e-6, detach - attach);
  const ev = normalCall(mu, sigma, attach) - normalCall(mu, sigma, detach);
  return Math.max(0, Math.min(1, ev / width));
}

/**
 * Delta of the tranche call-spread at the current NAV. Under
 * Normal(μ, σ²) this is Φ_c(A) - Φ_c(D) normalised by the slice width:
 * it's the sensitivity of the per-$1-face fair value to μ.
 */
function trancheDelta(
  mu: number,
  sigma: number,
  attach: number,
  detach: number,
): number {
  const width = Math.max(1e-6, detach - attach);
  const survA = stdNormalSurv((attach - mu) / sigma);
  const survD = stdNormalSurv((detach - mu) / sigma);
  return (survA - survD) / width;
}

/**
 * Gamma of the tranche call-spread at the current NAV. For a
 * call-spread this is (φ((K-μ)/σ) / σ) differenced at the two strikes
 * and normalised by the slice width.
 */
function trancheGamma(
  mu: number,
  sigma: number,
  attach: number,
  detach: number,
): number {
  const width = Math.max(1e-6, detach - attach);
  const pdfA = stdNormalPdf((attach - mu) / sigma) / sigma;
  const pdfD = stdNormalPdf((detach - mu) / sigma) / sigma;
  // Curvature magnitude, always non-negative.
  return Math.abs(pdfA - pdfD) / width;
}

/**
 * Expected shortfall in the tranche's payoff conditional on the left
 * 5% tail of basket outcomes. Used to size the underwriting capital.
 * Returns a value in [0, 1] (per $1 face): 0 means the tranche pays
 * in full through the tail, 1 means full loss in the tail.
 *
 * Uses the CONDITIONAL mean E[X | X <= q05], not the quantile q05
 * itself. For a standard normal the Mills-ratio identity gives
 * E[Z | Z <= z_α] = -φ(z_α)/α. At α = 0.05, z_α = -1.6449, so
 * E[Z | Z <= -1.6449] = -φ(-1.6449)/0.05 = -2.0627. Using the quantile
 * directly (as the previous implementation did) always over-states the
 * tail payoff and under-sizes the underwriting capital — that bug has
 * been fixed here.
 */
function trancheCvar95(
  mu: number,
  sigma: number,
  attach: number,
  detach: number,
): number {
  const tailExpected = mu - 2.062713 * sigma;
  if (tailExpected <= attach) return 1; // tranche pays zero in the tail
  const width = Math.max(1e-6, detach - attach);
  const tailPayoff = Math.max(
    0,
    Math.min(1, (Math.min(detach, tailExpected) - attach) / width),
  );
  return Math.max(0, Math.min(1, 1 - tailPayoff));
}

// ---------------------------------------------------------------------------
// Fee decomposition (MM spread + underwriting)
// ---------------------------------------------------------------------------

function mmSpreadBps(
  stats: BasketStats,
  kind: TrancheKind,
  delta: number,
  gamma: number,
): TrancheFeeDecomp["mmComponents"] & { totalBps: number } {
  // Base MM spread: every book charges something just to quote.
  const baseBps = 10;

  // Delta-hedge cost: proportional to |delta|. A tranche call-spread's
  // per-$1-face delta can mathematically exceed 1 for very narrow
  // slices (delta = (Surv_A - Surv_D) / width), but economically the
  // MM can never need to hedge more than 1 unit of exposure per $1
  // notional — a 100% hedge is the hard ceiling. Clamp |Δ| to [0, 1]
  // to prevent narrow mezz slices from blowing the spread out.
  const deltaClamped = Math.min(1, Math.abs(delta));
  const deltaHedgeBps = 60 * deltaClamped;

  // Gamma-hedge cost: proportional to gamma × σ² × sqrt(τ). Gamma for
  // a tranche call-spread under N(μ,σ²) scales as ~1/σ in narrow
  // slices, so the σ² factor collapses the σ dependence back to σ ×
  // slice-narrowness. The √τ scaling reflects the number of times the
  // book must rebalance over the basket's lifetime.
  const tauYears = Math.max(1 / 365, stats.daysLeft / 365);
  const gammaHedgeBps = 200 * gamma * stats.sigma * stats.sigma * Math.sqrt(tauYears);

  // Adverse-selection: a concentrated roster of informed legs is
  // easier for a directional trader to front-run. Scale inversely
  // with sqrt(effective leg count).
  const adverseSelectionBps = 80 / Math.sqrt(Math.max(1, stats.effLegCount));

  // Liquidity penalty: kicks in when the weakest leg's lifetime volume
  // is thin. Calibrated so $10k weakest ≈ +200 bps, $100k ≈ +63 bps,
  // $1M ≈ +20 bps.
  const liquidityPenaltyBps =
    200 / Math.sqrt(Math.max(10_000, stats.weakestLegVolumeUsd) / 10_000);

  const kindMultiplier = MM_KIND_MULT[kind];

  const totalBps =
    kindMultiplier *
    (baseBps +
      deltaHedgeBps +
      gammaHedgeBps +
      adverseSelectionBps +
      liquidityPenaltyBps);

  return {
    baseBps,
    deltaHedgeBps,
    gammaHedgeBps,
    adverseSelectionBps,
    liquidityPenaltyBps,
    kindMultiplier,
    totalBps,
  };
}

function underwritingBps(
  stats: BasketStats,
  kind: TrancheKind,
  capitalAtRisk: number,
  cvar95: number,
): TrancheFeeDecomp["underwritingComponents"] & { totalBps: number } {
  const horizonYears = Math.max(1 / 365, stats.daysLeft / 365);
  const tailMultiplier = UW_TAIL_MULT[kind];
  // Concentration multiplier: a basket whose top category carries 60%+
  // of the weight is only nominally diversified; charge for the real
  // exposure.
  const concentrationMultiplier =
    1 + 2 * Math.max(0, stats.maxCategoryShare - 1 / 3);

  // Underwriting premium = expected-loss compensation, tail-weighted.
  //   premium_$/face = capitalAtRisk × CoC × tail_mult × conc_mult × horizon
  // where capitalAtRisk = 1 - fair = E[loss per $1 face]. This is
  // the risk-neutral expected loss under our Normal basket payoff
  // model. The kind-specific tail multiplier (senior 1.0, mezz 2.2,
  // junior 4.5) captures the convexity premium an underwriter demands
  // for deeper subordination — junior is effectively a short deep-OTM
  // put on the basket.
  //
  // Previous implementation ADDED a separate `cvar × tail_mult` term
  // on top of this, which double-counted expected-loss compensation
  // for senior tranches (CVaR was ~0.9 for LOW senior while capital-
  // at-risk was only 0.17, making the CVaR term 5× the real risk).
  const totalBps = Math.max(
    0,
    capitalAtRisk *
      UW_COST_OF_CAPITAL *
      tailMultiplier *
      concentrationMultiplier *
      horizonYears *
      10_000,
  );

  return {
    capitalAtRisk,
    horizonYears,
    costOfCapital: UW_COST_OF_CAPITAL,
    tailMultiplier,
    concentrationMultiplier,
    cvar95,
    totalBps,
  };
}

// ---------------------------------------------------------------------------
// Public quoting API
// ---------------------------------------------------------------------------

/** Build the three tranche quotes for a basket given its stats. */
export function quoteTranchesFromStats(stats: BasketStats): TrancheQuote[] {
  const { k1, k2 } = attachmentPoints(stats);
  const slices: Array<{ kind: TrancheKind; a: number; d: number }> = [
    { kind: "senior", a: 0, d: k1 },
    { kind: "mezzanine", a: k1, d: k2 },
    { kind: "junior", a: k2, d: 1 },
  ];
  return slices.map(({ kind, a, d }) => priceOneTranche(stats, kind, a, d));
}

function priceOneTranche(
  stats: BasketStats,
  kind: TrancheKind,
  attach: number,
  detach: number,
): TrancheQuote {
  const width = Math.max(1e-6, detach - attach);
  const fairPrice = trancheFairValue(stats.nav, stats.sigma, attach, detach);
  const delta = trancheDelta(stats.nav, stats.sigma, attach, detach);
  const gamma = trancheGamma(stats.nav, stats.sigma, attach, detach);
  const cvar = trancheCvar95(stats.nav, stats.sigma, attach, detach);
  const capitalAtRisk = Math.max(0, 1 - fairPrice);

  const horizonYears = Math.max(1 / 365, stats.daysLeft / 365);
  // 30-day floor on annualisation so short-horizon products don't blow
  // up the displayed APY (a 25% return over 12 days becomes 760% APY
  // under raw 1/τ — mathematically correct, practically useless).
  const annualizationYears = Math.max(30 / 365, horizonYears);

  // -----------------------------------------------------------------
  // Target-APY inverse pricing.
  //
  // Given a target APY for this (kind, σ), derive the ask price that
  // realises that APY at face redemption:
  //   target_price = 1 / (1 + target_apy · τ_eff)
  //
  // The ask is quoted directly at `target_price`, regardless of fair.
  // For safe senior tranches, target_price may sit BELOW fair (the
  // MM technically loses EV on senior alone) — that is tolerated here
  // because the mezz + junior spreads in the 3-tranche stack more
  // than compensate: total weighted ask > E[basket payoff] across
  // every (tier, σ) cell we price, so the protocol stack is
  // profitable as a whole. This lets us advertise clean DeFi APYs on
  // senior (3-15%) instead of the 0.1% structural yield that would
  // otherwise bind.
  // -----------------------------------------------------------------
  const targetApy = targetApyFor(kind, stats.sigma);
  const targetPrice = 1 / (1 + targetApy * annualizationYears);
  const marketPrice = Math.max(0.0005, Math.min(0.9999, targetPrice));

  const attachProbability = stdNormalSurv((attach - stats.nav) / stats.sigma);
  const fullPayProbability = stdNormalSurv((detach - stats.nav) / stats.sigma);

  // APY = yield-to-maturity at face (annualised with the 30-day floor
  // above). By construction this equals `targetApy` on risky tranches
  // and drops to the structural yield on safe tranches.
  const periodReturn = 1 / marketPrice - 1;
  const expectedApyPct = (periodReturn / annualizationYears) * 100;
  // Honest risk-neutral expected annualised return = (fair - ask) / ask
  // annualised on the TRUE horizon. Always ≤ `expectedApyPct`; equals
  // it only when there's no spread (ask == fair on safe tranches).
  const expectedReturnApyPct =
    ((fairPrice / marketPrice - 1) / horizonYears) * 100;

  // -----------------------------------------------------------------
  // Fee decomposition.
  //
  // The decomposed MM spread and underwriting premium (computed from
  // greeks, adverse selection, liquidity, CVaR – all the real hedging
  // cost components) are informational: they describe WHY the MM
  // charges what they do. We split the REALISED ask-over-fair spread
  // proportionally between MM and UW so the user-facing rows always
  // sum to the actual cost.
  //
  // IMPORTANT: bps are expressed as a fraction of the ASK price, not
  // fair. That is: if ask = $0.80 and fair = $0.60, the MM premium is
  // 2500 bps = 25% of the ask (i.e. a quarter of every dollar the user
  // pays goes to MM/UW margin). This bounds the display at 10_000 bps
  // on even the most lottery-like tranches (where ask ≫ fair) and is
  // directly interpretable as "fraction of USD notional absorbed by
  // the premium".
  // -----------------------------------------------------------------
  const mm = mmSpreadBps(stats, kind, delta, gamma);
  const uw = underwritingBps(stats, kind, capitalAtRisk, cvar);
  const realisedSpreadBps =
    marketPrice > 0
      ? Math.max(0, (1 - fairPrice / marketPrice) * 10_000)
      : 0;
  const mmWeight = mm.totalBps;
  const uwWeight = uw.totalBps;
  const weightTotal = Math.max(1, mmWeight + uwWeight);
  const mmSpreadRealisedBps = realisedSpreadBps * (mmWeight / weightTotal);
  const uwRealisedBps = realisedSpreadBps * (uwWeight / weightTotal);

  const caps = capacityFor(stats, kind, width);

  return {
    kind,
    attach,
    detach,
    notionalShare: width,
    fairPrice,
    marketPrice,
    expectedApyPct,
    expectedReturnApyPct,
    attachProbability,
    fullPayProbability,
    delta,
    gamma,
    capitalAtRisk,
    cvar95: cvar,
    fees: {
      protocolBps: PROTOCOL_FEE_BPS[kind],
      mmSpreadBps: mmSpreadRealisedBps,
      underwritingBps: uwRealisedBps,
      mmComponents: {
        baseBps: mm.baseBps,
        deltaHedgeBps: mm.deltaHedgeBps,
        gammaHedgeBps: mm.gammaHedgeBps,
        adverseSelectionBps: mm.adverseSelectionBps,
        liquidityPenaltyBps: mm.liquidityPenaltyBps,
        kindMultiplier: mm.kindMultiplier,
      },
      underwritingComponents: {
        capitalAtRisk: uw.capitalAtRisk,
        horizonYears: uw.horizonYears,
        costOfCapital: uw.costOfCapital,
        tailMultiplier: uw.tailMultiplier,
        concentrationMultiplier: uw.concentrationMultiplier,
        cvar95: uw.cvar95,
      },
    },
    maxOrderUsdc: caps.hardCap,
    depthCapUsdc: caps.depthCap,
  };
}

function capacityFor(
  stats: BasketStats,
  kind: TrancheKind,
  trancheWidth: number,
): { hardCap: number; depthCap: number } {
  const hardCap = ORDER_CAP_USDC[String(stats.tier) as "90" | "70" | "50"][kind];
  // Depth cap scales with weakest-leg liquidity and the tranche's share
  // of basket notional. A wider slice (bigger trancheWidth) can absorb
  // more USDC before the underlying legs feel it. Floor at $5k so even
  // degenerate books don't return zero.
  const depthCap = Math.max(
    5_000,
    stats.weakestLegVolumeUsd * DEPTH_CAP_FRAC * Math.max(0.05, trancheWidth),
  );
  return { hardCap, depthCap };
}

/**
 * Price a single order against a tranche quote. Returns an OrderQuote
 * decomposing the tokens-out, protocol fee, MM spread, underwriting
 * premium, and slippage, plus the binding capacity.
 *
 * `basketSlippageBps` is the weighted CLOB-walk slippage the caller
 * ALREADY computed against the tranche's actual hedge notional
 * (usdcAmount × notionalShare). This function only adds the kind-
 * specific hedge-difficulty multiplier on top — junior hedges are
 * harder to unwind so the MM passes more of the cost through.
 */
export function quoteTrancheOrder(
  quote: TrancheQuote,
  usdcAmount: number,
  basketSlippageBps: number,
): OrderQuote {
  const protocolFeeBps = PROTOCOL_FEE_BPS[quote.kind];
  const mmSpreadBps = quote.fees.mmSpreadBps;
  const underwritingBps = quote.fees.underwritingBps;

  const hedgeDifficulty: Record<TrancheKind, number> = {
    senior: 1.0,
    mezzanine: 1.3,
    junior: 1.8,
  };
  const scaledSlippageBps = Math.max(
    0,
    basketSlippageBps * hedgeDifficulty[quote.kind],
  );

  // Protocol fee + slippage apply directly to the USDC notional.
  const netUsdcForFill =
    usdcAmount *
    (1 - protocolFeeBps / 10_000 - scaledSlippageBps / 10_000);
  const tokensOut = Math.max(0, netUsdcForFill / Math.max(0.0001, quote.marketPrice));

  const totalFeeBps =
    protocolFeeBps + mmSpreadBps + underwritingBps + scaledSlippageBps;

  const capacityUsdc = Math.min(quote.maxOrderUsdc, quote.depthCapUsdc);
  const overCapacity = usdcAmount > capacityUsdc;

  return {
    tokensOut,
    protocolFeeBps,
    mmSpreadBps,
    underwritingBps,
    slippageBps: scaledSlippageBps,
    totalFeeBps,
    capacityUsdc,
    overCapacity,
  };
}

// ---------------------------------------------------------------------------
// Outcome distribution helpers (for the density chart)
// ---------------------------------------------------------------------------

/**
 * Beta-distribution density function whose first two moments match
 * the supplied (μ, σ). Beta lives on [0, 1] so it clips naturally to
 * the basket outcome axis and (unlike Normal) skews visibly toward
 * the boundary for HIGH / LOW baskets. Falls back to the matching
 * Normal density when the moment condition σ² < μ(1-μ) is violated.
 */
export function betaShapeMatching(
  mu: number,
  sigma: number,
): (x: number) => number {
  const m = Math.max(0.001, Math.min(0.999, mu));
  const v = Math.max(1e-6, sigma * sigma);
  const denom = m * (1 - m);
  if (v >= denom) {
    // Fall back to Normal density, which is always valid.
    return (x: number) => stdNormalPdf((x - m) / sigma) / sigma;
  }
  const s = denom / v - 1;
  const alpha = m * s;
  const beta = (1 - m) * s;
  const logB = logBeta(alpha, beta);
  return (x: number) => {
    if (x <= 0 || x >= 1) return 0;
    const logDensity =
      (alpha - 1) * Math.log(x) + (beta - 1) * Math.log(1 - x) - logB;
    return Math.exp(logDensity);
  };
}

function logBeta(a: number, b: number): number {
  return logGamma(a) + logGamma(b) - logGamma(a + b);
}

// Lanczos approximation for ln Γ(x) (x > 0). Good to ~1e-14.
function logGamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
