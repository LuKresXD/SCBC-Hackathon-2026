"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header, PageFrame } from "../_components/Header";
import { SvgDonut, MetricTile } from "../_components/charts";
import { C, FS, FD, FM, tc, trancheColor, fmtUsd } from "../_lib/tokens";
import { bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

export default function PortfolioPage() {
  const { state, dispatch, totals } = useSandbox();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [renderNow, setRenderNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setRenderNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const donutData: Array<{ id: string; value: number; color: string }> = [
    ...(state.usdc > 0 ? [{ id: "cash", value: state.usdc, color: "#4a5a6a" }] : []),
    ...(totals.basketValue > 0 ? [{ id: "baskets", value: totals.basketValue, color: C.teal }] : []),
    ...(totals.trancheValue > 0 ? [{ id: "tranches", value: totals.trancheValue, color: C.amber }] : []),
    ...(totals.ppnValue > 0 ? [{ id: "ppn", value: totals.ppnValue, color: C.violet }] : []),
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
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24, position: "relative", paddingBottom: 22, borderBottom: "0.5px solid rgba(45, 212, 191, 0.1)" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: 140, background: "radial-gradient(ellipse at top right, rgba(45, 212, 191, 0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
            <span style={{ width: 18, height: 1, background: "#2dd4bf", opacity: 0.6 }} />
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.22em", color: "#2dd4bf", fontWeight: 500 }}>PORTFOLIO</span>
            <span style={{ width: 18, height: 1, background: "#2dd4bf", opacity: 0.6 }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 200, color: C.textPrimary, fontFamily: FD, marginBottom: 6, letterSpacing: "-0.02em", position: "relative" }}>
            Your <span style={{ fontWeight: 500, background: "linear-gradient(90deg, #2dd4bf 0%, #a5f3fc 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>orbit</span>
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, position: "relative" }}>
            Unified view across cash, baskets, tranches, PPN vaults, and lending
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 20 }}>
          <MetricTile label="TOTAL VALUE" value={fmtUsd(totals.totalValue, 2)} color={C.green} />
          <MetricTile label="UNREALIZED P&L" value={`${totals.unrealizedPnl >= 0 ? "+" : ""}${fmtUsd(totals.unrealizedPnl, 2)}`} color={totals.unrealizedPnl >= 0 ? C.green : C.red} />
          <MetricTile label="BASKETS" value={fmtUsd(totals.basketValue, 0)} sub={`${state.basketPositions.length} positions`} />
          <MetricTile label="PPN" value={fmtUsd(totals.ppnValue, 0)} color={C.violet} sub={`${state.ppnVaults.length} vaults`} />
          <MetricTile label="DEBT" value={fmtUsd(totals.loanDebt, 0)} color={totals.loanDebt > 0 ? C.coral : C.textMuted} sub={`${state.loans.length} open loans`} />
        </div>

        {/* ORBITAL DONUT CARD */}
        <div style={{
          background: "linear-gradient(180deg, rgba(13, 19, 28, 0.9) 0%, rgba(5, 8, 12, 0.95) 100%)",
          border: "0.5px solid rgba(45, 212, 191, 0.1)",
          borderRadius: 24,
          marginBottom: 20,
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

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "56px 0 44px", position: "relative" }}>

            {/* Header strip */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, position: "relative", zIndex: 5 }}>
              <span style={{ width: 24, height: 1, background: C.textMuted }} />
              <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.22em", color: C.textMuted }}>YOUR ORBIT</span>
              <span style={{ width: 24, height: 1, background: C.textMuted }} />
            </div>

            {/* Orbital system - rings + corona around donut */}
            <div style={{ position: "relative", width: systemSize, height: systemSize, display: "flex", alignItems: "center", justifyContent: "center" }}>

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
                        {fmtUsd(totals.totalValue, 0)}
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

        {/* Positions - sorted by value descending, USDC included */}
        {(() => {
          // Build all position rows with value for sorting
          const rows: { value: number; el: React.ReactNode; key: string }[] = [];

          state.basketPositions.forEach((p) => {
            const b = bundleById(p.bundleId);
            if (!b) return;
            const value = p.qty * b.nav;
            const pnl = p.qty * (b.nav - p.avgCost);
            rows.push({
              key: p.bundleId,
              value,
              el: (
                <div key={p.bundleId} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>BASKET</div>
                    <Link href="/app/basket" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
                  </div>
                  <Link href={`/app/basket/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", textDecoration: "none" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 4, height: 24, borderRadius: 2, background: tc(b.tier) }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{b.id}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{p.qty.toFixed(2)} tokens · avg ${p.avgCost.toFixed(3)}</div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(value, 2)}</div>
                      <div style={{ fontSize: 11, color: pnl >= 0 ? C.green : C.red, fontFamily: FS, marginTop: 2 }}>{pnl >= 0 ? "+" : ""}{fmtUsd(pnl, 2)}</div>
                    </div>
                  </Link>
                </div>
              ),
            });
          });

          state.tranchePositions.forEach((p, i) => {
            const value = p.qty * p.avgCost;
            rows.push({
              key: `tranche-${i}`,
              value,
              el: (
                <div key={`tranche-${i}`} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
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
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(value, 2)}</div>
                  </Link>
                </div>
              ),
            });
          });

          state.ppnVaults.forEach((v) => {
            const elapsed = Math.max(0, (renderNow - v.createdAt) / 86_400_000);
            const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsed, v.maturityDays);
            const value = v.principal + accrued;
            rows.push({
              key: v.id,
              value,
              el: (
                <div key={v.id} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
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
                </div>
              ),
            });
          });

          // USDC cash position
          if (state.usdc > 0) {
            rows.push({
              key: "usdc",
              value: state.usdc,
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
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(state.usdc, 2)}</div>
                  </div>
                </div>
              ),
            });
          }

          // Sort by value descending
          rows.sort((a, b) => b.value - a.value);
          return rows.map(r => r.el);
        })()}
      </PageFrame>
    </>
  );
}