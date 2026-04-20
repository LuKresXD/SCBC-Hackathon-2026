/**
 * Backend tranche pricing service.
 *
 * Mirror of the frontend canonical pricing module in
 * `app/app/tranche/_quote.ts`. Both sides must agree on fair value, MM
 * spread, and underwriting premium so the AI portfolio composer (which
 * cites tranche APYs back to the LLM) and the user-facing buy panel
 * never disagree. When the model changes, keep this file in lockstep
 * with the frontend.
 */

export type TrancheKind = "senior" | "mezzanine" | "junior";

export interface TrancheSpec {
  kind: TrancheKind;
  attach: number;
  detach: number;
}

export interface TrancheQuote {
  kind: TrancheKind;
  attach: number;
  detach: number;
  /** Issue / ask price as a fraction of $1 face. */
  pricePerToken: number;
  /** Risk-neutral expected payoff per $1 face. */
  fairPrice: number;
  /** Annualised simple return at fair payout (percent). */
  expectedYieldPct: number;
  attachProbability: number;
  fullPayProbability: number;
  /** Always $1 per token. Kept for compat with the old API. */
  faceValue: number;
  /** Same as expectedYieldPct; kept so existing callers still compile. */
  recommendedApr: number;
  mmSpreadBps: number;
  underwritingBps: number;
  protocolFeeBps: number;
  delta: number;
  gamma: number;
  capitalAtRisk: number;
  cvar95: number;
  maxOrderUsdc: number;
}

// ---------------------------------------------------------------------------
// Hyperparameters (must match the frontend module exactly)
// ---------------------------------------------------------------------------

// Percentile-based attach: K1 = μ (median), K2 = μ + σ (~84th pct).
// Tier-agnostic — matches frontend `_quote.ts`.
const ATTACH_K1_SIGMA = 0.0;
const ATTACH_K2_SIGMA = 1.0;

const MM_KIND_MULT: Record<TrancheKind, number> = {
  senior: 1.0,
  mezzanine: 1.35,
  junior: 1.85,
};

const UW_TAIL_MULT: Record<TrancheKind, number> = {
  senior: 1.0,
  mezzanine: 2.2,
  junior: 4.5,
};

const UW_COST_OF_CAPITAL = 0.15;

/**
 * Target annualised APY per tranche kind, linear in basket σ. Used
 * for inverse pricing so the displayed yield lands in DeFi-intuitive
 * ranges. Must match the frontend `_quote.ts` constants exactly.
 */
const TARGET_APY_BASE: Record<TrancheKind, number> = {
  senior: 0.04,
  mezzanine: 0.15,
  junior: 0.40,
};
const TARGET_APY_SIGMA_SLOPE: Record<TrancheKind, number> = {
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

const PROTOCOL_FEE_BPS: Record<TrancheKind, number> = {
  senior: 25,
  mezzanine: 35,
  junior: 50,
};

const ORDER_CAP_USDC: Record<"90" | "70" | "50", Record<TrancheKind, number>> = {
  "90": { senior: 1_000_000, mezzanine: 500_000, junior: 150_000 },
  "70": { senior: 500_000, mezzanine: 250_000, junior: 75_000 },
  "50": { senior: 200_000, mezzanine: 100_000, junior: 40_000 },
};

// ---------------------------------------------------------------------------
// Standard normal helpers
// ---------------------------------------------------------------------------

const SQRT_2PI = Math.sqrt(2 * Math.PI);

function stdNormalPdf(z: number): number {
  return Math.exp(-0.5 * z * z) / SQRT_2PI;
}

function stdNormalCdf(z: number): number {
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

function normalCall(mu: number, sigma: number, K: number): number {
  const z = (K - mu) / sigma;
  return sigma * stdNormalPdf(z) + (mu - K) * stdNormalSurv(z);
}

function clamp01(x: number, floor = 0.01, ceil = 0.99): number {
  if (x < floor) return floor;
  if (x > ceil) return ceil;
  return x;
}

function tierFromNav(nav: number): 90 | 70 | 50 {
  if (nav >= 0.7) return 90;
  if (nav >= 0.25) return 70;
  return 50;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const DEFAULT_TRANCHES: TrancheSpec[] = [
  { kind: "senior", attach: 0.0, detach: 0.6 },
  { kind: "mezzanine", attach: 0.6, detach: 0.85 },
  { kind: "junior", attach: 0.85, detach: 1.0 },
];

export interface QuoteTranchesInputs {
  bundleNav: number;
  totalLegs: number;
  horizonDays: number;
  /** Optional; inferred from NAV band when omitted. */
  tier?: 90 | 70 | 50;
  /** Optional explicit basket σ. Defaults to sqrt(p(1-p)/N). */
  sigma?: number;
  /** Weakest-leg lifetime volume (USD). Defaults to $50k. */
  weakestLegVolumeUsd?: number;
  /** Herfindahl-effective leg count. Defaults to totalLegs. */
  effLegCount?: number;
  /** Legacy knob: custom tranche specs. Ignored — attachment points
   *  are now derived from (tier, σ). Kept so legacy callers compile. */
  tranches?: TrancheSpec[];
}

export function quoteTranches(opts: QuoteTranchesInputs): TrancheQuote[] {
  const nav = Math.max(0.001, Math.min(0.999, opts.bundleNav));
  const totalLegs = Math.max(1, opts.totalLegs);
  const horizonDays = Math.max(1, opts.horizonDays);
  const tier = opts.tier ?? tierFromNav(nav);
  const sigma =
    opts.sigma && opts.sigma > 0
      ? Math.max(0.003, opts.sigma)
      : Math.max(0.005, Math.sqrt((nav * (1 - nav)) / totalLegs));
  const weakestLegVolumeUsd = Math.max(
    10_000,
    opts.weakestLegVolumeUsd ?? 50_000,
  );
  const effLegCount = Math.max(1, opts.effLegCount ?? totalLegs);
  const horizonYears = Math.max(1 / 365, horizonDays / 365);

  const k1 = clamp01(nav + ATTACH_K1_SIGMA * sigma);
  let k2 = clamp01(nav + ATTACH_K2_SIGMA * sigma);
  if (k2 <= k1 + 0.01) k2 = clamp01(k1 + 0.01);

  const slices: Array<{ kind: TrancheKind; a: number; d: number }> = [
    { kind: "senior", a: 0, d: k1 },
    { kind: "mezzanine", a: k1, d: k2 },
    { kind: "junior", a: k2, d: 1 },
  ];

  return slices.map(({ kind, a, d }) => {
    const width = Math.max(1e-6, d - a);
    const callA = normalCall(nav, sigma, a);
    const callD = normalCall(nav, sigma, d);
    const fair = Math.max(0, Math.min(1, (callA - callD) / width));

    const survA = stdNormalSurv((a - nav) / sigma);
    const survD = stdNormalSurv((d - nav) / sigma);
    const delta = (survA - survD) / width;

    const pdfA = stdNormalPdf((a - nav) / sigma) / sigma;
    const pdfD = stdNormalPdf((d - nav) / sigma) / sigma;
    const gamma = Math.abs(pdfA - pdfD) / width;

    // CVaR_95: expected shortfall in tranche payoff when basket lands
    // in its left 5% tail. Uses the Mills-ratio conditional mean
    // E[Z | Z <= z_0.05] = -2.0627 instead of the quantile q05 itself
    // — the quantile over-states payoff in the tail and under-sizes
    // underwriting capital.
    const tailExpected = nav - 2.062713 * sigma;
    let cvar95 = 0;
    if (tailExpected <= a) {
      cvar95 = 1;
    } else {
      const tailPayoff = Math.max(
        0,
        Math.min(1, (Math.min(d, tailExpected) - a) / width),
      );
      cvar95 = Math.max(0, Math.min(1, 1 - tailPayoff));
    }

    const capitalAtRisk = Math.max(0, 1 - fair);

    // MM spread decomposition — identical to frontend.
    const baseBps = 10;
    // Clamp |Δ| to [0, 1]: economically the MM never hedges more than
    // 1 unit of exposure per $1 notional, even if the raw per-$1-face
    // delta of a narrow slice is mathematically larger.
    const deltaClamped = Math.min(1, Math.abs(delta));
    const deltaHedgeBps = 60 * deltaClamped;
    const gammaHedgeBps =
      200 * gamma * sigma * sigma * Math.sqrt(horizonYears);
    const adverseSelectionBps = 80 / Math.sqrt(effLegCount);
    const liquidityPenaltyBps =
      200 / Math.sqrt(weakestLegVolumeUsd / 10_000);
    const mmSpreadBps =
      MM_KIND_MULT[kind] *
      (baseBps +
        deltaHedgeBps +
        gammaHedgeBps +
        adverseSelectionBps +
        liquidityPenaltyBps);

    // Underwriting premium = capitalAtRisk × CoC × tail_mult × horizon.
    // capitalAtRisk = 1 - fair = E[loss per $1 face]; the tail mult
    // (senior 1.0, mezz 2.2, junior 4.5) captures the subordination
    // convexity premium. Matches the frontend model; see
    // app/app/tranche/_quote.ts for full derivation.
    const underwritingBps = Math.max(
      0,
      capitalAtRisk *
        UW_COST_OF_CAPITAL *
        UW_TAIL_MULT[kind] *
        horizonYears *
        10_000,
    );

    // Target-APY inverse pricing — ask = target_price directly.
    // Protocol stack profitability is maintained because the mezz +
    // junior spreads more than compensate even when senior prices
    // below fair. Mirrors frontend `_quote.ts`.
    const annualizationYears = Math.max(30 / 365, horizonYears);
    const targetApy = targetApyFor(kind, sigma);
    const targetPrice = 1 / (1 + targetApy * annualizationYears);
    const pricePerToken = Math.max(
      0.0005,
      Math.min(0.9999, targetPrice),
    );
    // Informational decomposition — split the realised (ask - fair)
    // spread into MM vs UW proportional to their computed weights.
    // Expressed as bps of ASK so bounded to 10_000 even for lottery-
    // style tranches where ask >> fair. Matches frontend semantics.
    const realisedSpreadBps =
      pricePerToken > 0
        ? Math.max(0, (1 - fair / pricePerToken) * 10_000)
        : 0;
    const weightTotal = Math.max(1, mmSpreadBps + underwritingBps);
    const mmSpreadRealisedBps =
      realisedSpreadBps * (mmSpreadBps / weightTotal);
    const uwRealisedBps =
      realisedSpreadBps * (underwritingBps / weightTotal);

    // Yield-to-maturity at face (with 30-day annualisation floor).
    const periodReturn = 1 / pricePerToken - 1;
    const expectedYieldPct = (periodReturn / annualizationYears) * 100;

    const maxOrderUsdc =
      ORDER_CAP_USDC[String(tier) as "90" | "70" | "50"][kind];

    return {
      kind,
      attach: +a.toFixed(4),
      detach: +d.toFixed(4),
      pricePerToken: +pricePerToken.toFixed(4),
      fairPrice: +fair.toFixed(4),
      expectedYieldPct: +expectedYieldPct.toFixed(2),
      attachProbability: +survA.toFixed(4),
      fullPayProbability: +survD.toFixed(4),
      faceValue: 1,
      recommendedApr: +expectedYieldPct.toFixed(2),
      mmSpreadBps: +mmSpreadRealisedBps.toFixed(1),
      underwritingBps: +uwRealisedBps.toFixed(1),
      protocolFeeBps: PROTOCOL_FEE_BPS[kind],
      delta: +delta.toFixed(4),
      gamma: +gamma.toFixed(4),
      capitalAtRisk: +capitalAtRisk.toFixed(4),
      cvar95: +cvar95.toFixed(4),
      maxOrderUsdc,
    };
  });
}
