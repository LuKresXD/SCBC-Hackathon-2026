/**
 * Live-basket synthesis.
 *
 * The /app/basket page shows "synthetic" baskets — groupings of real, live
 * Polymarket markets bucketed by:
 *   - yes-probability tier     (90 = 90-99%, 70 = 35-65%, 50 = 0-10%)
 *   - resolution window        (week = <7d, month = 30-90d, long = 180d+)
 *
 * We build them client-side from the backend's /api/markets feed so that the
 * UI always reflects the current state of Polymarket, without needing a
 * persisted basket table per (tier,window) combo on the backend.
 */

import { BACKEND_URL } from "./tokens";
import type { Bundle } from "./bundles";

// ---------------- Raw API shapes ----------------

/**
 * Shape returned by GET /api/markets (proxied from Polymarket Gamma API).
 * Prices / volume arrive as strings and must be parsed.
 */
export type RawMarket = {
  id: string;
  question: string;
  condition_id: string;
  outcomePrices: string; // JSON-encoded e.g. '["0.85","0.15"]'
  volume: string;
  active: boolean;
  closed: boolean;
  end_date_iso?: string;
};

// ---------------- Parsed / normalized market ----------------

export type LiveMarket = {
  id: string;
  question: string;
  conditionId: string;
  yesProbability: number; // 0..1
  volumeUsd: number;
  endDateIso?: string;
  daysToResolution: number; // may be Infinity if no end date
};

// ---------------- Bucketing rules ----------------

/**
 * Tier bands on Polymarket yes-probability.
 *
 * We keep a preferred (tight) band and an extended (fallback) band. Every
 * basket tries to fill with markets from the preferred band first; if there
 * aren't 10 such markets for a given (tier, window) combo, we top up from
 * the extended band so every surfaced basket has exactly 10 real legs.
 */
export const TIER_RANGE: Record<90 | 70 | 50, [number, number]> = {
  90: [0.85, 0.99], // preferred: "extremely high"
  70: [0.25, 0.75], // preferred: "mid"
  50: [0.0, 0.12], // preferred: "long-shot"
};

export const TIER_RANGE_EXT: Record<90 | 70 | 50, [number, number]> = {
  90: [0.78, 0.995],
  70: [0.15, 0.85],
  50: [0.0, 0.22],
};

export type WindowKey = "week" | "month" | "long";

/**
 * Resolution windows (preferred). Week starts at 1 day so baskets whose
 * legs are all resolving today don't surface as "Resolving".
 */
export const WINDOW_RANGE: Record<WindowKey, [number, number]> = {
  week: [1, 7],
  month: [30, 90],
  long: [180, Number.POSITIVE_INFINITY],
};

const WINDOW_RANGE_EXT: Record<WindowKey, [number, number]> = {
  week: [1, 30], // stretch into "soon" if < 10 strictly-weekly markets exist
  month: [14, 150],
  long: [120, Number.POSITIVE_INFINITY],
};

const WINDOW_CODE: Record<WindowKey, string> = {
  week: "W",
  month: "M",
  long: "L",
};

// All 3×3 tier×window combos we attempt to build a basket for.
const TARGET_COMBOS: Array<[90 | 70 | 50, WindowKey]> = [
  [90, "week"], [90, "month"], [90, "long"],
  [70, "week"], [70, "month"], [70, "long"],
  [50, "week"], [50, "month"], [50, "long"],
];

// Every published basket MUST have exactly this many constituent legs.
const BASKET_LEGS = 10;
// Liquidity floor per constituent.
const MIN_VOLUME_USD = 1_000;

// ---------------- Parsing helpers ----------------

function parseYesProbability(outcomePrices: string): number | null {
  try {
    const arr = JSON.parse(outcomePrices);
    if (Array.isArray(arr) && arr.length > 0) {
      const p = parseFloat(arr[0]);
      if (Number.isFinite(p) && p >= 0 && p <= 1) return p;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function parseDaysToResolution(endDateIso?: string): number {
  if (!endDateIso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(endDateIso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (t - Date.now()) / 86400_000);
}

function normalizeMarket(m: RawMarket): LiveMarket | null {
  if (!m.active || m.closed) return null;
  if (!m.question || !m.id) return null;
  const prob = parseYesProbability(m.outcomePrices);
  if (prob === null) return null;
  const vol = parseFloat(m.volume);
  if (!Number.isFinite(vol) || vol < MIN_VOLUME_USD) return null;
  return {
    id: m.id,
    question: m.question,
    conditionId: m.condition_id,
    yesProbability: prob,
    volumeUsd: vol,
    endDateIso: m.end_date_iso,
    daysToResolution: parseDaysToResolution(m.end_date_iso),
  };
}

// ---------------- Fetch ----------------

/**
 * Pull the full live Polymarket universe via the backend (which paginates
 * Gamma underneath). 5000 is typically the entire active set — enough to
 * fill all nine (tier, window) baskets with real liquid legs.
 */
export async function fetchLiveMarkets(limit = 5000): Promise<LiveMarket[]> {
  const url = `${BACKEND_URL}/api/markets?limit=${limit}&active=true`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Markets fetch failed: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { markets?: RawMarket[] };
  const raw = body.markets ?? [];
  return raw.map(normalizeMarket).filter((m): m is LiveMarket => m !== null);
}

// ---------------- Scoring ----------------

function inRange(v: number, [lo, hi]: [number, number]): boolean {
  return v >= lo && v <= hi;
}

/**
 * How well a market fits a (tier, window) intent. Higher = better.
 *
 * Scoring is layered so we prefer exact fits, and only fall back to
 * extended-band markets when a combo can't fill 10 legs strictly:
 *   - Tier is the hard constraint: a market outside the extended tier
 *     range for a target is never admitted into that basket.
 *   - Inside the extended tier, a strict-tier market beats an extended-only.
 *   - Inside the tier constraint, strict-window beats extended-window.
 *   - Volume is a final tiebreaker.
 */
function fitScore(
  m: LiveMarket,
  tier: 90 | 70 | 50,
  win: WindowKey,
): number | null {
  if (!inRange(m.yesProbability, TIER_RANGE_EXT[tier])) return null;
  const strictTier = inRange(m.yesProbability, TIER_RANGE[tier]);
  const strictWin = inRange(m.daysToResolution, WINDOW_RANGE[win]);
  const extWin = inRange(m.daysToResolution, WINDOW_RANGE_EXT[win]);
  if (!extWin) return null;
  const tierPts = strictTier ? 1000 : 400;
  const winPts = strictWin ? 200 : 50;
  const volPts = Math.min(100, Math.log10(Math.max(1, m.volumeUsd)) * 15);
  return tierPts + winPts + volPts;
}

// ---------------- Basket synthesis ----------------

export type LiveBasket = Bundle & {
  live: true;
  markets: LiveMarket[];
  window: WindowKey;
};

/**
 * Surfaced when a (tier, window) combo doesn't have 10 live markets to
 * fill a real basket. The UI renders these as dimmed "not yet available"
 * cards so the grid stays a consistent 3×3.
 */
export type BasketSlot =
  | LiveBasket
  | {
      kind: "placeholder";
      tier: 90 | 70 | 50;
      window: WindowKey;
      id: string;
      legsAvailable: number;
    };

/**
 * Deterministic 0..1 hash from a string seed. Used to anchor a pseudo-history
 * walk so the sparkline is stable across renders without real 30-day data.
 */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 100000) / 100000;
  };
}

function synthHistory(finalNav: number, days: number, seedId: string): number[] {
  const rng = seededRng(seedId);
  const out: number[] = [];
  // walk around the final NAV, mean-reverting so last value lands on finalNav.
  const band = 0.04;
  let v = Math.max(0.01, Math.min(0.99, finalNav + (rng() - 0.5) * band));
  for (let i = 0; i < days; i++) {
    const target = finalNav;
    const pull = (target - v) * 0.1;
    const noise = (rng() - 0.5) * band * 0.6;
    v = Math.max(0.01, Math.min(0.99, v + pull + noise));
    out.push(Number(v.toFixed(4)));
  }
  out.push(Number(finalNav.toFixed(4)));
  return out;
}

function formatResolutionDate(daysLeft: number): string {
  const d = new Date(Date.now() + daysLeft * 86400_000);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function buildLiveBaskets(markets: LiveMarket[]): BasketSlot[] {
  const out: BasketSlot[] = [];

  for (const [tier, win] of TARGET_COMBOS) {
    const scored: Array<{ m: LiveMarket; s: number }> = [];
    for (const m of markets) {
      const s = fitScore(m, tier, win);
      if (s === null) continue;
      scored.push({ m, s });
    }
    scored.sort((a, b) => b.s - a.s);

    const id = `STHS-${tier}-${WINDOW_CODE[win]}`;

    if (scored.length < BASKET_LEGS) {
      out.push({
        kind: "placeholder",
        tier,
        window: win,
        id,
        legsAvailable: scored.length,
      });
      continue;
    }

    const legs = scored.slice(0, BASKET_LEGS).map((x) => x.m);
    const nav = legs.reduce((s, m) => s + m.yesProbability, 0) / legs.length;
    // Mean days-to-resolution across the 10 constituents — shown verbatim
    // on the card so users see exactly how many days the average leg has left.
    const daysLeft = Math.max(
      0,
      Math.round(legs.reduce((s, m) => s + m.daysToResolution, 0) / legs.length),
    );
    const date = formatResolutionDate(daysLeft);
    const history = synthHistory(nav, 29, id);

    out.push({
      id,
      tier,
      date,
      daysLeft,
      nav: Number(nav.toFixed(4)),
      issue: tier / 100,
      change: 0,
      hot: false,
      resolved: 0,
      totalLegs: legs.length,
      history,
      live: true,
      window: win,
      markets: legs,
    });
  }

  return out;
}

export function isLiveBasket(s: BasketSlot): s is LiveBasket {
  return (s as { kind?: string }).kind !== "placeholder";
}
