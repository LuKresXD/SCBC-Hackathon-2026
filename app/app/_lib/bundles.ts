/**
 * Seeded basket universe for the sandbox.
 *
 * This is the fallback surface shown when the live Polymarket feed cannot
 * be reached. It mirrors the live 3×3 grid produced by `buildLiveBaskets`:
 * three risk tiers (high / mid / low) × three resolution windows (short /
 * medium / long). The nine ids here are identical to what the live pipeline
 * would emit, so url deep links, portfolio positions and tranche pages
 * continue to resolve when the app is running in offline / fallback mode.
 *
 * NAVs land inside each tier's live band (see `TIER_RANGE` in
 * `./live-baskets.ts`):
 *   • HIGH tier: 0.85–0.99
 *   • MID  tier: 0.25–0.75
 *   • LOW  tier: 0.01–0.12 (long-shot, not 50% — the "50" label is a
 *                          historical tier tag, not an issue price)
 */

export type Bundle = {
  id: string;
  tier: 90 | 70 | 50;
  date: string; // human-readable resolution date
  daysLeft: number;
  nav: number;
  issue: number;
  change: number;
  hot: boolean;
  resolved: number;
  totalLegs: number;
  /** 365 daily NAV points (last point is the live NAV). Drives 7D / 30D / 6M / 1Y chart ranges. */
  history: number[];
  /** 60 one-minute NAV points for the last hour. Drives the 1H chart range. */
  hourHistory: number[];
  /** 288 five-minute NAV points for the last 24h. Drives the 1D chart range. */
  dayHistory: number[];
};

function genHistory(finalNav: number, days: number): number[] {
  // Walk around the final NAV with mild mean-reversion so the series always
  // lands on `finalNav`. Previous version keyed noise off `tier/100`, which
  // produced pointless noise for the low tier after the band moved off 50%.
  const base = finalNav;
  const pts: number[] = [];
  let v = base;
  const band = Math.max(0.02, Math.min(0.08, base * 0.12));
  for (let i = 0; i < days; i++) {
    const drift = (finalNav - base) * (i / days) * 0.6;
    const noise = (Math.random() - 0.48) * band * 0.3;
    const spike = Math.random() < 0.08 ? (Math.random() - 0.5) * band * 0.5 : 0;
    v = base + drift + noise + spike;
    v = Math.max(Math.max(0.005, base - band), Math.min(base + band, v));
    pts.push(parseFloat(v.toFixed(4)));
  }
  pts.push(parseFloat(finalNav.toFixed(4)));
  return pts;
}

/**
 * Intraday / intra-hour NAV synthesis. Produces `steps + 1` points where
 * the LAST point is the live NAV (so the chart's current-value marker
 * always lines up with the number above it). We walk *backwards* from the
 * live NAV with a small symmetric noise and then reverse the series —
 * this keeps the end-anchor exact while giving the curve a realistic
 * "small random walk into present" shape instead of the mean-reversion
 * convergence tail that `genHistory` produces.
 *
 * `stepVol` is the per-step noise band as a fraction of the current NAV
 * (e.g. 0.0008 ≈ 0.08% per tick). Calibrated so:
 *   - 1h (60 1-min ticks)  => ~0.3% peak-to-peak drift
 *   - 24h (288 5-min ticks) => ~1.2% peak-to-peak drift
 */
function genIntradayHistory(finalNav: number, steps: number, stepVol: number): number[] {
  const band = Math.max(0.0003, finalNav * stepVol);
  const rev: number[] = [parseFloat(finalNav.toFixed(6))];
  let v = finalNav;
  for (let i = 0; i < steps; i++) {
    const noise = (Math.random() - 0.5) * band;
    v = Math.max(0.0005, Math.min(0.9995, v + noise));
    rev.push(parseFloat(v.toFixed(6)));
  }
  rev.reverse();
  return rev;
}

// Bundle histories come as a trio (hour / day / year). Helper keeps seed
// data from growing into 3× the row length of the BUNDLES array.
function genBundleHistories(nav: number): {
  history: number[];
  hourHistory: number[];
  dayHistory: number[];
} {
  return {
    history: genHistory(nav, 364),
    hourHistory: genIntradayHistory(nav, 59, 0.0008),
    dayHistory: genIntradayHistory(nav, 287, 0.0018),
  };
}

function genFlatHistory(days: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= days; i++) pts.push(parseFloat((1 + (Math.random() - 0.5) * 0.0004).toFixed(4)));
  return pts;
}

function dateLabel(daysAhead: number): string {
  const d = new Date(Date.now() + daysAhead * 86400_000);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const USDC_HISTORY = genFlatHistory(29);

// Nine fallbacks — one per (tier, window) combo, matching the live grid
// ids emitted by `buildLiveBaskets` in ./live-baskets.ts. Histories cover
// the last hour (1-min), last 24 hours (5-min) and last year (daily) so
// every chart range in the detail page works identically in offline
// mode; card sparklines slice the tail of `history`.
//
// `resolved` and `hot` are legacy fields kept only for shape-compat with
// the `Bundle` type; the UI no longer reads them because live baskets
// are built from markets filtered to `active` (so nothing is resolved)
// and the "hot" badge was dropped.
export const BUNDLES: Bundle[] = [
  // HIGH tier (≈ 90% probability)
  { id: "STHS-HIGH-SHORT", tier: 90, date: dateLabel(5),   daysLeft: 5,   nav: 0.942, issue: 0.92, change: +0.6, hot: false, resolved: 0, totalLegs: 12, ...genBundleHistories(0.942) },
  { id: "STHS-HIGH-MED",   tier: 90, date: dateLabel(60),  daysLeft: 60,  nav: 0.912, issue: 0.90, change: +0.2, hot: false, resolved: 0, totalLegs: 18, ...genBundleHistories(0.912) },
  { id: "STHS-HIGH-LONG",  tier: 90, date: dateLabel(220), daysLeft: 220, nav: 0.887, issue: 0.88, change: -0.4, hot: false, resolved: 0, totalLegs: 24, ...genBundleHistories(0.887) },

  // MID tier (≈ 25–75% probability)
  { id: "STHS-MID-SHORT",  tier: 70, date: dateLabel(6),   daysLeft: 6,   nav: 0.482, issue: 0.50, change: +2.1, hot: false, resolved: 0, totalLegs: 14, ...genBundleHistories(0.482) },
  { id: "STHS-MID-MED",    tier: 70, date: dateLabel(55),  daysLeft: 55,  nav: 0.461, issue: 0.50, change: +1.3, hot: false, resolved: 0, totalLegs: 20, ...genBundleHistories(0.461) },
  { id: "STHS-MID-LONG",   tier: 70, date: dateLabel(205), daysLeft: 205, nav: 0.438, issue: 0.50, change: -0.7, hot: false, resolved: 0, totalLegs: 22, ...genBundleHistories(0.438) },

  // LOW tier (≈ 1–12% probability — long-shot)
  { id: "STHS-LOW-SHORT",  tier: 50, date: dateLabel(5),   daysLeft: 5,   nav: 0.082, issue: 0.08, change: +4.4, hot: false, resolved: 0, totalLegs: 10, ...genBundleHistories(0.082) },
  { id: "STHS-LOW-MED",    tier: 50, date: dateLabel(60),  daysLeft: 60,  nav: 0.071, issue: 0.07, change: -1.8, hot: false, resolved: 0, totalLegs: 12, ...genBundleHistories(0.071) },
  { id: "STHS-LOW-LONG",   tier: 50, date: dateLabel(220), daysLeft: 220, nav: 0.059, issue: 0.06, change: +2.5, hot: false, resolved: 0, totalLegs: 16, ...genBundleHistories(0.059) },
];

export function bundleById(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}
