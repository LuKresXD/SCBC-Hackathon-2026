"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header, PageFrame } from "../_components/Header";
import { SvgDonut, MetricTile } from "../_components/charts";
import { C, FS, FD, tc, trancheColor, fmtUsd } from "../_lib/tokens";
import { bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

export default function PortfolioPage() {
  const { state, dispatch, totals } = useSandbox();
  const [activeId, setActiveId] = useState<string | null>(null);
  // `renderNow` is used by accrued-yield displays. React 19's purity rule
  // forbids Date.now() in render, so we capture it in state (via a lazy
  // initializer) and let a 1s interval keep it fresh.
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

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Portfolio</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
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

        <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 20, marginBottom: 20, padding: "32px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ position: "relative" }}>
              <SvgDonut data={donutData} size={300} activeId={activeId} onHover={setActiveId} isEmpty={empty} />
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none", width: 200 }}>
                {empty ? (
                  <>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.14em", marginBottom: 10 }}>NO POSITIONS</div>
                    <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>Your portfolio is empty</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.14em", marginBottom: 10 }}>TOTAL VALUE</div>
                    <div style={{ fontSize: 34, fontWeight: 600, color: C.textPrimary, fontFamily: FS, lineHeight: 1, marginBottom: 10, letterSpacing: "-0.03em" }}>
                      {fmtUsd(totals.totalValue, 0)}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS }}>
                      {donutData.length} primitive{donutData.length !== 1 ? "s" : ""}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Per-primitive sections */}
        {state.basketPositions.length > 0 && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>BASKET POSITIONS</div>
              <Link href="/app/basket" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
            </div>
            {state.basketPositions.map((p) => {
              const b = bundleById(p.bundleId);
              if (!b) return null;
              const value = p.qty * b.nav;
              const pnl = p.qty * (b.nav - p.avgCost);
              return (
                <Link key={p.bundleId} href={`/app/basket/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `0.5px solid ${C.border}`, textDecoration: "none" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 4, height: 24, borderRadius: 2, background: tc(b.tier) }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{b.id}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{p.qty.toFixed(2)} tokens · avg ${p.avgCost.toFixed(3)}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(value, 2)}</div>
                    <div style={{ fontSize: 11, color: pnl >= 0 ? C.green : C.red, fontFamily: FS, marginTop: 2 }}>
                      {pnl >= 0 ? "+" : ""}
                      {fmtUsd(pnl, 2)}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {state.tranchePositions.length > 0 && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>TRANCHE POSITIONS</div>
              <Link href="/app/tranche" style={{ fontSize: 11, color: C.teal, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
            </div>
            {state.tranchePositions.map((p, i) => (
              <Link key={i} href={`/app/tranche/${p.bundleId}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `0.5px solid ${C.border}`, textDecoration: "none" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <div style={{ width: 4, height: 24, borderRadius: 2, background: trancheColor(p.kind) }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, textTransform: "capitalize" }}>
                      {p.bundleId} · {p.kind}
                    </div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                      {p.qty.toFixed(2)} tokens · issued ${p.avgCost.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(p.qty * p.avgCost, 2)}</div>
              </Link>
            ))}
          </div>
        )}

        {state.ppnVaults.length > 0 && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>PPN VAULTS</div>
              <Link href="/app/ppn" style={{ fontSize: 11, color: C.violet, fontFamily: FS, textDecoration: "none" }}>View all →</Link>
            </div>
            {state.ppnVaults.map((v) => {
              const elapsed = Math.max(0, (renderNow - v.createdAt) / 86_400_000);
              const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsed, v.maturityDays);
              return (
                <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: `0.5px solid ${C.border}` }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 4, height: 24, borderRadius: 2, background: C.violet }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{v.bundleId}</div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                        {v.apy.toFixed(2)}% APY · {v.maturityDays}d maturity
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(v.principal, 2)}</div>
                    <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(accrued, 2)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(state.loans.length > 0 || state.lend) && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em" }}>LENDING</div>
              <Link href="/app/lending" style={{ fontSize: 11, color: C.blue, fontFamily: FS, textDecoration: "none" }}>Manage →</Link>
            </div>
            {state.lend && (
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `0.5px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>Supply position</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{state.lend.startApy.toFixed(2)}% APY</div>
                </div>
                <div style={{ fontSize: 13, color: C.teal, fontFamily: FD }}>{fmtUsd(state.lend.amount, 2)}</div>
              </div>
            )}
            {state.loans.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `0.5px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>Loan · {l.bundleId}</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{l.rateApy.toFixed(2)}% APY</div>
                </div>
                <div style={{ fontSize: 13, color: C.coral, fontFamily: FD }}>-{fmtUsd(l.borrowedUsdc, 2)}</div>
              </div>
            ))}
          </div>
        )}
      </PageFrame>
    </>
  );
}
