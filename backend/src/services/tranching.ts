/**
 * Senthos tranche-pricing service.
 *
 * Given a bundle's aggregate implied probability (the NAV) and leg count, the
 * tranche engine turns the basket into three share classes with a simple
 * waterfall:
 *
 *   - senior: first ~60% of basket payout → highest odds of full pay at cost
 *   - mezzanine: next ~25% of basket payout → medium odds, medium coupon
 *   - junior: last ~15% → absorbs first losses, highest leverage on upside
 *
 * Pricing and expected-APY estimates assume leg outcomes are approximately
 * independent and Bernoulli(p) where p = bundle.nav. A light Gaussian
 * approximation (Central Limit) gives the probability that the tranche
 * attaches. Good enough for a hackathon demo; not a production pricer.
 */

export interface TrancheSpec {
  kind: "senior" | "mezzanine" | "junior";
  attach: number; // fraction of basket payout at which tranche starts paying (0..1)
  detach: number; // fraction where it caps out (0..1)
}

export interface TrancheQuote {
  kind: "senior" | "mezzanine" | "junior";
  attach: number;
  detach: number;
  pricePerToken: number; // issue price as a fraction of face value $1
  expectedYieldPct: number; // annualised to horizon, simple interest
  attachProbability: number; // chance tranche gets ANY payout
  fullPayProbability: number; // chance tranche pays face value in full
  faceValue: number; // always $1 per token
  recommendedApr: number; // coupon for the senior, upside multiple for junior
}

export const DEFAULT_TRANCHES: TrancheSpec[] = [
  { kind: "senior", attach: 0.0, detach: 0.6 },
  { kind: "mezzanine", attach: 0.6, detach: 0.85 },
  { kind: "junior", attach: 0.85, detach: 1.0 },
];

function normalCdf(z: number): number {
  // Abramowitz & Stegun approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-(z * z) / 2);
  const p =
    d *
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/**
 * Approximate the probability that a basket of n legs with implied probability
 * `p` each produces *at least* `fraction` of its maximum payout. Uses a
 * Normal approximation to the Binomial; fine for n >= 8 which is the lower
 * bound we care about.
 */
function basketPayoutCdf(p: number, n: number, fraction: number): number {
  const mu = n * p;
  const variance = n * p * (1 - p);
  const sigma = Math.max(0.0001, Math.sqrt(variance));
  const thresholdLegsPaid = fraction * n;
  const z = (thresholdLegsPaid - mu) / sigma;
  return 1 - normalCdf(z); // P[legsPaid >= thresholdLegsPaid]
}

export function quoteTranches(opts: {
  bundleNav: number; // implied avg leg probability; also basket NAV at issuance
  totalLegs: number; // number of legs in the basket
  horizonDays: number; // days to resolution
  tranches?: TrancheSpec[];
}): TrancheQuote[] {
  const { bundleNav, totalLegs, horizonDays } = opts;
  const specs = opts.tranches ?? DEFAULT_TRANCHES;
  return specs.map((s) => {
    // Probability the basket pays enough to *fully* fund this tranche:
    const fullPayProbability = basketPayoutCdf(bundleNav, Math.max(8, totalLegs), s.detach);
    // Probability the basket pays at least enough to start paying the tranche:
    const attachProbability = basketPayoutCdf(bundleNav, Math.max(8, totalLegs), s.attach);
    // Expected value of tranche payout per $1 of face:
    const ev =
      0.5 * (attachProbability + fullPayProbability); // trapezoidal between attach and detach
    // Price: fair value with a small hackathon-friendly premium for seniors and
    // a discount for juniors, clamped so nothing is <0.02 or >0.98.
    const margin = s.kind === "senior" ? 0.98 : s.kind === "mezzanine" ? 0.92 : 0.85;
    const pricePerToken = Math.min(0.98, Math.max(0.02, ev * margin));
    // Annualised yield if tranche redeems at face:
    const periodReturn = 1 / pricePerToken - 1;
    const expectedYieldPct = (periodReturn * 365) / Math.max(1, horizonDays) * 100;
    const recommendedApr = expectedYieldPct; // rename for UI clarity
    return {
      kind: s.kind,
      attach: s.attach,
      detach: s.detach,
      pricePerToken: +pricePerToken.toFixed(4),
      expectedYieldPct: +expectedYieldPct.toFixed(2),
      attachProbability: +attachProbability.toFixed(4),
      fullPayProbability: +fullPayProbability.toFixed(4),
      faceValue: 1,
      recommendedApr: +recommendedApr.toFixed(2),
    };
  });
}
