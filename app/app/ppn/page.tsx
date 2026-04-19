"use client";

import React, { useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { ConnectWalletCard } from "../_components/ConnectWalletCard";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, EASE, tc } from "../_lib/tokens";
import { BUNDLES } from "../_lib/bundles";

export default function PpnPage() {
  const [selectedBundle, setSelectedBundle] = useState<string>(BUNDLES[0].id);
  const APY = 0.084;

  return (
    <>
      <Header />
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
                      borderTop: `0.5px solid ${selectedBundle === b.id ? tc(b.tier) : C.border}`,
                      borderRight: `0.5px solid ${selectedBundle === b.id ? tc(b.tier) : C.border}`,
                      borderBottom: `0.5px solid ${selectedBundle === b.id ? tc(b.tier) : C.border}`,
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
          </div>

          <ConnectWalletCard
            title="Open a PPN"
            subtitle={`Principal locked into a Meteora yield vault at ${(APY * 100).toFixed(2)}% APY. Accrued yield is deployed into reference basket ${selectedBundle}. Connect a Solana wallet to deposit USDC.`}
            accent={C.violet}
          />
        </div>
      </PageFrame>
    </>
  );
}
