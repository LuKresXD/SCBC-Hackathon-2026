"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, EASE, trancheColor, tc, fmtUsd } from "../../_lib/tokens";
import { bundleById } from "../../_lib/bundles";
import { useSandbox, TrancheKind } from "../../_lib/demo-state";
import { quoteTranchesLocal } from "../_quote";

export default function TrancheDetail() {
  const params = useParams<{ id: string }>();
  const { state, dispatch } = useSandbox();
  const bundle = bundleById(params.id);
  const [kind, setKind] = useState<TrancheKind>("senior");
  const [amt, setAmt] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!bundle) {
    return (
      <>
        <Header onResetClick={() => dispatch({ type: "reset" })} />
        <PageFrame>
          <div style={{ padding: 48, textAlign: "center", color: C.textMuted, fontFamily: FS }}>
            Bundle not found. <Link href="/app/tranche" style={{ color: C.teal }}>Back to tranches</Link>
          </div>
        </PageFrame>
      </>
    );
  }

  const quotes = quoteTranchesLocal(bundle.nav, bundle.totalLegs, bundle.daysLeft);
  const q = quotes.find((x) => x.kind === kind)!;
  const dep = parseFloat(amt) || 0;
  const tokens = dep > 0 ? dep / q.pricePerToken : 0;
  const insufficient = dep > state.usdc;

  function handleConfirm() {
    if (dep <= 0 || insufficient) return;
    dispatch({
      type: "tranche/deposit",
      bundleId: bundle!.id,
      kind,
      usdcAmount: dep,
      pricePerToken: q.pricePerToken,
    });
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
        <Link href="/app/tranche" style={{ fontSize: 13, color: C.textSecondary, textDecoration: "none", fontFamily: FS, marginBottom: 20, display: "inline-block" }}>
          ← Back to tranches
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.textPrimary, fontFamily: FD, letterSpacing: "-0.01em", marginBottom: 6 }}>{bundle.id} · tranched</div>
            <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
              {bundle.totalLegs} legs · basket NAV {(bundle.nav * 100).toFixed(1)}% · resolves {bundle.date}
            </div>
          </div>
          <div style={{ fontSize: 11, color: tc(bundle.tier), fontFamily: FS, fontWeight: 500, padding: "4px 10px", background: tc(bundle.tier) + "18", borderRadius: 20 }}>
            {bundle.tier}% tier
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
              {quotes.map((tq) => (
                <div
                  key={tq.kind}
                  onClick={() => setKind(tq.kind)}
                  style={{
                    background: C.card,
                    border: `0.5px solid ${kind === tq.kind ? trancheColor(tq.kind) : C.border}`,
                    borderRadius: 14,
                    padding: "16px 18px",
                    cursor: "pointer",
                    transition: `all 0.2s ${EASE}`,
                    borderTop: `2px solid ${trancheColor(tq.kind)}`,
                    position: "relative",
                  }}
                >
                  <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 6, textTransform: "uppercase" }}>{tq.kind}</div>
                  <div style={{ fontSize: 22, fontWeight: 600, color: trancheColor(tq.kind), fontFamily: FD, letterSpacing: "-0.01em", marginBottom: 6 }}>
                    ${tq.pricePerToken.toFixed(2)}
                  </div>
                  <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginBottom: 8 }}>{tq.expectedYieldPct.toFixed(1)}% expected APY</div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, lineHeight: 1.5 }}>
                    Pays from {(tq.attach * 100).toFixed(0)}% – {(tq.detach * 100).toFixed(0)}% of basket payout
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 14 }}>WATERFALL · HIGHER WINS FIRST</div>
              <div style={{ display: "flex", height: 36, borderRadius: 8, overflow: "hidden", border: `0.5px solid ${C.border}`, marginBottom: 12 }}>
                {quotes.map((tq) => {
                  const span = (tq.detach - tq.attach) * 100;
                  return (
                    <div
                      key={tq.kind}
                      style={{
                        width: `${span}%`,
                        background: trancheColor(tq.kind),
                        opacity: kind === tq.kind ? 1 : 0.3,
                        transition: `opacity 0.2s ${EASE}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        color: "#001814",
                        fontFamily: FD,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {tq.kind}
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <MetricTile label="P[ATTACH]" value={(q.attachProbability * 100).toFixed(1) + "%"} sub="chance tranche pays anything" />
                <MetricTile label="P[FULL PAY]" value={(q.fullPayProbability * 100).toFixed(1) + "%"} color={C.green} sub="chance it pays face value" />
                <MetricTile label="DURATION" value={`${bundle.daysLeft}d`} sub="to resolution" />
              </div>
            </div>
          </div>

          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 16 }}>
              Deposit USDC · <span style={{ color: trancheColor(kind), textTransform: "capitalize" }}>{kind}</span>
            </div>
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
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginBottom: 14 }}>Wallet: ${state.usdc.toLocaleString()}</div>
            <div style={{ background: C.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 12, fontFamily: FS }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Tranche tokens</span>
                <span style={{ color: C.textPrimary }}>{dep > 0 ? tokens.toFixed(2) : "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Issue price</span>
                <span style={{ color: trancheColor(kind) }}>${q.pricePerToken.toFixed(2)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textSecondary }}>Max payout</span>
                <span style={{ color: C.green }}>{dep > 0 ? fmtUsd(tokens, 2) : "-"}</span>
              </div>
            </div>
            <button
              onClick={handleConfirm}
              disabled={insufficient || dep <= 0}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: confirmed ? C.green : insufficient || dep <= 0 ? C.border : trancheColor(kind),
                color: insufficient || dep <= 0 ? C.textMuted : "#001814",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FD,
                cursor: insufficient || dep <= 0 ? "not-allowed" : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {confirmed ? "✓ Deposited" : insufficient ? "Insufficient USDC" : `Deposit into ${kind}`}
            </button>
          </div>
        </div>
      </PageFrame>
    </>
  );
}
