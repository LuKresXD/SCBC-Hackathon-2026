/**
 * Client-side tranche quote helper.
 *
 * Mirrors `backend/src/services/tranching.ts` so the tranche pages can compute
 * quotes locally against the seed bundles without a backend round-trip. This
 * keeps the sandbox fully offline-capable.
 */

export type TrancheKind = "senior" | "mezzanine" | "junior";

export interface TrancheQuote {
  kind: TrancheKind;
  attach: number;
  detach: number;
  pricePerToken: number;
  expectedYieldPct: number;
  attachProbability: number;
  fullPayProbability: number;
}

const SPECS: Array<{ kind: TrancheKind; attach: number; detach: number }> = [
  { kind: "senior", attach: 0, detach: 0.6 },
  { kind: "mezzanine", attach: 0.6, detach: 0.85 },
  { kind: "junior", attach: 0.85, detach: 1 },
];

function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

function basketPayoutCdf(p: number, n: number, fraction: number): number {
  const mu = n * p;
  const sigma = Math.max(0.0001, Math.sqrt(n * p * (1 - p)));
  const z = (fraction * n - mu) / sigma;
  return 1 - normalCdf(z);
}

export function quoteTranchesLocal(nav: number, totalLegs: number, horizonDays: number): TrancheQuote[] {
  const n = Math.max(8, totalLegs);
  return SPECS.map((s) => {
    const fullPay = basketPayoutCdf(nav, n, s.detach);
    const attach = basketPayoutCdf(nav, n, s.attach);
    const ev = 0.5 * (attach + fullPay);
    const margin = s.kind === "senior" ? 0.98 : s.kind === "mezzanine" ? 0.92 : 0.85;
    const price = Math.min(0.98, Math.max(0.02, ev * margin));
    const periodReturn = 1 / price - 1;
    const yieldPct = (periodReturn * 365) / Math.max(1, horizonDays) * 100;
    return {
      kind: s.kind,
      attach: s.attach,
      detach: s.detach,
      pricePerToken: +price.toFixed(4),
      expectedYieldPct: +yieldPct.toFixed(2),
      attachProbability: +attach.toFixed(4),
      fullPayProbability: +fullPay.toFixed(4),
    };
  });
}
