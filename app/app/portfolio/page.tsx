"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Header, PageFrame } from "../_components/Header";
import { SvgDonut } from "../_components/charts";
import { C, FS, FD, FM, EASE, tc, trancheColor, fmtUsd } from "../_lib/tokens";
import {
  useUsdcBalance,
  useWalletSigner,
  explorerTxUrl,
} from "../_lib/wallet-bridge";
import { redeemFromBundle, DepositError } from "../_lib/deposit-client";
import { ppnRedeem, PpnError } from "../_lib/ppn-client";
import {
  useOnchainPortfolio,
  type BasketPositionOnchain,
  type TranchePositionOnchain,
  type PpnVaultOnchain,
} from "../_lib/use-onchain-portfolio";
import { Personalization } from "./_personalization";

/**
 * A redeem target lives on-chain, so we pass the backend/program
 * identifiers the relevant client needs:
 *   - `basket`: uses the bundle UUID because `redeemFromBundle` looks
 *     up the wallet's vault position via `(bundle_id, wallet)`.
 *   - `tranche` / `ppn`: both ride the PPN rail; we pass `vaultId` so
 *     the backend resolves the exact note to redeem. `bundleId` is
 *     carried alongside purely for display consistency if a future
 *     prepare call needs it.
 */
type RedeemTarget =
  | { kind: "basket"; bundleId: string }
  | { kind: "tranche"; vaultId: string; bundleId: string }
  | { kind: "ppn"; vaultId: string; bundleId: string };

/**
 * Per-row redeem control. Mirrors the prepare → signing → confirming →
 * done lifecycle from BasketBuyPanel so the Buy and Redeem paths feel
 * symmetric.
 *
 * After a successful redeem we call `onRedeemed()` which triggers a
 * refresh of the on-chain portfolio sources so the row disappears
 * immediately without waiting for the 15 s poll tick.
 */
function RedeemRowButton({
  target,
  accent,
  onRedeemed,
}: {
  target: RedeemTarget;
  accent: string;
  onRedeemed: () => Promise<void> | void;
}) {
  const wallet = useWalletSigner();
  const usdc = useUsdcBalance();
  const { connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const [txStage, setTxStage] = useState<
    "idle" | "preparing" | "signing" | "confirming" | "persisting" | "done"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const busy = txStage !== "idle" && txStage !== "done";

  async function handleRedeem(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!connected) {
      setWalletModalVisible(true);
      return;
    }
    setTxError(null);
    setTxSignature(null);
    setTxStage("preparing");
    try {
      let signature: string;
      if (target.kind === "basket") {
        const result = await redeemFromBundle({
          wallet,
          bundleId: target.bundleId,
        });
        signature = result.signature;
      } else {
        const result = await ppnRedeem({
          wallet,
          vaultId: target.vaultId,
        });
        signature = result.signature;
      }
      setTxStage("done");
      setTxSignature(signature);
      // Kick both caches: live USDC balance (cash line) and the
      // portfolio sources (so the redeemed row disappears).
      void usdc.refresh();
      void onRedeemed();
    } catch (err) {
      setTxStage("idle");
      if (err instanceof DepositError || err instanceof PpnError) {
        setTxError(err.message);
      } else if (err instanceof Error) {
        setTxError(
          /user rejected/i.test(err.message)
            ? "Transaction was rejected in your wallet."
            : err.message,
        );
      } else {
        setTxError(String(err));
      }
    }
  }

  const label = busy
    ? txStage === "preparing"
      ? "Preparing…"
      : txStage === "signing"
        ? "Sign in wallet…"
        : txStage === "confirming"
          ? "Confirming…"
          : "Finalising…"
    : txStage === "done"
      ? "✓ Redeemed"
      : !connected
        ? "Connect to redeem"
        : "Redeem";

  const disabled = busy || txStage === "done";

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <button
        type="button"
        onClick={handleRedeem}
        disabled={disabled}
        style={{
          alignSelf: "flex-end",
          padding: "7px 16px",
          borderRadius: 8,
          border: `0.5px solid ${accent}55`,
          background:
            txStage === "done"
              ? `${accent}1a`
              : disabled
                ? "transparent"
                : `${accent}14`,
          color: accent,
          fontFamily: FD,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          cursor: disabled ? "default" : "pointer",
          opacity: busy ? 0.75 : 1,
          transition: `background 0.15s ${EASE}`,
        }}
      >
        {label}
      </button>
      {txError && (
        <div
          style={{
            fontFamily: FM,
            fontSize: 11,
            lineHeight: 1.45,
            color: "#ff8570",
            background: "rgba(255, 90, 70, 0.08)",
            border: "0.5px solid rgba(255, 90, 70, 0.35)",
            borderRadius: 6,
            padding: "7px 10px",
            letterSpacing: "0.02em",
          }}
        >
          {txError}
        </div>
      )}
      {txSignature && (
        <a
          href={explorerTxUrl(txSignature)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            alignSelf: "flex-end",
            fontFamily: FM,
            fontSize: 11,
            color: accent,
            textDecoration: "none",
            opacity: 0.85,
            letterSpacing: "0.02em",
          }}
        >
          View tx ↗
        </a>
      )}
    </div>
  );
}

type View = "positions" | "personalization";

export default function PortfolioPage() {
  const { connected } = useWallet();
  const usdc = useUsdcBalance();
  const portfolio = useOnchainPortfolio();
  // Cash line is the real on-chain USDC in the connected wallet. When
  // disconnected we fall back to 0 so the donut + positions list simply
  // omit the cash slice instead of flashing a stale balance.
  const liveUsdc = connected ? usdc.uiAmount : 0;
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<View>("positions");

  const { baskets, tranches, ppns, totals } = portfolio;

  // Total value includes cash so the donut centre matches the real
  // "what my wallet is worth right now" number.
  const totalValueWithCash = liveUsdc + totals.totalValue;

  const donutData: Array<{ id: string; value: number; color: string }> = [
    ...(liveUsdc > 0 ? [{ id: "cash", value: liveUsdc, color: "#4a5a6a" }] : []),
    ...(totals.basketValue > 0 ? [{ id: "baskets", value: totals.basketValue, color: C.teal }] : []),
    ...(totals.trancheValue > 0 ? [{ id: "tranches", value: totals.trancheValue, color: C.amber }] : []),
    ...(totals.ppnValue > 0 ? [{ id: "ppn", value: totals.ppnValue, color: C.violet }] : []),
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
                  {fmtUsd(totalValueWithCash, 2)}
                </div>
              </div>
              <div style={{ paddingBottom: 16, marginBottom: 14, borderBottom: `0.5px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.18em", marginBottom: 6 }}>
                  UNREALIZED P&L
                </div>
                <div style={{ fontSize: 24, color: totals.unrealizedPnl >= 0 ? C.green : C.red, fontFamily: FD, fontWeight: 500, letterSpacing: "-0.015em", lineHeight: 1 }}>
                  {totals.unrealizedPnl >= 0 ? "+" : ""}{fmtUsd(totals.unrealizedPnl, 2)}
                </div>
              </div>
              {(() => {
                const rows = [
                  { id: "baskets",  label: "Constellations", color: C.teal,   value: totals.basketValue },
                  { id: "tranches", label: "Tranches",       color: C.amber,  value: totals.trancheValue },
                  { id: "ppn",      label: "PPNs",           color: C.violet, value: totals.ppnValue },
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
                          {fmtUsd(r.value, 0)}
                        </span>
                        <span style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, marginLeft: 8, letterSpacing: "0.02em" }}>
                          {pct.toFixed(0)}%
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
                  {empty ? (
                    <>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>NO POSITIONS</div>
                      <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>Your orbit is empty</div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>TOTAL VALUE</div>
                      <div style={{ fontSize: 34, fontWeight: 600, color: C.textPrimary, fontFamily: FS, lineHeight: 1, marginBottom: 10, letterSpacing: "-0.03em" }}>
                        {fmtUsd(totalValueWithCash, 0)}
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, letterSpacing: "0.08em" }}>
                        {donutData.length} POSITION{donutData.length !== 1 ? "S" : ""}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Positions list — sorted by value descending, USDC included.
            Rows are composed into a single array first so the three
            product families mix together when the user holds them all;
            the sort is purely by USD value so what's most material
            floats to the top. */}
        {(() => {
          const rows: { value: number; el: React.ReactNode; key: string }[] = [];

          baskets.forEach((p: BasketPositionOnchain) => {
            const pnl =
              p.avgCost == null ? null : p.qty * (p.nav - p.avgCost);
            const accent = p.tier != null ? tc(p.tier) : C.teal;
            rows.push({
              key: `basket-${p.bundleId}`,
              value: p.valueUsd,
              el: (
                <div key={`basket-${p.bundleId}`} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>BASKET</div>
                    <Link href="/app/basket" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <Link href={`/app/basket/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: accent }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{p.bundleName}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                          {p.qty.toFixed(2)} tokens
                          {p.avgCost != null && <> · avg ${p.avgCost.toFixed(3)}</>}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(p.valueUsd, 2)}</div>
                      {pnl != null && (
                        <div style={{ fontSize: 11, color: pnl >= 0 ? C.green : C.red, fontFamily: FS, marginTop: 2 }}>
                          {pnl >= 0 ? "+" : ""}{fmtUsd(pnl, 2)}
                        </div>
                      )}
                    </div>
                  </Link>
                  <RedeemRowButton
                    target={{ kind: "basket", bundleId: p.bundleId }}
                    accent={accent}
                    onRedeemed={portfolio.refresh}
                  />
                </div>
              ),
            });
          });

          tranches.forEach((p: TranchePositionOnchain) => {
            const accent = trancheColor(p.kind);
            rows.push({
              key: `tranche-${p.vaultId}`,
              value: p.totalValue,
              el: (
                <div key={`tranche-${p.vaultId}`} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>TRANCHE</div>
                    <Link href="/app/tranche" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <Link href={`/app/tranche/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: accent }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, textTransform: "capitalize" }}>
                          {p.bundleName} · {p.kind}
                        </div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                          Principal ${p.principalUsdc.toFixed(2)} · {p.daysRemaining}d remaining
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(p.totalValue, 2)}</div>
                      {p.accruedYield > 0 && (
                        <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(p.accruedYield, 2)}</div>
                      )}
                    </div>
                  </Link>
                  <RedeemRowButton
                    target={{ kind: "tranche", vaultId: p.vaultId, bundleId: p.bundleId }}
                    accent={accent}
                    onRedeemed={portfolio.refresh}
                  />
                </div>
              ),
            });
          });

          ppns.forEach((v: PpnVaultOnchain) => {
            rows.push({
              key: `ppn-${v.vaultId}`,
              value: v.totalValue,
              el: (
                <div key={`ppn-${v.vaultId}`} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>PPN VAULT</div>
                    <Link href="/app/ppn" style={{ fontSize: 11, color: C.violet, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: C.violet }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{v.bundleName}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                          {v.apy.toFixed(2)}% APY · {v.daysRemaining}d remaining
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(v.principalUsdc, 2)}</div>
                      <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(v.accruedYield, 2)}</div>
                    </div>
                  </div>
                  <RedeemRowButton
                    target={{ kind: "ppn", vaultId: v.vaultId, bundleId: v.bundleId }}
                    accent={C.violet}
                    onRedeemed={portfolio.refresh}
                  />
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

        {portfolio.error && (
          <div
            style={{
              fontFamily: FM,
              fontSize: 11,
              lineHeight: 1.45,
              color: "#ff8570",
              background: "rgba(255, 90, 70, 0.08)",
              border: "0.5px solid rgba(255, 90, 70, 0.35)",
              borderRadius: 6,
              padding: "7px 10px",
              letterSpacing: "0.02em",
              marginTop: 8,
            }}
          >
            Portfolio refresh issue: {portfolio.error}
          </div>
        )}
        </>
        )}
      </PageFrame>
    </>
  );
}
