/**
 * Senthos tranche risk engine.
 *
 * This module models the market-making desk that has to actually stand
 * behind every quote: what fraction of the basket can they hedge in the
 * underlying Polymarket books, how much does that hedge cost as the
 * order grows, and how much residual TAIL EXPOSURE does the MM have to
 * warehouse on their balance sheet?
 *
 * The previous pricing engine used a static per-tranche MM spread that
 * did NOT scale with order size — a $10k clip and a $500k clip both
 * paid the same bps even though the $500k clip walks much deeper into
 * the book and is mostly unhedgeable. That is unrealistic: a real desk
 * would widen the quote dramatically on large orders and outright
 * refuse orders that exceed what they can lay off.
 *
 * This module adds:
 *   1. `computeHedgeability(markets, books)` — per-basket metric pack
 *      derived from LIVE CLOB depth (when available) with volume-proxy
 *      fallback. Produces a single `hedgeCapacityUsdc` number that
 *      represents the maximum USD the desk can lay off against the
 *      underlying without moving Polymarket by more than ~5%.
 *   2. `computeOrderRisk(stats, kind, hedge, hedgeNotional, cap)` —
 *      size-dependent bps broken down as:
 *        • market impact (Kyle's-lambda sqrt(size/depth))
 *        • warehouse risk (unhedgeable fraction × cost of capital)
 *        • inventory carry (vega × horizon × tranche convexity)
 *        • concentration penalty (for sparse baskets)
 *   3. `computeMaxPositionUsdc(stats, kind, hedge)` — hard position
 *      cap derived from real hedge depth, with tranche-specific
 *      multipliers (senior 3× depth, mezz 1×, junior 0.35× because
 *      junior convexity cannot be hedged delta-one).
 *
 * Both the live detail page and the static ORDER_CAP_USDC fallback in
 * `_quote.ts` consult this module; the static table remains as a
 * floor for the case where `books` is empty and volume is missing.
 */

import type { LiveMarket } from "../_lib/live-baskets";
import type { Orderbook } from "../_lib/orderbook";
import type { BasketStats, TrancheKind } from "./_quote";

// ---------------------------------------------------------------------------
// Calibration constants (all labelled — no per-basket tuning)
// ---------------------------------------------------------------------------

/**
 * Fraction of a leg's lifetime Polymarket volume that the MM can
 * actually hedge in a single session without moving the market more
 * than a few percent. Real CLOB depth is typically a small fraction of
 * lifetime turnover; 0.5% is a conservative desk assumption.
 */
const VOL_TO_DEPTH_RATIO = 0.005;

/**
 * Floor on per-leg depth when neither live book nor volume exists.
 * Keeps the sqrt-impact math from blowing up on synthetic / demo legs.
 */
const MIN_LEG_DEPTH_USDC = 500;

/**
 * Kyle's-lambda coefficient: market-impact bps = K · sqrt(size / depth).
 * Calibrated so a 100% size/depth clip (= as big as the whole book)
 * shows ~120 bps base impact before tranche convexity multiplies.
 */
const KYLE_LAMBDA_BPS = 120;

/**
 * Base inventory carry coefficient. Translates `sigma × sqrt(τ)` (i.e.
 * expected basket move over the lifetime) into bps of vega/theta carry
 * the dealer bears even on a fully-delta-hedged book.
 */
const INVENTORY_COEFF_BPS = 150;

/** Annualised cost of capital for warehoused risk. */
const COST_OF_CAPITAL = 0.15;

/**
 * Tranche-kind convexity multipliers. Junior payoff is a deep-OTM
 * call-spread — its greeks can't be replicated by a linear hedge, so
 * every risk component charges more. Senior is nearly delta-one and
 * hedges cheaply.
 */
const TRANCHE_CONVEXITY: Record<TrancheKind, number> = {
  senior: 1.0,
  mezzanine: 2.5,
  junior: 6.0,
};

/**
 * Hard cap on a tranche order, expressed as a multiple of the basket's
 * aggregate hedge depth. Senior can take ~3× book depth because its
 * exposure is linear and cheap to warehouse; junior is capped tightly
 * because the MM is effectively short a bunch of OTM calls on the
 * basket and cannot offload that convexity.
 */
const MAX_HEDGE_MULT: Record<TrancheKind, number> = {
  senior: 3.0,
  mezzanine: 1.0,
  junior: 0.35,
};

/**
 * Tier-level floor on the order cap when hedgeability can't be
 * determined (no live books and no volume). Stops the UI from
 * reporting a $5 cap on demo / unweighted baskets.
 */
const TIER_CAP_FLOOR: Record<"90" | "70" | "50", Record<TrancheKind, number>> = {
  "90": { senior: 100_000, mezzanine: 40_000, junior: 15_000 },
  "70": { senior: 50_000, mezzanine: 20_000, junior: 7_500 },
  "50": { senior: 20_000, mezzanine: 8_000, junior: 3_000 },
};

/** Effective-leg-count threshold below which concentration starts to bite. */
const CONC_EFF_LEG_THRESHOLD = 20;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LegDepth {
  /** LiveMarket.id (or synthetic id for fallback legs). */
  leg: string;
  /** Basket weight in [0, 1], normalised. */
  weight: number;
  /** Estimated hedgeable USD depth on this leg (live book or proxy). */
  depthUsdc: number;
  /** True if the depth came from a live CLOB snapshot. */
  live: boolean;
}

export interface BasketHedgeability {
  /**
   * Basket-level hedge capacity in USDC. Equal to Σᵢ wᵢ · depthᵢ, i.e.
   * the weighted sum of per-leg depths. Represents the max USD the MM
   * can lay off against the basket's underlying legs in one go before
   * CLOB impact dominates.
   */
  hedgeCapacityUsdc: number;
  /** Sum of weights on legs with a live CLOB book. 0..1. */
  liveBookCoverage: number;
  /** Herfindahl index of leg weights (Σ wᵢ²). Higher = more concentrated. */
  herfindahl: number;
  /** Effective leg count = 1 / herfindahl. */
  effLegCount: number;
  /**
   * Weighted average bid-ask spread across legs with live books (bps).
   * Defaults to 500 bps when no live coverage — a reasonable guess for
   * mid-tier Polymarket instruments.
   */
  avgBookSpreadBps: number;
  /** Per-leg depth breakdown — useful for debug panels. */
  perLegDepth: LegDepth[];
}

export interface OrderRisk {
  /** Kyle's-lambda market-impact bps — grows with sqrt(size/depth). */
  marketImpactBps: number;
  /** Cost of carrying the unhedgeable residual on MM balance sheet. */
  warehouseBps: number;
  /** Inventory carry (vega/theta-like) even on a fully-hedged book. */
  inventoryBps: number;
  /** Concentration penalty for baskets with few effective legs. */
  concentrationBps: number;
  /** Sum of all risk components (bps of USDC notional). */
  totalBps: number;
  /** Fraction of the order the MM couldn't hedge and has to warehouse (0..1). */
  warehouseFraction: number;
}

export interface PositionCap {
  /** Absolute max USDC per single order. */
  maxOrderUsdc: number;
  /** Which constraint bound? */
  reason: "hedge_depth" | "tier_floor";
  /** Pass-through of hedge capacity for display. */
  hedgeCapacityUsdc: number;
}

// ---------------------------------------------------------------------------
// Book helpers
// ---------------------------------------------------------------------------

/**
 * Total USD depth available on the ask side of a book. Summed across
 * every visible level. A real desk would also discount for stale quotes
 * and ladder sparsity; we leave that to the Kyle-lambda sqrt-scaling
 * downstream.
 */
function askSideDepthUsdc(book: Orderbook): number {
  let depth = 0;
  for (const lvl of book.asks) depth += lvl.price * lvl.size;
  return depth;
}

/** Top-of-book bid-ask spread in bps. */
function bookSpreadBps(book: Orderbook): number {
  if (book.bids.length === 0 || book.asks.length === 0) return 500;
  const bid = book.bids[0].price;
  const ask = book.asks[0].price;
  if (bid <= 0 || ask <= 0) return 500;
  const mid = (bid + ask) / 2;
  return Math.max(0, ((ask - bid) / mid) * 10_000);
}

// ---------------------------------------------------------------------------
// Hedgeability
// ---------------------------------------------------------------------------

/**
 * Compute per-basket hedgeability from the live market roster and the
 * optional CLOB book snapshot map. When a leg has a live book we use
 * the actual visible depth; otherwise we fall back to a fraction of
 * the leg's lifetime Polymarket volume.
 */
export function computeHedgeability(
  markets: LiveMarket[],
  books: Map<string, Orderbook> = new Map(),
): BasketHedgeability {
  if (markets.length === 0) {
    return {
      hedgeCapacityUsdc: MIN_LEG_DEPTH_USDC,
      liveBookCoverage: 0,
      herfindahl: 1,
      effLegCount: 1,
      avgBookSpreadBps: 500,
      perLegDepth: [],
    };
  }

  // Normalise weights so we're robust to roster-level drift.
  const rawW = markets.map((m) => Math.max(0, m.weight));
  const wSum = rawW.reduce((a, b) => a + b, 0) || 1;
  const w = rawW.map((x) => x / wSum);

  let hedgeCapacityUsdc = 0;
  let liveBookCoverage = 0;
  let herfindahl = 0;
  let spreadAcc = 0;
  let spreadWeight = 0;
  const perLegDepth: LegDepth[] = [];

  for (let i = 0; i < markets.length; i++) {
    const m = markets[i];
    const wi = w[i];
    herfindahl += wi * wi;

    const book = m.tokenId ? books.get(m.tokenId) : undefined;
    let depth: number;
    let live = false;
    if (book && book.asks.length > 0) {
      depth = Math.max(MIN_LEG_DEPTH_USDC, askSideDepthUsdc(book));
      live = true;
      liveBookCoverage += wi;
      spreadAcc += bookSpreadBps(book) * wi;
      spreadWeight += wi;
    } else {
      const vol = Number.isFinite(m.volumeUsd) ? (m.volumeUsd ?? 0) : 0;
      depth = Math.max(MIN_LEG_DEPTH_USDC, vol * VOL_TO_DEPTH_RATIO);
    }

    // Contribution to basket-level hedge capacity is weighted by the
    // leg's basket weight: an over-weighted leg needs more of its depth
    // consumed when the MM hedges the basket, but we can't over-hedge
    // an underweighted leg's capacity either. Linear weighting is the
    // natural first-order approximation under independent-legs.
    hedgeCapacityUsdc += wi * depth;
    perLegDepth.push({ leg: m.id, weight: wi, depthUsdc: depth, live });
  }

  return {
    hedgeCapacityUsdc: Math.max(MIN_LEG_DEPTH_USDC, hedgeCapacityUsdc),
    liveBookCoverage,
    herfindahl,
    effLegCount: 1 / Math.max(1e-6, herfindahl),
    avgBookSpreadBps: spreadWeight > 0 ? spreadAcc / spreadWeight : 500,
    perLegDepth,
  };
}

// ---------------------------------------------------------------------------
// Order-level risk
// ---------------------------------------------------------------------------

/**
 * Compute size-dependent risk for a single order at `hedgeNotionalUsdc`
 * (= usdcAmount × tranche notional share — the dollars of basket
 * exposure the MM needs to hedge when filling this order).
 *
 * All four components are bps of the USDC notional:
 *
 *   • marketImpact  — Kyle's-lambda: K · sqrt(size/depth) × convexity.
 *     Captures CLOB walk cost when the desk actually buys the hedge.
 *   • warehouse     — (unhedgeable fraction) × capital-at-risk × CoC ×
 *     convexity × sqrt(τ). Represents the cost of the tail exposure
 *     the MM has to carry on their own book because they couldn't
 *     lay it off.
 *   • inventory     — K_inv × σ × sqrt(τ) × convexity. Residual vega
 *     and theta carry even on a fully-hedged position.
 *   • concentration — penalty when effLegCount < threshold. A basket
 *     dominated by a few legs is harder to diversify into the book.
 */
export function computeOrderRisk(
  stats: BasketStats,
  kind: TrancheKind,
  hedge: BasketHedgeability,
  hedgeNotionalUsdc: number,
  capitalAtRisk: number,
): OrderRisk {
  if (hedgeNotionalUsdc <= 0) {
    return {
      marketImpactBps: 0,
      warehouseBps: 0,
      inventoryBps: 0,
      concentrationBps: 0,
      totalBps: 0,
      warehouseFraction: 0,
    };
  }

  const convexity = TRANCHE_CONVEXITY[kind];
  const horizonYears = Math.max(1 / 365, stats.daysLeft / 365);
  const depth = Math.max(MIN_LEG_DEPTH_USDC, hedge.hedgeCapacityUsdc);

  // Market impact: sqrt-scaling in order size vs hedge depth.
  const sizeRatio = hedgeNotionalUsdc / depth;
  const marketImpactBps = KYLE_LAMBDA_BPS * Math.sqrt(sizeRatio) * convexity;

  // Warehouse: the fraction of the order that can't be laid off.
  const warehouseFraction = Math.max(
    0,
    Math.min(1, 1 - depth / hedgeNotionalUsdc),
  );
  const warehouseBps =
    warehouseFraction *
    Math.max(0, Math.min(1, capitalAtRisk)) *
    COST_OF_CAPITAL *
    convexity *
    Math.sqrt(horizonYears) *
    10_000;

  // Inventory: even fully hedged positions carry vega/theta.
  const inventoryBps =
    INVENTORY_COEFF_BPS *
    Math.max(0, stats.sigma) *
    Math.sqrt(horizonYears) *
    convexity;

  // Concentration: few effective legs → less diversifiable.
  const concScarcity = Math.max(
    0,
    CONC_EFF_LEG_THRESHOLD / Math.max(1, hedge.effLegCount) - 1,
  );
  const concentrationBps = concScarcity * 50 * convexity;

  const totalBps =
    marketImpactBps + warehouseBps + inventoryBps + concentrationBps;

  return {
    marketImpactBps,
    warehouseBps,
    inventoryBps,
    concentrationBps,
    totalBps,
    warehouseFraction,
  };
}

// ---------------------------------------------------------------------------
// Position caps (block orders that are too large to hedge)
// ---------------------------------------------------------------------------

/**
 * Hard position cap for a single order into this tranche. Takes the
 * max of (tier floor, hedge-depth-based cap). Tranche convexity
 * multipliers keep junior slices on a much tighter leash than senior.
 */
export function computeMaxPositionUsdc(
  stats: BasketStats,
  kind: TrancheKind,
  hedge: BasketHedgeability,
): PositionCap {
  const tierKey = String(stats.tier) as "90" | "70" | "50";
  const tierFloor = TIER_CAP_FLOOR[tierKey][kind];

  const depthCap = hedge.hedgeCapacityUsdc * MAX_HEDGE_MULT[kind];
  const maxOrderUsdc = Math.max(tierFloor, depthCap);

  return {
    maxOrderUsdc,
    reason: depthCap > tierFloor ? "hedge_depth" : "tier_floor",
    hedgeCapacityUsdc: hedge.hedgeCapacityUsdc,
  };
}
