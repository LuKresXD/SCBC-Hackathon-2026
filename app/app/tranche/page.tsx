"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Header, PageFrame } from "../_components/Header";
import { C, FS, FD, EASE, trancheColor, tc } from "../_lib/tokens";
import { BUNDLES } from "../_lib/bundles";
import { quoteTranchesLocal, type TrancheQuote } from "./_quote";

export default function TranchesPage() {
  const router = useRouter();
  return (
    <>
      <Header />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Tranches</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Turn any basket into senior / mezzanine / junior claims with a payout waterfall
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 14 }}>
          {BUNDLES.map((b) => {
            const qs: TrancheQuote[] = quoteTranchesLocal(b.nav, b.totalLegs, b.daysLeft);
            return (
              <div
                key={b.id}
                onClick={() => router.push(`/app/tranche/${b.id}`)}
                style={{
                  background: C.card,
                  borderTop: `0.5px solid ${C.border}`,
                  borderRight: `0.5px solid ${C.border}`,
                  borderBottom: `0.5px solid ${C.border}`,
                  borderLeft: `3px solid ${tc(b.tier)}`,
                  borderRadius: 14,
                  padding: "18px 20px",
                  cursor: "pointer",
                  transition: `all 0.15s ${EASE}`,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{b.id}</div>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{b.totalLegs} legs · NAV {(b.nav * 100).toFixed(1)}%</div>
                  </div>
                  <div style={{ fontSize: 11, color: tc(b.tier), fontFamily: FS, fontWeight: 500 }}>{b.tier}% tier</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {qs.map((q) => (
                    <div key={q.kind} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: C.surface, borderRadius: 8, border: `0.5px solid ${C.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: 2, background: trancheColor(q.kind) }} />
                        <span style={{ fontSize: 12, color: C.textPrimary, fontFamily: FD, fontWeight: 500, textTransform: "capitalize" }}>{q.kind}</span>
                      </div>
                      <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS }}>
                        ${q.pricePerToken.toFixed(2)} · <span style={{ color: C.green }}>{q.expectedYieldPct.toFixed(1)}% APY</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </PageFrame>
    </>
  );
}
