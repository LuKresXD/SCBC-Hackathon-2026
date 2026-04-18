"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { C, FS, FD, EASE } from "../_lib/tokens";
import { useSandbox } from "../_lib/demo-state";

const NAV = [
  { id: "markets", label: "Markets", href: "/app" },
  { id: "basket", label: "Baskets", href: "/app" }, // sub-tab inside monolith
  { id: "tranche", label: "Tranches", href: "/app/tranche" },
  { id: "ppn", label: "PPN", href: "/app/ppn" },
  { id: "lending", label: "Lending", href: "/app/lending" },
  { id: "hedge", label: "Hedge", href: "/app/hedge" },
  { id: "portfolio", label: "Portfolio", href: "/app/portfolio" },
];

/**
 * Horizontal header used by every /app/* route except the monolith itself
 * (the monolith has its own inline header that we can't easily swap without
 * risking regressions in its tab system).
 */
export function Header({ onResetClick }: { onResetClick?: () => void }) {
  const pathname = usePathname();
  const { state } = useSandbox();
  return (
    <header
      style={{
        position: "sticky",
        top: 0,
        zIndex: 40,
        background: "rgba(10,14,19,0.78)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        borderBottom: `0.5px solid ${C.border}`,
        height: 60,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 24,
        padding: "0 28px",
      }}
    >
      <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
        <img src="/senthos_full.png" alt="Senthos" style={{ width: 26, height: 26 }} />
        <span style={{ fontSize: 15, fontWeight: 600, color: C.textPrimary, fontFamily: FD, letterSpacing: "-0.01em" }}>Senthos</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, padding: "2px 7px", borderRadius: 999, border: `0.5px solid ${C.border}`, letterSpacing: "0.04em", marginLeft: 4 }}>devnet</span>
      </Link>
      <nav style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, justifyContent: "center", height: "100%" }}>
        {NAV.map((n) => {
          const active = pathname === n.href || (n.href !== "/app" && pathname?.startsWith(n.href));
          return (
            <Link
              key={n.id}
              href={n.href}
              style={{
                position: "relative",
                padding: "18px 0",
                color: active ? C.textPrimary : C.textSecondary,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: FD,
                letterSpacing: "-0.005em",
                textDecoration: "none",
                transition: `color 0.15s ${EASE}`,
              }}
            >
              {n.label}
              {active && (
                <span style={{ position: "absolute", bottom: -1, left: 0, right: 0, height: 1.5, background: C.textPrimary, borderRadius: 2 }} />
              )}
            </Link>
          );
        })}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, fontFamily: FD }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontVariantNumeric: "tabular-nums" }}>
            ${state.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </span>
          <span style={{ fontSize: 11, color: C.textMuted, fontFamily: FS }}>USDC</span>
          {onResetClick && (
            <button
              onClick={onResetClick}
              style={{ marginLeft: 6, background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 11, fontFamily: FS, cursor: "pointer" }}
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{ minHeight: "calc(100vh - 60px)", padding: "36px 40px 60px", maxWidth: 1440, margin: "0 auto" }}>
      {children}
    </main>
  );
}
