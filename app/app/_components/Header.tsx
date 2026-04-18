"use client";

import React, { useContext } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { C, FM, FD, FS, EASE } from "../_lib/tokens";
import { useSandbox } from "../_lib/demo-state";

function useSandboxSafe() {
  try {
    return useSandbox();
  } catch {
    return { state: { usdc: 0 }, dispatch: () => {} };
  }
}

const NAV_LEFT = [
  { id: "home",     label: "Home",     href: "/" },
  { id: "markets",  label: "Markets",  href: "/app" },
  { id: "basket",   label: "Constellations",  href: "/app/basket" },
  { id: "tranche",  label: "Tranches", href: "/app/tranche" },
  { id: "ppn",      label: "PPN",      href: "/app/ppn" },
  { id: "lending",  label: "Lending",  href: "/app/lending" },
  { id: "hedge",    label: "Hedge",    href: "/app/hedge" },
];

export function Header({ onResetClick }: { onResetClick?: () => void }) {
  const pathname = usePathname();
  const { state } = useSandboxSafe();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        @keyframes senthosPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
        .senthos-nav-link:hover { color: ${C.textPrimary} !important; }
        .senthos-portfolio-btn:hover {
          background: rgba(45, 212, 191, 0.15) !important;
          border-color: rgba(45, 212, 191, 0.5) !important;
        }
      `}</style>
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(5, 8, 12, 0.72)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `0.5px solid rgba(45, 212, 191, 0.08)`,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        gap: 20,
      }}>

        {/* LEFT: logo + home link + nav tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, flex: 1 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none", flexShrink: 0 }}>
            <Image src="/senthos_full.png" alt="Senthos" width={28} height={28} priority />
            <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, fontFamily: FD, letterSpacing: "0.1em" }}>
              SENTHOS
            </span>
          </Link>

          {/* Nav tabs */}
          <nav style={{ display: "flex", alignItems: "center", gap: 2 }}>
            {NAV_LEFT.map((n) => {
              const active = n.href === "/"
                ? pathname === "/"
                : pathname === n.href || (n.href !== "/app" && pathname?.startsWith(n.href));
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  className="senthos-nav-link"
                  style={{
                    padding: "7px 14px",
                    borderRadius: 100,
                    fontSize: 13,
                    fontWeight: 500,
                    fontFamily: FD,
                    letterSpacing: "0.01em",
                    textDecoration: "none",
                    color: active ? C.tealLight : C.textSecondary,
                    background: active ? "rgba(45, 212, 191, 0.1)" : "transparent",
                    border: active ? "0.5px solid rgba(45, 212, 191, 0.25)" : "0.5px solid transparent",
                    boxShadow: active ? "0 0 20px rgba(45, 212, 191, 0.12)" : "none",
                    transition: `all 0.25s ${EASE}`,
                  }}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* RIGHT: Portfolio + demo balance + back to home */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>

          {/* Demo balance */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "7px 12px", borderRadius: 100,
            background: "rgba(45, 212, 191, 0.06)",
            border: "0.5px solid rgba(45, 212, 191, 0.2)",
          }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.tealLight, boxShadow: `0 0 8px ${C.tealLight}`, animation: "senthosPulse 2s ease-in-out infinite", display: "inline-block" }} />
            <span style={{ fontSize: 11, color: C.tealLight, fontFamily: FM, letterSpacing: "0.1em", fontWeight: 500 }}>DEMO</span>
            <span style={{ fontSize: 11, color: C.textSecondary, fontFamily: FM }}>
              ${state.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
            {onResetClick && (
              <button
                onClick={onResetClick}
                style={{ background: "none", border: "none", padding: 0, color: C.textMuted, fontSize: 10, fontFamily: FM, cursor: "pointer", marginLeft: 2, letterSpacing: "0.06em" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = C.textSecondary}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = C.textMuted}
              >
                ↻
              </button>
            )}
          </div>

          {/* Portfolio — comfort button */}
          {(() => {
            const active = pathname === "/app/portfolio";
            return (
              <Link
                href="/app/portfolio"
                className="senthos-portfolio-btn"
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: active ? "8px 18px" : "7px 16px 7px 13px",
                  borderRadius: 100,
                  fontSize: 13,
                  fontWeight: active ? 600 : 500,
                  fontFamily: FD,
                  letterSpacing: "0.01em",
                  textDecoration: "none",
                  color: active ? "#000" : C.tealLight,
                  background: active
                    ? `linear-gradient(135deg, ${C.teal} 0%, ${C.tealLight} 100%)`
                    : "rgba(45, 212, 191, 0.08)",
                  border: active ? "none" : "0.5px solid rgba(45, 212, 191, 0.3)",
                  boxShadow: active
                    ? "0 0 0 1px rgba(45, 212, 191, 0.4), 0 6px 20px rgba(45, 212, 191, 0.3)"
                    : "0 0 16px rgba(45, 212, 191, 0.08)",
                  transition: `all 0.25s ${EASE}`,
                }}
              >
                {!active && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.tealLight, boxShadow: `0 0 6px ${C.tealLight}`, flexShrink: 0 }} />
                )}
                Portfolio
              </Link>
            );
          })()}
        </div>
      </header>
    </>
  );
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: "calc(100vh - 64px)",
      padding: "36px 40px 60px",
      maxWidth: 1440,
      margin: "0 auto",
      position: "relative",
    }}>
      {/* Subtle starfield-esque ambient glow */}
      <div style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(13, 148, 136, 0.08) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </main>
  );
}