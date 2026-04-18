"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { Sparkline, MetricTile } from "../../_components/charts";
import { C, FS, FD, EASE, tc, fmtUsd } from "../../_lib/tokens";
import { bundleById } from "../../_lib/bundles";
import { useSandbox } from "../../_lib/demo-state";

export default function BasketDetail() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { state, dispatch } = useSandbox();
  const bundle = bundleById(params.id);
  const [amt, setAmt] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  if (!bundle) {
    return (
      <>
        <Header onResetClick={() => dispatch({ type: "reset" })} />
        <PageFrame>
          <div style={{ padding: 48, textAlign: "center", color: C.textMuted, fontFamily: FS }}>
            Basket not found. <Link href="/app/basket" style={{ color: C.teal }}>Back to all baskets</Link>
          </div>
        </PageFrame>
      </>
    );
  }

  const color = tc(bundle.tier);
  const dep = parseFloat(amt) || 0;
  const tokensOut = dep > 0 ? ((dep * 0.995) / bundle.nav).toFixed(2) : "-";
  const insufficient = dep > state.usdc;

  function handleConfirm() {
    if (dep <= 0 || insufficient) return;
    dispatch({ type: "basket/deposit", bundleId: bundle!.id, usdcAmount: dep });
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
        <Link href="/app/basket" style={{ fontSize: 13, color: C.textSecondary, textDecoration: "none", fontFamily: FS, display: "inline-flex", gap: 8, marginBottom: 20 }}>
          <span>←</span> Back to Baskets
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.textPrimary, fontFamily: FD, letterSpacing: "-0.01em", marginBottom: 6 }}>{bundle.id}</div>
            <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
              {bundle.resolved}/{bundle.totalLegs} legs resolved · {bundle.daysLeft}d remaining · resolves {bundle.date}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 44, fontWeight: 700, color, fontFamily: FD, lineHeight: 1, letterSpacing: "-0.02em" }}>{(bundle.nav * 100).toFixed(1)}%</div>
            <div style={{ fontSize: 13, fontFamily: FS, marginTop: 4 }}>
              <span style={{ color: C.textSecondary }}>${bundle.nav.toFixed(3)} · </span>
              <span style={{ color: bundle.change >= 0 ? C.green : C.red }}>
                {bundle.change >= 0 ? "+" : ""}
                {bundle.change.toFixed(1)}% today
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 16 }}>NAV · 30 DAY</div>
              <Sparkline data={bundle.history} color={color} height={140} width={700} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <MetricTile label="ISSUE PRICE" value={`$${bundle.issue.toFixed(2)}`} sub="per STHS token" />
              <MetricTile label="MAX PAYOUT" value="$1.00" color={C.green} sub="if all legs resolve YES" />
              <MetricTile label="BREAKEVEN" value={`${(bundle.nav * 100).toFixed(0)}%`} sub="implied probability" />
            </div>
          </div>

          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 16 }}>Deposit USDC</div>
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
                <span style={{ color: C.textSecondary }}>STHS tokens</span>
                <span style={{ color: C.textPrimary }}>{tokensOut}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Fee (0.5%)</span>
                <span style={{ color: C.textMuted }}>{dep > 0 ? fmtUsd(dep * 0.005, 2) : "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textSecondary }}>Max payout</span>
                <span style={{ color: C.green }}>{dep > 0 ? fmtUsd(parseFloat(tokensOut) * 1.0, 2) : "-"}</span>
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
                background: confirmed ? C.green : insufficient || dep <= 0 ? C.border : C.teal,
                color: insufficient || dep <= 0 ? C.textMuted : "#000",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FD,
                cursor: insufficient || dep <= 0 ? "not-allowed" : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {confirmed ? "✓ Deposited" : insufficient ? "Insufficient USDC" : "Deposit"}
            </button>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, textAlign: "center", marginTop: 10 }}>
              Sandbox · resets to $10,000
            </div>
          </div>
        </div>
      </PageFrame>
    </>
  );
}
