"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Header, PageFrame } from "../_components/Header";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, EASE, tc, fmtUsd } from "../_lib/tokens";
import { BUNDLES, bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

export default function PpnPage() {
  const { state, dispatch } = useSandbox();
  const [selectedBundle, setSelectedBundle] = useState<string>(BUNDLES[0].id);
  const [amt, setAmt] = useState("");
  const [maturityDays, setMaturityDays] = useState(30);
  const [confirmed, setConfirmed] = useState(false);

  const bundle = bundleById(selectedBundle)!;
  const dep = parseFloat(amt) || 0;
  const APY = 0.084;
  const estimatedYield = dep * (APY / 365) * maturityDays;
  const insufficient = dep > state.usdc;

  function handleDeposit() {
    if (dep <= 0 || insufficient) return;
    dispatch({ type: "ppn/open", bundleId: selectedBundle, usdcAmount: dep, apy: APY * 100, maturityDays });
    setConfirmed(true);
    setTimeout(() => {
      setAmt("");
      setConfirmed(false);
    }, 1200);
  }

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>
            Principal Protected Notes
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, maxWidth: 720, lineHeight: 1.5 }}>
            Your principal is locked in a Meteora yield vault, always redeemable at face value. The expected yield over the maturity window is deployed into a prediction basket, so you only ever put yield at risk — never principal.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20 }}>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              <MetricTile label="PRINCIPAL" value="100% guaranteed" color={C.teal} sub="returned at maturity" />
              <MetricTile label="YIELD APY" value={`${(APY * 100).toFixed(2)}%`} color={C.green} sub="Meteora USDC vault" />
              <MetricTile label="UPSIDE" value="Basket payout" color={C.amber} sub="yield deployed into predictions" />
            </div>

            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 14 }}>PICK A REFERENCE BASKET</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {BUNDLES.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBundle(b.id)}
                    style={{
                      background: selectedBundle === b.id ? C.cardHover : C.surface,
                      border: `0.5px solid ${selectedBundle === b.id ? tc(b.tier) : C.border}`,
                      borderLeft: `3px solid ${tc(b.tier)}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      cursor: "pointer",
                      transition: `all 0.15s ${EASE}`,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{b.id}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, marginTop: 3 }}>
                      {b.tier}% tier · NAV {(b.nav * 100).toFixed(1)}% · {b.daysLeft}d left
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {state.ppnVaults.length > 0 && (
              <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 12 }}>YOUR VAULTS</div>
                {state.ppnVaults.map((v) => {
                  const b = bundleById(v.bundleId);
                  const elapsed = Math.max(0, (Date.now() - v.createdAt) / 86_400_000);
                  const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsed, v.maturityDays);
                  return (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `0.5px solid ${C.border}` }}>
                      <div>
                        <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD, fontWeight: 500 }}>{b?.id ?? v.bundleId}</div>
                        <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                          matures in {Math.max(0, v.maturityDays - Math.floor(elapsed))}d · {v.apy.toFixed(2)}% APY
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(v.principal, 2)}</div>
                        <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(accrued, 2)} accrued</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 16 }}>New PPN</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 6 }}>DEPOSIT USDC</div>
            <input
              type="number"
              placeholder="0"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 16,
                fontFamily: FD,
                background: C.surface,
                border: `0.5px solid ${C.border}`,
                borderRadius: 10,
                color: C.textPrimary,
                marginBottom: 14,
              }}
            />
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 6 }}>MATURITY (DAYS)</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              {[14, 30, 60, 90].map((d) => (
                <button
                  key={d}
                  onClick={() => setMaturityDays(d)}
                  style={{
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 8,
                    border: `0.5px solid ${maturityDays === d ? C.teal : C.border}`,
                    background: maturityDays === d ? C.teal + "18" : "transparent",
                    color: maturityDays === d ? C.teal : C.textSecondary,
                    fontSize: 12,
                    fontFamily: FS,
                    cursor: "pointer",
                  }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div style={{ background: C.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 12, fontFamily: FS }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Principal (safe)</span>
                <span style={{ color: C.teal }}>{dep > 0 ? fmtUsd(dep, 0) : "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Yield deployed</span>
                <span style={{ color: C.green }}>{dep > 0 ? fmtUsd(estimatedYield, 2) : "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textSecondary }}>At maturity (min)</span>
                <span style={{ color: C.textPrimary, fontWeight: 600 }}>{dep > 0 ? fmtUsd(dep, 0) : "-"}</span>
              </div>
            </div>
            <button
              onClick={handleDeposit}
              disabled={insufficient || dep <= 0}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: confirmed ? C.green : insufficient || dep <= 0 ? C.border : C.violet,
                color: insufficient || dep <= 0 ? C.textMuted : "#fff",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FD,
                cursor: insufficient || dep <= 0 ? "not-allowed" : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {confirmed ? "✓ PPN opened" : insufficient ? "Insufficient USDC" : "Open PPN"}
            </button>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, textAlign: "center", marginTop: 10 }}>
              Principal returns at maturity regardless of basket outcome
            </div>
          </div>
        </div>
      </PageFrame>
    </>
  );
}
