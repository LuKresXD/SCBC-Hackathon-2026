"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { C, FM, FD, BACKEND_URL } from "../_lib/tokens";

const ConnectButton = dynamic(
  async () => (await import("./ConnectButton")).ConnectButton,
  { ssr: false },
);

const NAV_LEFT = [
  { id: "markets",  label: "Markets",        href: "/app" },
  { id: "basket",   label: "Constellations", href: "/app/basket" },
  { id: "tranche",  label: "Tranches",       href: "/app/tranche" },
  { id: "ppn",      label: "PPN",            href: "/app/ppn" },
  { id: "lending",  label: "Lending",        href: "/app/lending" },
  { id: "hedge",    label: "Hedge",          href: "/app/hedge" },
];

type OnchainStatus = {
  cluster: string;
  programs: {
    vault: { deployed: boolean; executable: boolean };
    ppn:   { deployed: boolean; executable: boolean };
  };
};

type LiveStats = {
  cluster: string | null;
  programsHealthy: number;    // 0..2
  programsTotal: number;      // always 2
  bundleCount: number | null;
  marketCount: number | null;
  rpcError: string | null;
};

function useLiveStats(): LiveStats {
  const [stats, setStats] = useState<LiveStats>({
    cluster: null,
    programsHealthy: 0,
    programsTotal: 2,
    bundleCount: null,
    marketCount: null,
    rpcError: null,
  });

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const [statusRes, bundlesRes, marketsRes] = await Promise.all([
          fetch(`${BACKEND_URL}/api/onchain/status`, { cache: "no-store" }),
          fetch(`${BACKEND_URL}/api/bundles`, { cache: "no-store" }),
          fetch(`${BACKEND_URL}/api/markets/curated?limit=1&overfetch=500`, { cache: "no-store" }),
        ]);
        const status = (await statusRes.json()) as OnchainStatus;
        const bundles = (await bundlesRes.json()) as unknown[];
        const markets = (await marketsRes.json()) as { count?: number; total_after_filter?: number; markets?: unknown[] };
        if (cancelled) return;
        const healthy =
          (status.programs?.vault?.deployed && status.programs?.vault?.executable ? 1 : 0) +
          (status.programs?.ppn?.deployed && status.programs?.ppn?.executable ? 1 : 0);
        const marketCount =
          typeof markets?.count === "number"
            ? markets.count
            : typeof markets?.total_after_filter === "number"
              ? markets.total_after_filter
              : Array.isArray(markets?.markets)
                ? markets.markets.length
                : null;
        setStats({
          cluster: status.cluster ?? null,
          programsHealthy: healthy,
          programsTotal: 2,
          bundleCount: Array.isArray(bundles) ? bundles.length : null,
          marketCount,
          rpcError: null,
        });
      } catch (e) {
        if (!cancelled) setStats((s) => ({ ...s, rpcError: (e as Error).message }));
      }
    }
    pull();
    const iv = setInterval(pull, 20000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  return stats;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ fontSize: 10, fontFamily: FM, letterSpacing: "0.1em", color: C.textSecondary, whiteSpace: "nowrap" }}>
      <span style={{ color: C.textMuted }}>{label} </span>
      <span style={{ color: C.textPrimary, fontWeight: 500 }}>{value}</span>
    </span>
  );
}

function OnchainStatusPill() {
  const stats = useLiveStats();
  const healthy = stats.programsHealthy === stats.programsTotal;
  const dotColor = stats.rpcError ? C.red : healthy ? C.tealLight : C.amber;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "6px 12px",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: dotColor,
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      {stats.rpcError ? (
        <Stat label="RPC" value="OFFLINE" />
      ) : (
        <>
          <Stat label="NET" value={(stats.cluster ?? "—").toUpperCase()} />
          <Stat label="PROGRAMS" value={`${stats.programsHealthy}/${stats.programsTotal}`} />
          <Stat label="BUNDLES" value={stats.bundleCount == null ? "—" : String(stats.bundleCount)} />
          <Stat label="MARKETS" value={stats.marketCount == null ? "—" : String(stats.marketCount)} />
        </>
      )}
    </div>
  );
}

export function Header() {
  const pathname = usePathname();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@200;300;400;500;600;700&family=JetBrains+Mono:wght@300;400;500&display=swap');
        .senthos-nav-link:hover { color: ${C.textPrimary} !important; }
        /* Flatten the wallet-adapter button chrome to match the rest of the header. */
        .wallet-adapter-button {
          height: 32px !important;
          padding: 0 14px !important;
          border-radius: 6px !important;
          background: transparent !important;
          border: 0.5px solid ${C.border} !important;
          color: ${C.textPrimary} !important;
          font-family: 'Inter', system-ui, sans-serif !important;
          font-size: 12px !important;
          font-weight: 500 !important;
          letter-spacing: 0.02em !important;
          box-shadow: none !important;
          line-height: 32px !important;
        }
        .wallet-adapter-button:not([disabled]):hover {
          background: ${C.surface} !important;
          border-color: ${C.borderHover} !important;
        }
        .wallet-adapter-button-trigger {
          background: transparent !important;
        }
        .wallet-adapter-button-start-icon,
        .wallet-adapter-button-end-icon {
          margin: 0 6px 0 0 !important;
        }
      `}</style>
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(5, 8, 12, 0.82)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        borderBottom: `0.5px solid ${C.border}`,
        height: 56,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 24px",
        gap: 20,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24, flex: 1, minWidth: 0 }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", flexShrink: 0 }}>
            <Image src="/senthos_full.png" alt="Senthos" width={22} height={22} priority />
            <span style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, letterSpacing: "0.14em" }}>
              SENTHOS
            </span>
          </Link>

          <nav style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {NAV_LEFT.map((n) => {
              const active = pathname === n.href || (n.href !== "/app" && pathname?.startsWith(n.href));
              return (
                <Link
                  key={n.id}
                  href={n.href}
                  className="senthos-nav-link"
                  style={{
                    position: "relative",
                    padding: "4px 0",
                    fontSize: 13,
                    fontWeight: 400,
                    fontFamily: FD,
                    letterSpacing: "0.01em",
                    textDecoration: "none",
                    color: active ? C.textPrimary : C.textSecondary,
                    transition: "color 0.15s linear",
                  }}
                >
                  {n.label}
                  {active && (
                    <span
                      style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        bottom: -18,
                        height: 1,
                        background: C.tealLight,
                      }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <OnchainStatusPill />
          <ConnectButton variant="header" />
        </div>
      </header>
    </>
  );
}

export function PageFrame({ children }: { children: React.ReactNode }) {
  return (
    <main style={{
      minHeight: "calc(100vh - 56px)",
      padding: "36px 40px 60px",
      maxWidth: 1440,
      margin: "0 auto",
      position: "relative",
    }}>
      <div style={{
        position: "fixed",
        inset: 0,
        background: "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(13, 148, 136, 0.06) 0%, transparent 70%)",
        pointerEvents: "none",
        zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {children}
      </div>
    </main>
  );
}
