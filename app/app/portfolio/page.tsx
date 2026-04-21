"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { Header, PageFrame } from "../_components/Header";
import { SvgDonut } from "../_components/charts";
import { C, FS, FD, FM, EASE, tc, trancheColor, fmtUsd } from "../_lib/tokens";
import { useLiveBaskets } from "../_lib/use-live-baskets";
import { bundleById } from "../_lib/bundles";
import { useSandbox, type BasketPosition } from "../_lib/demo-state";
import { useUsdcBalance, useWalletSigner } from "../_lib/wallet-bridge";
import { fetchBasketPortfolio } from "../_lib/portfolio-client";
import { fetchPpnPortfolio, ppnRedeem, PpnError, type PpnPortfolioEntry } from "../_lib/ppn-client";
import { redeemFromBundle, DepositError } from "../_lib/deposit-client";
import {
  groupVirtualByUiBundle,
  clearVirtualPositionsByUiBundleId,
  type GroupedVirtualPosition,
} from "../_lib/virtual-positions";
import { Personalization } from "./_personalization";

type View = "positions" | "personalization";

export default function PortfolioPage() {
  const { state, totals, dispatch } = useSandbox();
  const { connected, publicKey } = useWallet();
  const usdc = useUsdcBalance();
  const walletSigner = useWalletSigner();
  const [redeemBusy, setRedeemBusy] = useState<string | null>(null);
  const [redeemError, setRedeemError] = useState<Record<string, string>>({});
  const basketState = useLiveBaskets();
  // Cash line is the real on-chain USDC in the connected wallet. When
  // disconnected we fall back to 0 so the donut + positions list simply
  // omit the cash slice instead of flashing a stale sandbox counter.
  const liveUsdc = connected ? usdc.uiAmount : 0;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renderNow, setRenderNow] = useState<number>(() => Date.now());
  const [view, setView] = useState<View>("positions");
  useEffect(() => {
    const t = setInterval(() => setRenderNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // PPN accrued yield, ticking with renderNow so the top-of-page P&L moves
  // in real time. Matches the per-vault card math (`principal * apy% / 365`
  // capped at maturity). This is what makes PPN positions contribute to
  // unrealized P&L — the demo-state totals only know about basket drift.
  const ppnAccruedYield = state.ppnVaults.reduce((sum, v) => {
    const elapsedDays = Math.max(0, (renderNow - v.createdAt) / 86_400_000);
    const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsedDays, v.maturityDays);
    return sum + accrued;
  }, 0);
  // Tranche accrued yield. `totals.trancheValue` is qty*avgCost=principal (frozen
  // at entry) because the backend doesn't mark tranches to market — so without
  // this term the Tranches row and the headline P&L would never move, no matter
  // how long the $16 of tranches had been held. Straight-line accrual against
  // `estimated_apy` is the same approximation used for PPNs, capped at maturity.
  const trancheAccruedYield = state.tranchePositions.reduce((sum, p) => {
    if (p.apy == null || p.createdAt == null || p.maturityDays == null) return sum;
    const principal = p.qty * p.avgCost;
    const elapsedDays = Math.max(0, (renderNow - p.createdAt) / 86_400_000);
    const accrued = principal * (p.apy / 100 / 365) * Math.min(elapsedDays, p.maturityDays);
    return sum + accrued;
  }, 0);
  // Basket drift using live NAV when available. `totals.unrealizedPnl` calls
  // bundleById which misses backend UUIDs → falls back to navHint captured at
  // hydrate time (stale). This pass prefers live basketState so drift actually
  // ticks instead of freezing between hydrates.
  //
  // NOTE: `totals.basketValue` in demo-state already sums qty*nav across ALL
  // rows (including duplicate-bundle rows). If we also summed drift across
  // duplicates we'd be inflating vs totals.basketValue. We iterate the raw
  // array (not deduped) so the add stays consistent with totals.basketValue.
  const basketDriftLive = state.basketPositions.reduce((sum, p) => {
    let nav: number | undefined;
    if (basketState.status === "ok") {
      nav = basketState.baskets.find((b) => b.id === p.bundleId)?.nav;
    }
    if (nav == null) nav = bundleById(p.bundleId)?.nav;
    if (nav == null) nav = p.navHint;
    if (nav == null) return sum;
    return sum + p.qty * (nav - p.avgCost);
  }, 0);
  // Top-line value uses the live wallet USDC + live basket drift + PPN/tranche
  // accrued yield so the headline TOTAL VALUE matches the breakdown rows and
  // the donut center down to the penny. Missing `basketDriftLive` here was
  // what made the header show $49.93 while "$25 + $4 + $16 + $5" summed to $50.
  const displayTotal =
    liveUsdc +
    totals.basketValue +
    basketDriftLive +
    totals.trancheValue +
    totals.ppnValue +
    ppnAccruedYield +
    trancheAccruedYield +
    totals.lendValue -
    totals.loanDebt;
  const displayPnl = basketDriftLive + ppnAccruedYield + trancheAccruedYield;

  // Hydrate basket positions from Supabase whenever the wallet connects
  // or changes. The reducer is in-memory only, so without this the portfolio
  // tab would look empty after any browser reload even when the user has
  // on-chain deposits in the DB.
  const hydratePortfolio = React.useCallback(async () => {
    if (!connected || !publicKey) return;
    const wallet = publicKey.toBase58();
    await Promise.allSettled([
      fetchBasketPortfolio(wallet).then((positions) =>
        dispatch({ type: "basket/hydrate", positions }),
      ),
      fetchPpnPortfolio(wallet).then((portfolio) => {
        // A vault is a tranche if ANY of the tranche indicators are set.
        // The original predicate required both tranche_kind AND price_per_token;
        // when Supabase's retry-strip drops either column (older schemas) a real
        // tranche row shows `tranche_kind=null` and ends up misclassified as a
        // PPN — the friend's "tranches are appearing as PPN vaults" bug. Any
        // single tranche indicator being present is enough signal.
        const looksLikeTranche = (v: PpnPortfolioEntry): boolean =>
          v.tranche_kind != null ||
          v.price_per_token != null ||
          v.tranche_attach != null ||
          v.tranche_detach != null;

        // APY normalization: the backend sends `estimated_apy` as a 0..1
        // fraction (e.g. 0.08 for 8%). The PPN + portfolio cards expect a
        // percentage (e.g. 8). Multiplying by 100 when apy <= 1 lines the two
        // conventions up; values > 1 are already in percentage form.
        const apyPct = (apy: number): number => (apy <= 1 ? apy * 100 : apy);

        const ppnVaults = portfolio.vaults
          .filter((v) => !looksLikeTranche(v))
          .map((v) => ({
            id: v.vault_id,
            bundleId: v.bundle_id,
            principal: v.principal_usdc,
            basketAmount: v.yield_deployed_usdc,
            apy: apyPct(v.estimated_apy),
            createdAt: new Date(v.created_at).getTime(),
            maturityDays: v.days_elapsed + v.days_remaining,
          }));

        // Tranche hydration: when `price_per_token` is missing we fall back to
        // $1.00 issue price so the row still shows up as a tranche (rather
        // than vanishing) while not miscounting qty. The card reads
        // qty * avgCost, so a fallback of 1.0 preserves notional = principal.
        const tranchePositions = portfolio.vaults
          .filter(looksLikeTranche)
          .map((v) => {
            const pricePerToken =
              v.price_per_token && v.price_per_token > 0 ? v.price_per_token : 1;
            const createdMs = new Date(v.created_at).getTime();
            const maturityDays = v.days_elapsed + v.days_remaining;
            const maturityMs = createdMs + maturityDays * 86_400_000;
            return {
              bundleId: v.bundle_id,
              kind: (v.tranche_kind ?? "senior") as "senior" | "mezzanine" | "junior",
              qty: v.principal_usdc / pricePerToken,
              avgCost: pricePerToken,
              vaultId: v.vault_id,
              maturityAt: maturityMs,
              apy: apyPct(v.estimated_apy),
              createdAt: createdMs,
              maturityDays,
            };
          });
        dispatch({ type: "ppn/hydrate", vaults: ppnVaults });
        dispatch({ type: "tranche/hydrate", positions: tranchePositions });
      }),
    ]);
  }, [connected, publicKey, dispatch]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await hydratePortfolio();
    })();
    return () => {
      cancelled = true;
    };
  }, [hydratePortfolio]);

  async function handleRedeem(bundleId: string, uiBundleId: string, tokens: number) {
    if (!connected || !publicKey) return;
    setRedeemError((prev) => {
      const next = { ...prev };
      delete next[bundleId];
      return next;
    });
    setRedeemBusy(bundleId);
    try {
      await redeemFromBundle({ wallet: walletSigner, bundleId, amountTokens: tokens });
      clearVirtualPositionsByUiBundleId(publicKey.toBase58(), bundleId, uiBundleId);
      await hydratePortfolio();
      void usdc.refresh();
    } catch (err) {
      const msg =
        err instanceof DepositError
          ? err.message
          : err instanceof Error
            ? /user rejected/i.test(err.message)
              ? "Transaction was rejected in your wallet."
              : err.message
            : String(err);
      setRedeemError((prev) => ({ ...prev, [bundleId]: msg }));
    } finally {
      setRedeemBusy(null);
    }
  }

  /**
   * Redeem a PPN or tranche position. Both ride the `initialize_note` rail so
   * a single `ppnRedeem` call handles both. When `vaultId` is known we pass
   * it directly (unambiguous); otherwise we fall back to (bundleId, wallet)
   * which the backend resolves via `getActivePPNVault`.
   */
  async function handleRedeemPpn(rowKey: string, opts: { vaultId?: string; bundleId?: string }) {
    if (!connected || !publicKey) return;
    setRedeemError((prev) => {
      const next = { ...prev };
      delete next[rowKey];
      return next;
    });
    setRedeemBusy(rowKey);
    try {
      await ppnRedeem({
        wallet: walletSigner,
        vaultId: opts.vaultId,
        bundleId: opts.bundleId,
      });
      await hydratePortfolio();
      void usdc.refresh();
    } catch (err) {
      const msg =
        err instanceof PpnError
          ? err.message
          : err instanceof Error
            ? /user rejected/i.test(err.message)
              ? "Transaction was rejected in your wallet."
              : err.message
            : String(err);
      setRedeemError((prev) => ({ ...prev, [rowKey]: msg }));
    } finally {
      setRedeemBusy(null);
    }
  }

  // Live-first basket metadata lookup: if the live pipeline has this
  // id we use the live NAV so open positions track the real feed, and
  // fall back to the seed Bundle only when the live feed doesn't have
  // coverage for that id (offline mode, missing live row, etc.).
  const resolveBasket = (id: string) => {
    if (basketState.status === "ok") {
      const live = basketState.baskets.find((b) => b.id === id);
      if (live) {
        return {
          id: live.id,
          tier: live.tier,
          nav: live.nav,
        };
      }
    }
    const seed = bundleById(id);
    return seed
      ? { id: seed.id, tier: seed.tier, nav: seed.nav }
      : null;
  };

  // Live row values — match the breakdown rows below so the donut slices,
  // the percentages, and the headline all add up. Using the raw `totals.*`
  // here was the source of the "rows sum ≠ headline" discrepancy.
  const donutBasketValue = totals.basketValue + basketDriftLive;
  const donutTrancheValue = totals.trancheValue + trancheAccruedYield;
  const donutPpnValue = totals.ppnValue + ppnAccruedYield;
  const donutData: Array<{ id: string; value: number; color: string }> = [
    ...(liveUsdc > 0 ? [{ id: "cash", value: liveUsdc, color: "#4a5a6a" }] : []),
    ...(donutBasketValue > 0 ? [{ id: "baskets", value: donutBasketValue, color: C.teal }] : []),
    ...(donutTrancheValue > 0 ? [{ id: "tranches", value: donutTrancheValue, color: C.amber }] : []),
    ...(donutPpnValue > 0 ? [{ id: "ppn", value: donutPpnValue, color: C.violet }] : []),
    ...(totals.lendValue > 0 ? [{ id: "lending", value: totals.lendValue, color: C.blue }] : []),
  ];
  const empty = donutData.length === 0;

  // Match active slice color for corona glow
  const activeColor = activeId ? donutData.find(d => d.id === activeId)?.color : null;

  const donutSize = 300;
  const systemSize = 600;

  return (
    <>
      <style>{`
        @keyframes senthosOrbitSlow { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes senthosOrbitRev  { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        .senthos-orbit-slow { animation: senthosOrbitSlow 80s linear infinite; }
        .senthos-orbit-med  { animation: senthosOrbitRev 120s linear infinite; }
        .senthos-orbit-fast { animation: senthosOrbitSlow 160s linear infinite; }
      `}</style>
      <Header />
      <PageFrame>
        <div style={{ marginBottom: 10, position: "relative", paddingBottom: 12, borderBottom: "0.5px solid rgba(45, 212, 191, 0.1)" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: 140, background: "radial-gradient(ellipse at top right, rgba(45, 212, 191, 0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
          {/* Segmented Positions / Personalization tab — top-right of the header */}
          <div style={{
            position: "absolute",
            top: 0,
            right: 0,
            zIndex: 3,
            display: "flex",
            gap: 2,
            padding: 3,
            background: "rgba(8, 12, 20, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            borderRadius: 10,
            backdropFilter: "blur(10px)",
          }}>
            {([
              { id: "positions",       label: "Positions" },
              { id: "personalization", label: "Personalization" },
            ] as const).map((t) => {
              const active = view === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setView(t.id)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    padding: "8px 14px",
                    borderRadius: 7,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: FD,
                    fontSize: 12,
                    fontWeight: active ? 500 : 400,
                    letterSpacing: "0.02em",
                    background: active ? "rgba(45, 212, 191, 0.12)" : "transparent",
                    color: active ? C.tealLight : C.textSecondary,
                    transition: `color 0.15s ${EASE}, background 0.15s ${EASE}`,
                  }}
                  onMouseEnter={(e) => {
                    if (active) return;
                    (e.currentTarget as HTMLElement).style.color = C.textPrimary;
                  }}
                  onMouseLeave={(e) => {
                    if (active) return;
                    (e.currentTarget as HTMLElement).style.color = C.textSecondary;
                  }}
                >
                  {t.id === "personalization" && (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" />
                    </svg>
                  )}
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
            <span style={{ width: 18, height: 1, background: "#2dd4bf", opacity: 0.6 }} />
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.22em", color: "#2dd4bf", fontWeight: 500 }}>
              {view === "positions" ? "PORTFOLIO" : "PORTFOLIO · AI"}
            </span>
            <span style={{ width: 18, height: 1, background: "#2dd4bf", opacity: 0.6 }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 200, color: C.textPrimary, fontFamily: FD, marginBottom: 6, letterSpacing: "-0.02em", position: "relative" }}>
            {view === "positions" ? (
              <>Your <span style={{ fontWeight: 500, background: "linear-gradient(90deg, #2dd4bf 0%, #a5f3fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>orbit</span></>
            ) : (
              <>A portfolio, <span style={{ fontWeight: 500, background: "linear-gradient(90deg, #2dd4bf 0%, #a5f3fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>tailored</span></>
            )}
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, position: "relative" }}>
            {view === "positions"
              ? "Unified view across cash, constellations, tranches, and PPN vaults"
              : "Build an allocation shaped by your risk tolerance, capital, and objective"}
          </div>
        </div>

        {view === "personalization" ? (
          <Personalization />
        ) : (
        <>
        {/* ORBITAL DONUT CARD — centrepiece, sized to fit above the fold */}
        <div style={{
          background: "linear-gradient(180deg, rgba(13, 19, 28, 0.9) 0%, rgba(5, 8, 12, 0.95) 100%)",
          border: "0.5px solid rgba(45, 212, 191, 0.1)",
          borderRadius: 24,
          marginBottom: 14,
          overflow: "hidden",
          position: "relative",
          boxShadow: "0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 60px rgba(0,0,0,0.2)",
        }}>
          {/* Deep space gradient wash */}
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(45, 212, 191, 0.04) 0%, transparent 70%)", pointerEvents: "none" }} />
          {/* Top accent ribbon */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(90deg, transparent 0%, rgba(45, 212, 191, 0.4) 20%, #2dd4bf 50%, rgba(45, 212, 191, 0.4) 80%, transparent 100%)", opacity: 0.6 }} />
          {/* Active color wash */}
          <div style={{ position: "absolute", inset: 0, background: activeId && activeColor ? `radial-gradient(ellipse 60% 50% at 50% 45%, ${activeColor}22 0%, transparent 70%)` : "transparent", transition: "background 0.6s cubic-bezier(0.32, 0.72, 0, 1)", pointerEvents: "none" }} />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 56, padding: "14px 40px", position: "relative", flexWrap: "wrap" }}>

            {/* Left-side stats panel — totals + per-bucket breakdown. */}
            <div style={{ width: 300, flexShrink: 0, alignSelf: "center", position: "relative", zIndex: 5 }}>
              <div style={{ paddingBottom: 16, marginBottom: 14, borderBottom: `0.5px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.18em", marginBottom: 6 }}>
                  TOTAL VALUE
                </div>
                <div style={{ fontSize: 24, color: C.textPrimary, fontFamily: FD, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1 }}>
                  {fmtUsd(displayTotal, 2)}
                </div>
              </div>
              <div style={{ paddingBottom: 16, marginBottom: 14, borderBottom: `0.5px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.18em", marginBottom: 6 }}>
                  UNREALIZED P&L
                </div>
                <div style={{ fontSize: 24, color: displayPnl >= 0 ? C.green : C.red, fontFamily: FD, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1 }}>
                  {displayPnl >= 0 ? "+" : ""}{fmtUsd(displayPnl, 2)}
                </div>
              </div>
              {(() => {
                // Breakdown rows must include accrued yield + live drift — without
                // this the sum of rows ≠ displayTotal, which is why the user saw
                // "$25 + $3.93 + $16 + $5 = $49.93" next to a headline of "$50".
                // Adding drift/accrual here keeps the breakdown in sync with the
                // headline down to the penny.
                const basketRowValue = totals.basketValue + basketDriftLive;
                const trancheRowValue = totals.trancheValue + trancheAccruedYield;
                const ppnRowValue = totals.ppnValue + ppnAccruedYield;
                const rows = [
                  { id: "cash",     label: "USDC",           color: "#4a5a6a", value: liveUsdc },
                  { id: "baskets",  label: "Constellations", color: C.teal,    value: basketRowValue },
                  { id: "tranches", label: "Tranches",       color: C.amber,   value: trancheRowValue },
                  { id: "ppn",      label: "PPNs",           color: C.violet,  value: ppnRowValue },
                ];
                const breakdownTotal = rows.reduce((s, r) => s + r.value, 0);
                return rows.map((r) => {
                  const pct = breakdownTotal > 0 ? (r.value / breakdownTotal) * 100 : 0;
                  const dim = r.value <= 0;
                  const isActive = activeId === r.id;
                  return (
                    <div
                      key={r.id}
                      onMouseEnter={() => !dim && setActiveId(r.id)}
                      onMouseLeave={() => setActiveId(null)}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "14px 1fr auto",
                        gap: 12,
                        alignItems: "center",
                        padding: "12px 8px",
                        borderRadius: 6,
                        opacity: dim ? 0.42 : 1,
                        cursor: dim ? "default" : "pointer",
                        transition: `opacity 0.15s ${EASE}, background 0.15s ${EASE}`,
                        background: isActive ? `${r.color}12` : "transparent",
                      }}
                    >
                      <span style={{
                        width: 9, height: 9, borderRadius: "50%",
                        background: r.color,
                        boxShadow: isActive ? `0 0 12px ${r.color}80` : "none",
                        transition: `box-shadow 0.2s ${EASE}`,
                        justifySelf: "center",
                      }} />
                      <div style={{ fontSize: 14, color: C.textPrimary, fontFamily: FD, fontWeight: 500, letterSpacing: "-0.005em" }}>
                        {r.label}
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ fontSize: 14, color: C.textPrimary, fontFamily: FD, fontWeight: 500 }}>
                          {fmtUsd(r.value, 2)}
                        </span>
                        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, marginLeft: 8, letterSpacing: "0.02em" }}>
                          {pct.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>

            {/* Orbital system - rings + corona around donut */}
            <div style={{ position: "relative", width: systemSize, height: systemSize, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>

              {/* Corona glow */}
              <div style={{
                position: "absolute",
                width: donutSize * 1.15,
                height: donutSize * 1.15,
                borderRadius: "50%",
                background: `radial-gradient(circle, ${activeColor || "#2dd4bf"}18 0%, ${activeColor || "#2dd4bf"}08 40%, transparent 70%)`,
                filter: "blur(20px)",
                transition: "background 0.6s cubic-bezier(0.32, 0.72, 0, 1)",
                pointerEvents: "none",
              }} />

              {/* Ring 1 - innermost, teal */}
              <div className="senthos-orbit-slow" style={{
                position: "absolute",
                width: donutSize * 1.28,
                height: donutSize * 1.28,
                borderRadius: "50%",
                border: "1px solid rgba(45, 212, 191, 0.18)",
                boxShadow: "0 0 30px rgba(45, 212, 191, 0.08) inset",
                pointerEvents: "none",
              }}>
                <div style={{ position: "absolute", top: "50%", left: 0, transform: "translate(-50%, -50%)", width: 6, height: 6, borderRadius: "50%", background: "#2dd4bf", boxShadow: "0 0 10px #2dd4bf" }} />
              </div>

              {/* Ring 2 - middle, amber */}
              <div className="senthos-orbit-med" style={{
                position: "absolute",
                width: donutSize * 1.55,
                height: donutSize * 1.55,
                borderRadius: "50%",
                border: "1px solid rgba(217, 119, 6, 0.14)",
                pointerEvents: "none",
              }}>
                <div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)", width: 5, height: 5, borderRadius: "50%", background: "#fbbf24", boxShadow: "0 0 10px #fbbf24" }} />
              </div>

              {/* Ring 3 - outermost, coral */}
              <div className="senthos-orbit-fast" style={{
                position: "absolute",
                width: donutSize * 1.82,
                height: donutSize * 1.82,
                borderRadius: "50%",
                border: "1px solid rgba(234, 88, 12, 0.1)",
                pointerEvents: "none",
              }}>
                <div style={{ position: "absolute", top: "50%", right: 0, transform: "translate(50%, -50%)", width: 4, height: 4, borderRadius: "50%", background: "#fb923c", boxShadow: "0 0 8px #fb923c" }} />
              </div>

              {/* Donut - mechanics untouched */}
              <div style={{ position: "relative", zIndex: 3 }}>
                <SvgDonut data={donutData} size={donutSize} activeId={activeId} onHover={setActiveId} isEmpty={empty} />
                <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", width: 200 }}>
                  {(() => {
                    if (empty) {
                      return (
                        <>
                          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>NO POSITIONS</div>
                          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>Your orbit is empty</div>
                        </>
                      );
                    }
                    const donutTotal = donutData.reduce((s, d) => s + d.value, 0);
                    const hovered = activeId
                      ? donutData.find((d) => d.id === activeId)
                      : null;
                    if (hovered) {
                      const labelMap: Record<string, string> = {
                        cash: "USDC",
                        baskets: "CONSTELLATIONS",
                        tranches: "TRANCHES",
                        ppn: "PPNs",
                        lending: "LENDING",
                      };
                      const label = labelMap[hovered.id] ?? hovered.id.toUpperCase();
                      const hoverPct = donutTotal > 0 ? (hovered.value / donutTotal) * 100 : 0;
                      return (
                        <>
                          <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>{label}</div>
                          <div style={{ fontSize: 34, fontWeight: 600, color: C.textPrimary, fontFamily: FS, lineHeight: 1, marginBottom: 10, letterSpacing: "-0.03em" }}>
                            {fmtUsd(hovered.value, 2)}
                          </div>
                          <div style={{ fontSize: 13, color: hovered.color, fontFamily: FM, letterSpacing: "0.06em", fontWeight: 500 }}>
                            {hoverPct.toFixed(2)}%
                          </div>
                        </>
                      );
                    }
                    return (
                      <>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>TOTAL VALUE</div>
                        <div style={{ fontSize: 34, fontWeight: 600, color: C.textPrimary, fontFamily: FS, lineHeight: 1, marginBottom: 10, letterSpacing: "-0.03em" }}>
                          {fmtUsd(displayTotal, 2)}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, letterSpacing: "0.08em" }}>
                          {donutData.length} POSITION{donutData.length !== 1 ? "S" : ""}
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Positions - sorted by value descending, USDC included */}
        {(() => {
          // Build all position rows with value for sorting
          const rows: { value: number; el: React.ReactNode; key: string }[] = [];

          // Pull every virtual-position group the user has deposited. Each
          // group corresponds to a distinct synthetic id (e.g. STHS-HIGH-
          // SHORT) and becomes its own card, even when multiple synthetic
          // ids share a single on-chain UUID.
          const virtualGroups: GroupedVirtualPosition[] = publicKey
            ? groupVirtualByUiBundle(publicKey.toBase58())
            : [];
          const virtualTokensByUuid = virtualGroups.reduce<Record<string, number>>(
            (acc, g) => {
              acc[g.uuid] = (acc[g.uuid] ?? 0) + g.tokens;
              return acc;
            },
            {},
          );
          // Map uuid → a representative uiBundleId from any virtual group.
          // When a residual position exists for a UUID the user has ALSO
          // deposited into via a synthetic id, borrowing that id gives us
          // the user's intent (they picked STHS-MID-SHORT, so the residual
          // card should label + route the same way). Picking the largest
          // group by token count stays stable under duplicate ids.
          const uiBundleIdByUuid = virtualGroups.reduce<Record<string, { id: string; tokens: number }>>(
            (acc, g) => {
              const prev = acc[g.uuid];
              if (!prev || g.tokens > prev.tokens) {
                acc[g.uuid] = { id: g.uiBundleId, tokens: g.tokens };
              }
              return acc;
            },
            {},
          );

          // Derive a frontend STHS- label for a residual on-chain position
          // whose bundleId is a backend UUID (so resolveBasket misses).
          // Preference order:
          //   1. Use p.displayName if the backend already stored a
          //      STHS-TIER-WINDOW name (new seed) — that's the authoritative
          //      basket identity and it routes directly to /app/basket/[id].
          //   2. Borrow the user's own uiBundleId if they have any virtual
          //      group for this UUID — that's their actual intent.
          //   3. Match the live grid by tier + closest daysLeft to the
          //      backend's maturityAt. Keeps (tier, window) semantics even
          //      for pre-ledger deposits.
          //   4. Match any seed bundle with the same tier (window unknown,
          //      but at least the tier + STHS- format is correct).
          // Returns null when even the tier is unknown — caller falls back
          // to whatever p.displayName was.
          const deriveResidualLabel = (p: BasketPosition): {
            labelId: string;
            tier: 90 | 70 | 50;
            nav: number;
          } | null => {
            if (p.displayName && /^STHS-(HIGH|MID|LOW)-(SHORT|MED|LONG)$/.test(p.displayName)) {
              const live = basketState.status === "ok"
                ? basketState.baskets.find((b) => b.id === p.displayName)
                : null;
              const tier = live?.tier ?? p.tier;
              const nav = live?.nav ?? p.navHint;
              if (tier != null && nav != null) {
                return { labelId: p.displayName, tier, nav };
              }
            }
            const borrowed = uiBundleIdByUuid[p.bundleId];
            if (borrowed) {
              const live = basketState.status === "ok"
                ? basketState.baskets.find((b) => b.id === borrowed.id)
                : null;
              const tier = live?.tier ?? p.tier;
              const nav = live?.nav ?? p.navHint;
              if (tier != null && nav != null) {
                return { labelId: borrowed.id, tier, nav };
              }
            }
            const tierGuess = p.tier;
            if (tierGuess == null) return null;
            if (basketState.status === "ok") {
              const candidates = basketState.baskets.filter((b) => b.tier === tierGuess);
              if (candidates.length) {
                const target = p.maturityAt;
                const pick = target == null
                  ? candidates[0]
                  : candidates
                      .map((b) => {
                        const bMaturity = b.daysLeft != null
                          ? Date.now() + b.daysLeft * 86_400_000
                          : null;
                        const diff = bMaturity == null
                          ? Number.POSITIVE_INFINITY
                          : Math.abs(bMaturity - target);
                        return { b, diff };
                      })
                      .sort((a, z) => a.diff - z.diff)[0].b;
                return { labelId: pick.id, tier: pick.tier, nav: pick.nav };
              }
            }
            const seed = bundleById(`STHS-${tierGuess === 90 ? "HIGH" : tierGuess === 70 ? "MID" : "LOW"}-SHORT`);
            if (seed) {
              return { labelId: seed.id, tier: seed.tier, nav: p.navHint ?? seed.nav };
            }
            return null;
          };

          const renderBasketCard = (opts: {
            cardKey: string;
            uuid: string;
            labelId: string;
            qty: number;
            avgCost: number;
            nav: number;
            tier: 90 | 70 | 50;
            maturityAt?: number | null;
            status?: string;
          }) => {
            const { cardKey, uuid, labelId, qty, avgCost, nav, tier, maturityAt, status } = opts;
            const value = qty * nav;
            const pnl = qty * (nav - avgCost);
            const liveMatchById =
              basketState.status === "ok"
                ? basketState.baskets.find((b) => b.id === labelId)
                : null;
            const liveMaturityMs =
              liveMatchById?.daysLeft != null
                ? Date.now() + liveMatchById.daysLeft * 86_400_000
                : null;
            const effectiveMaturityMs = liveMaturityMs ?? maturityAt ?? null;
            const matured =
              status === "resolved" ||
              (effectiveMaturityMs != null && effectiveMaturityMs <= renderNow);
            const maturityDate = liveMatchById?.date
              ? liveMatchById.date
              : maturityAt
                ? (() => {
                    const d = new Date(maturityAt);
                    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
                  })()
                : null;
            const maturityLabel =
              typeof maturityDate === "string"
                ? maturityDate
                : maturityDate
                  ? maturityDate.toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : null;
            const isBusy = redeemBusy === uuid;
            const errMsg = redeemError[uuid];
            // Human-readable conviction tag. Matches the wording on /basket
            // where each card shows "high/mid/low probability" under the id.
            const tierLabel = tier === 90 ? "High" : tier === 70 ? "Mid" : "Low";
            // Days-to-close: prefer the live feed, fall back to maturityAt
            // from the DB hydrate. Mirrors `formatDaysLeft` on /basket so the
            // wording is consistent between the index card and portfolio card.
            const daysLeftMs =
              liveMatchById?.daysLeft != null
                ? liveMatchById.daysLeft * 86_400_000
                : maturityAt != null
                  ? Math.max(0, maturityAt - renderNow)
                  : null;
            const closesInLabel =
              daysLeftMs == null
                ? null
                : daysLeftMs <= 0
                  ? "Resolving now"
                  : (() => {
                      const d = Math.round(daysLeftMs / 86_400_000);
                      if (d === 0) return "Closes today";
                      if (d === 1) return "Closes in 1 day";
                      return `Closes in ${d} days`;
                    })();
            const contextLine = closesInLabel
              ? `${tierLabel}-conviction · ${closesInLabel}`
              : `${tierLabel}-conviction basket`;
            rows.push({
              key: cardKey,
              value,
              el: (
                <div key={cardKey} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>CONSTELLATION</div>
                    <Link href="/app/basket" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <Link href={`/app/basket/${labelId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: tc(tier) }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{labelId}</div>
                        <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: FS, marginTop: 2 }}>{contextLine}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{qty.toFixed(2)} tokens · avg ${avgCost.toFixed(3)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(value, 2)}</div>
                      <div style={{ fontSize: 11, color: pnl >= 0 ? C.green : C.red, fontFamily: FS, marginTop: 2 }}>{pnl >= 0 ? "+" : ""}{fmtUsd(pnl, 2)}</div>
                    </div>
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, color: matured ? C.green : C.textMuted, fontFamily: FM, letterSpacing: "0.06em" }}>
                      {matured ? "MATURED" : maturityLabel ? `MATURES ${maturityLabel.toUpperCase()}` : "MATURITY UNKNOWN"}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleRedeem(uuid, labelId, qty);
                      }}
                      disabled={!matured || isBusy || !connected}
                      style={{
                        padding: "7px 16px",
                        fontSize: 12,
                        fontFamily: FD,
                        fontWeight: 500,
                        letterSpacing: "0.02em",
                        borderRadius: 8,
                        cursor: matured && !isBusy ? "pointer" : "not-allowed",
                        border: `0.5px solid ${matured ? C.teal : "rgba(255,255,255,0.08)"}`,
                        background: matured ? "rgba(45, 212, 191, 0.12)" : "transparent",
                        color: matured ? C.tealLight : C.textMuted,
                        opacity: isBusy ? 0.6 : 1,
                        transition: `all 0.15s ${EASE}`,
                      }}
                    >
                      {isBusy ? "Redeeming…" : "Redeem"}
                    </button>
                  </div>
                  {errMsg && (
                    <div style={{ marginTop: 10, fontSize: 11, fontFamily: FS, color: C.red }}>
                      {errMsg}
                    </div>
                  )}
                </div>
              ),
            });
          };

          // Render one card per virtual group, using the NAV at deposit
          // time as the cost basis so PnL starts at zero.
          virtualGroups.forEach((g) => {
            const liveMatch =
              basketState.status === "ok"
                ? basketState.baskets.find((b) => b.id === g.uiBundleId)
                : null;
            const dbMatch = state.basketPositions.find((p) => p.bundleId === g.uuid);
            const tier = liveMatch?.tier ?? dbMatch?.tier;
            const nav = liveMatch?.nav ?? dbMatch?.navHint;
            if (tier == null || nav == null) return;
            renderBasketCard({
              cardKey: `${g.uuid}::${g.uiBundleId}`,
              uuid: g.uuid,
              labelId: g.uiBundleId,
              qty: g.tokens,
              avgCost: g.avgNavAtDeposit,
              nav,
              tier,
              maturityAt: dbMatch?.maturityAt,
              status: dbMatch?.status,
            });
          });

          // For each on-chain position, render a residual card covering
          // any tokens the virtual ledger hasn't explained (pre-ledger
          // deposits, localStorage wipes, etc.).
          // Dedupe by bundleId before rendering residuals: the backend has
          // historically returned multiple rows for the same bundle (e.g. one
          // per on-chain deposit event), which would give us two cards with
          // identical `${bundleId}::residual` keys and the "Encountered two
          // children with the same key" React warning. Sum their qty so the
          // user sees one merged residual instead of duplicates.
          const residualByBundle = new Map<string, BasketPosition>();
          state.basketPositions.forEach((p) => {
            const existing = residualByBundle.get(p.bundleId);
            if (existing) {
              residualByBundle.set(p.bundleId, {
                ...existing,
                qty: existing.qty + p.qty,
              });
            } else {
              residualByBundle.set(p.bundleId, p);
            }
          });
          residualByBundle.forEach((p) => {
            const virtualQty = virtualTokensByUuid[p.bundleId] ?? 0;
            const residual = p.qty - virtualQty;
            if (residual <= 0.001) return;
            // First try the catalog (works when bundleId is already a
            // STHS- id), then fall through to deriveResidualLabel which
            // maps a backend UUID → the best-guess STHS-TIER-WINDOW id.
            // Using p.displayName as a label leaks "LK-70-0515" into the
            // UI and breaks the basket-detail route.
            const catalogMatch = resolveBasket(p.bundleId);
            let tier: 90 | 70 | 50 | undefined;
            let nav: number | undefined;
            let labelId: string;
            if (catalogMatch) {
              tier = catalogMatch.tier;
              nav = catalogMatch.nav;
              labelId = catalogMatch.id;
            } else {
              const derived = deriveResidualLabel(p);
              if (!derived) return;
              tier = derived.tier;
              nav = derived.nav;
              labelId = derived.labelId;
            }
            if (tier == null || nav == null) return;
            renderBasketCard({
              cardKey: `${p.bundleId}::residual`,
              uuid: p.bundleId,
              labelId,
              qty: residual,
              // Residual positions have no nav-at-deposit capture, so
              // peg cost basis to current NAV. PnL starts at $0 and
              // only moves once NAV drifts after this render.
              avgCost: nav,
              nav,
              tier,
              maturityAt: p.maturityAt,
              status: p.status,
            });
          });


          state.tranchePositions.forEach((p, i) => {
            const principal = p.qty * p.avgCost;
            // Per-card accrued yield — same formula as trancheAccruedYield, so
            // summing cards matches the headline P&L contribution.
            const trancheAccrued =
              p.apy != null && p.createdAt != null && p.maturityDays != null
                ? principal *
                  (p.apy / 100 / 365) *
                  Math.min(
                    Math.max(0, (renderNow - p.createdAt) / 86_400_000),
                    p.maturityDays,
                  )
                : 0;
            const value = principal + trancheAccrued;
            const rowKey = `tranche-${p.vaultId ?? `${p.bundleId}-${p.kind}-${i}`}`;
            const matured = p.maturityAt != null ? p.maturityAt <= renderNow : false;
            const isBusy = redeemBusy === rowKey;
            const errMsg = redeemError[rowKey];
            const maturityLabel = p.maturityAt
              ? new Date(p.maturityAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : null;
            rows.push({
              key: rowKey,
              value,
              el: (
                <div key={rowKey} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>TRANCHE</div>
                    <Link href="/app/tranche" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <Link href={`/app/tranche/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: trancheColor(p.kind) }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, textTransform: "capitalize" }}>{p.bundleId} · {p.kind}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{p.qty.toFixed(2)} tokens · issued ${p.avgCost.toFixed(2)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(value, 2)}</div>
                      {trancheAccrued > 0 && (
                        <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(trancheAccrued, 2)}</div>
                      )}
                    </div>
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, color: matured ? C.green : C.textMuted, fontFamily: FM, letterSpacing: "0.06em" }}>
                      {matured ? "MATURED" : maturityLabel ? `MATURES ${maturityLabel.toUpperCase()}` : "MATURITY UNKNOWN"}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleRedeemPpn(rowKey, {
                          vaultId: p.vaultId,
                          bundleId: p.vaultId ? undefined : p.bundleId,
                        })
                      }
                      disabled={!matured || isBusy || !connected}
                      style={{
                        padding: "7px 16px",
                        fontSize: 12,
                        fontFamily: FD,
                        fontWeight: 500,
                        letterSpacing: "0.02em",
                        borderRadius: 8,
                        cursor: matured && !isBusy ? "pointer" : "not-allowed",
                        border: `0.5px solid ${matured ? C.amber : "rgba(255,255,255,0.08)"}`,
                        background: matured ? "rgba(217, 119, 6, 0.14)" : "transparent",
                        color: matured ? C.amber : C.textMuted,
                        opacity: isBusy ? 0.6 : 1,
                        transition: `all 0.15s ${EASE}`,
                      }}
                    >
                      {isBusy ? "Redeeming…" : "Redeem"}
                    </button>
                  </div>
                  {errMsg && (
                    <div style={{ marginTop: 10, fontSize: 11, fontFamily: FS, color: C.red }}>
                      {errMsg}
                    </div>
                  )}
                </div>
              ),
            });
          });

          state.ppnVaults.forEach((v) => {
            const elapsed = Math.max(0, (renderNow - v.createdAt) / 86_400_000);
            const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsed, v.maturityDays);
            const value = v.principal + accrued;
            const rowKey = `ppn-${v.id}`;
            const maturityMs = v.createdAt + v.maturityDays * 86_400_000;
            const matured = maturityMs <= renderNow;
            const isBusy = redeemBusy === rowKey;
            const errMsg = redeemError[rowKey];
            const maturityLabel = new Date(maturityMs).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            });
            rows.push({
              key: rowKey,
              value,
              el: (
                <div key={rowKey} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>PPN VAULT</div>
                    <Link href="/app/ppn" style={{ fontSize: 11, color: C.violet, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: C.violet }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{v.bundleId}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{v.apy.toFixed(2)}% APY · {v.maturityDays}d maturity</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(v.principal, 2)}</div>
                      <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(accrued, 2)}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 14, paddingTop: 14, borderTop: `0.5px solid ${C.border}` }}>
                    <div style={{ fontSize: 11, color: matured ? C.green : C.textMuted, fontFamily: FM, letterSpacing: "0.06em" }}>
                      {matured ? "MATURED" : `MATURES ${maturityLabel.toUpperCase()}`}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRedeemPpn(rowKey, { vaultId: v.id })}
                      disabled={!matured || isBusy || !connected}
                      style={{
                        padding: "7px 16px",
                        fontSize: 12,
                        fontFamily: FD,
                        fontWeight: 500,
                        letterSpacing: "0.02em",
                        borderRadius: 8,
                        cursor: matured && !isBusy ? "pointer" : "not-allowed",
                        border: `0.5px solid ${matured ? C.violet : "rgba(255,255,255,0.08)"}`,
                        background: matured ? "rgba(139, 92, 246, 0.14)" : "transparent",
                        color: matured ? C.violet : C.textMuted,
                        opacity: isBusy ? 0.6 : 1,
                        transition: `all 0.15s ${EASE}`,
                      }}
                    >
                      {isBusy ? "Redeeming…" : "Redeem"}
                    </button>
                  </div>
                  {errMsg && (
                    <div style={{ marginTop: 10, fontSize: 11, fontFamily: FS, color: C.red }}>
                      {errMsg}
                    </div>
                  )}
                </div>
              ),
            });
          });

          // USDC cash position. Pulls straight from the wallet-bridge's
          // live poll so this reflects the user's actual on-chain ATA
          // (Circle devnet USDC). If the wallet is disconnected the row
          // is skipped — the connect CTA lives in the header.
          if (liveUsdc > 0) {
            rows.push({
              key: "usdc",
              value: liveUsdc,
              el: (
                <div key="usdc" style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 14 }}>CASH</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: "#4a5a6a" }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>USDC</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>Solana · available</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(liveUsdc, 2)}</div>
                  </div>
                </div>
              ),
            });
          }

          // Sort by value descending
          rows.sort((a, b) => b.value - a.value);
          return rows.map(r => r.el);
        })()}
        </>
        )}
      </PageFrame>
    </>
  );
}