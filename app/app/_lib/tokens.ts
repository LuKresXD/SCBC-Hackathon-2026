/**
 * Shared visual tokens for the Senthos app shell.
 *
 * Everything that previously lived in the monolithic `app/app/page.tsx` as
 * top-level constants has been promoted here so every page/route can import
 * the same palette and typography.
 */

export const C = {
  bg: "#0a0e13",
  surface: "#0f1520",
  card: "#131c28",
  cardHover: "#172030",
  border: "#1a2a3a",
  borderHover: "#243a50",
  teal: "#0d9488",
  tealBg: "#042420",
  amber: "#d97706",
  amberBg: "#1c1000",
  coral: "#ea580c",
  coralBg: "#1c0a00",
  green: "#22c55e",
  greenBg: "#0a1f10",
  red: "#ef4444",
  redBg: "#1f0a0a",
  violet: "#8b5cf6",
  violetBg: "#15091c",
  blue: "#3b82f6",
  blueBg: "#0a1424",
  textPrimary: "#eef2f7",
  textSecondary: "#6b8099",
  textMuted: "#3a4f62",
} as const;

export const FS = "'DM Sans', system-ui, sans-serif";
export const FD = "'Inter', system-ui, sans-serif";
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

/**
 * Circle's devnet USDC mint. Same value the backend uses in `backend/.env`
 * as `USDC_MINT`. Override via `NEXT_PUBLIC_USDC_MINT` if we ever move to a
 * different devnet mint or to mainnet.
 */
export const USDC_MINT =
  process.env.NEXT_PUBLIC_USDC_MINT ??
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";

/** USDC has 6 decimals on both mainnet and devnet. */
export const USDC_DECIMALS = 6;

// Sandbox starting balance. Every page references this so we define it once.
export const SANDBOX_STARTING_USDC = 10_000;

/** Probability-tier colour (90 = teal, 70 = amber, 50 = coral). */
export function tc(tier: number): string {
  return tier === 90 ? C.teal : tier === 70 ? C.amber : C.coral;
}

/** Tranche colour lookup (senior = teal, mezzanine = amber, junior = coral). */
export function trancheColor(kind: "senior" | "mezzanine" | "junior"): string {
  return kind === "senior" ? C.teal : kind === "mezzanine" ? C.amber : C.coral;
}

/** Rough resolution window bucketing. */
export function tl(daysLeft: number): "This week" | "This month" | "Long term" {
  return daysLeft <= 20 ? "This week" : daysLeft <= 50 ? "This month" : "Long term";
}

export function lightenColor(hex: string, amount = 0.25): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.min(255, Math.round(r + (255 - r) * amount));
  const ng = Math.min(255, Math.round(g + (255 - g) * amount));
  const nb = Math.min(255, Math.round(b + (255 - b) * amount));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

export function darkenColor(hex: string, amount = 0.2): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  const nr = Math.max(0, Math.round(r * (1 - amount)));
  const ng = Math.max(0, Math.round(g * (1 - amount)));
  const nb = Math.max(0, Math.round(b * (1 - amount)));
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

export function fmtUsd(n: number, digits = 0): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
