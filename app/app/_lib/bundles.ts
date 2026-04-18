/**
 * Seeded basket universe for the sandbox.
 *
 * These 15 STHS baskets span three probability tiers (90 / 70 / 50) across
 * five resolution dates. The numbers are the same as the original monolith
 * so portfolio state migrates 1:1.
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
  history: number[];
};

function genHistory(tier: number, days: number, finalNav: number): number[] {
  const base = tier / 100;
  const pts: number[] = [];
  let v = base;
  for (let i = 0; i < days; i++) {
    const drift = (finalNav - base) * (i / days) * 0.6;
    const noise = (Math.random() - 0.48) * 0.018;
    const spike = Math.random() < 0.08 ? (Math.random() - 0.5) * 0.03 : 0;
    v = base + drift + noise + spike;
    v = Math.max(tier / 100 - 0.08, Math.min(tier / 100 + 0.12, v));
    pts.push(parseFloat(v.toFixed(4)));
  }
  pts.push(finalNav);
  return pts;
}

function genFlatHistory(days: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= days; i++) pts.push(parseFloat((1 + (Math.random() - 0.5) * 0.0004).toFixed(4)));
  return pts;
}

export const USDC_HISTORY = genFlatHistory(29);

export const BUNDLES: Bundle[] = [
  { id: "STHS-90-0430", tier: 90, date: "Apr 30, 2025", daysLeft: 15, nav: 0.913, issue: 0.9, change: +1.4, hot: true, resolved: 3, totalLegs: 10, history: genHistory(90, 29, 0.913) },
  { id: "STHS-90-0515", tier: 90, date: "May 15, 2025", daysLeft: 30, nav: 0.908, issue: 0.9, change: +0.9, hot: true, resolved: 1, totalLegs: 12, history: genHistory(90, 29, 0.908) },
  { id: "STHS-90-0601", tier: 90, date: "Jun 1, 2025", daysLeft: 47, nav: 0.895, issue: 0.9, change: -0.6, hot: false, resolved: 0, totalLegs: 10, history: genHistory(90, 29, 0.895) },
  { id: "STHS-90-0701", tier: 90, date: "Jul 1, 2025", daysLeft: 77, nav: 0.901, issue: 0.9, change: +0.1, hot: false, resolved: 0, totalLegs: 11, history: genHistory(90, 29, 0.901) },
  { id: "STHS-90-1001", tier: 90, date: "Oct 1, 2025", daysLeft: 169, nav: 0.888, issue: 0.9, change: -0.3, hot: false, resolved: 0, totalLegs: 10, history: genHistory(90, 29, 0.888) },
  { id: "STHS-70-0430", tier: 70, date: "Apr 30, 2025", daysLeft: 15, nav: 0.724, issue: 0.7, change: +3.4, hot: true, resolved: 4, totalLegs: 10, history: genHistory(70, 29, 0.724) },
  { id: "STHS-70-0515", tier: 70, date: "May 15, 2025", daysLeft: 30, nav: 0.698, issue: 0.7, change: -1.2, hot: false, resolved: 2, totalLegs: 11, history: genHistory(70, 29, 0.698) },
  { id: "STHS-70-0601", tier: 70, date: "Jun 1, 2025", daysLeft: 47, nav: 0.712, issue: 0.7, change: +1.7, hot: false, resolved: 1, totalLegs: 10, history: genHistory(70, 29, 0.712) },
  { id: "STHS-70-0701", tier: 70, date: "Jul 1, 2025", daysLeft: 77, nav: 0.685, issue: 0.7, change: -2.1, hot: false, resolved: 0, totalLegs: 12, history: genHistory(70, 29, 0.685) },
  { id: "STHS-70-1001", tier: 70, date: "Oct 1, 2025", daysLeft: 169, nav: 0.703, issue: 0.7, change: +0.4, hot: false, resolved: 0, totalLegs: 10, history: genHistory(70, 29, 0.703) },
  { id: "STHS-50-0430", tier: 50, date: "Apr 30, 2025", daysLeft: 15, nav: 0.531, issue: 0.5, change: +6.2, hot: true, resolved: 5, totalLegs: 10, history: genHistory(50, 29, 0.531) },
  { id: "STHS-50-0515", tier: 50, date: "May 15, 2025", daysLeft: 30, nav: 0.488, issue: 0.5, change: -2.4, hot: false, resolved: 1, totalLegs: 10, history: genHistory(50, 29, 0.488) },
  { id: "STHS-50-0601", tier: 50, date: "Jun 1, 2025", daysLeft: 47, nav: 0.502, issue: 0.5, change: +0.4, hot: false, resolved: 0, totalLegs: 11, history: genHistory(50, 29, 0.502) },
  { id: "STHS-50-0701", tier: 50, date: "Jul 1, 2025", daysLeft: 77, nav: 0.478, issue: 0.5, change: -4.4, hot: false, resolved: 0, totalLegs: 10, history: genHistory(50, 29, 0.478) },
  { id: "STHS-50-1001", tier: 50, date: "Oct 1, 2025", daysLeft: 169, nav: 0.515, issue: 0.5, change: +3.0, hot: false, resolved: 0, totalLegs: 10, history: genHistory(50, 29, 0.515) },
];

export function bundleById(id: string): Bundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}
