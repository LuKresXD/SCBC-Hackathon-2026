/**
 * Shared visual tokens for the Senthos app shell.
 * Orbital dark-space theme — matches the landing page aesthetic.
 */
export const C = {
  bg: "#05080c",
  surface: "#0a0f18",
  card: "#0d131c",
  cardHover: "#121a26",
  border: "rgba(45, 212, 191, 0.08)",
  borderHover: "rgba(45, 212, 191, 0.18)",
  teal: "#0d9488",
  tealLight: "#2dd4bf",
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

export const FS = "'Inter', system-ui, sans-serif";
export const FD = "'Inter', system-ui, sans-serif";
export const FM = "'JetBrains Mono', 'SF Mono', Menlo, monospace";
export const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
export const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:3001";

export function tc(tier: number): string {
  return tier === 90 ? C.teal : tier === 70 ? C.amber : C.coral;
}

export function trancheColor(kind: "senior" | "mezzanine" | "junior"): string {
  return kind === "senior" ? C.teal : kind === "mezzanine" ? C.amber : C.coral;
}

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