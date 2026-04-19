"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { ConnectWalletCard } from "../../_components/ConnectWalletCard";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, EASE, trancheColor, tc } from "../../_lib/tokens";
import { bundleById } from "../../_lib/bundles";
import { quoteTranchesLocal } from "../_quote";

type TrancheKind = "senior" | "mezzanine" | "junior";

export default function TrancheDetail() {
  const params = useParams<{ id: string }>();
  const bundle = bundleById(params.id);
  const [kind, setKind] = useState<TrancheKind>("senior");

  if (!bundle) {
    return (
      <>
        <Header />
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

  return (
    <>
      <Header />
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
                    borderTop: `2px solid ${trancheColor(tq.kind)}`,
                    borderRight: `0.5px solid ${kind === tq.kind ? trancheColor(tq.kind) : C.border}`,
                    borderBottom: `0.5px solid ${kind === tq.kind ? trancheColor(tq.kind) : C.border}`,
                    borderLeft: `0.5px solid ${kind === tq.kind ? trancheColor(tq.kind) : C.border}`,
                    borderRadius: 14,
                    padding: "16px 18px",
                    cursor: "pointer",
                    transition: `all 0.2s ${EASE}`,
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

          <ConnectWalletCard
            title={`Buy ${kind} tranche`}
            subtitle={`Issue price $${q.pricePerToken.toFixed(2)} · ${q.expectedYieldPct.toFixed(1)}% expected APY. Connect a Solana wallet to deposit USDC into the ${kind} tranche.`}
            accent={trancheColor(kind)}
          />
        </div>
      </PageFrame>
    </>
  );
}
