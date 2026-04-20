"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { ConnectWalletCard } from "../../_components/ConnectWalletCard";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, FM, EASE, trancheColor, tc, fmtUsd } from "../../_lib/tokens";
import { bundleById, type Bundle } from "../../_lib/bundles";
import { useLiveBaskets } from "../../_lib/use-live-baskets";
import { quoteTranchesLocal } from "../_quote";

type TrancheKind = "senior" | "mezzanine" | "junior";

export default function TrancheDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const basketState = useLiveBaskets();
  // Pre-select the tab from ?tier=… when the user lands here via an AI rec.
  const queryTier = search?.get("tier");
  const initialKind: TrancheKind =
    queryTier === "senior" || queryTier === "mezzanine" || queryTier === "junior"
      ? queryTier
      : "senior";
  const [kind, setKind] = useState<TrancheKind>(initialKind);
  // Amount from ?amount=… so we can surface it in the buy card.
  const rawAmount = search?.get("amount");
  const recommendedAmount = rawAmount != null && Number.isFinite(parseFloat(rawAmount))
    ? parseFloat(rawAmount)
    : null;

  // Same resolution priority as /app/basket/[id]: live cache wins when
  // available (real leg count, real resolution span), seed only as a
  // fallback for offline / degraded mode. The old code called
  // `bundleById(params.id)` directly, which now finds the seed for every
  // live id since the two id spaces were unified — that meant the
  // tranche detail was permanently pinned to stale 12-leg seed data.
  const bundle: Bundle | null = useMemo(() => {
    if (basketState.status === "ok") {
      const live = basketState.baskets.find((b) => b.id === params.id);
      if (live) return live;
    }
    return bundleById(params.id) ?? null;
  }, [params.id, basketState]);

  if (!bundle) {
    // Only show "not found" once the live fetch has resolved — otherwise
    // a brief flicker of "Bundle not found" appears on cold loads while
    // the shared cache is still pending.
    if (basketState.status === "loading") {
      return (
        <>
          <Header />
          <PageFrame>
            <div style={{ padding: 48, textAlign: "center", color: C.textMuted, fontFamily: FS }}>
              Loading basket…
            </div>
          </PageFrame>
        </>
      );
    }
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

          <div>
            {recommendedAmount != null && (
              <div style={{
                background: `${trancheColor(kind)}12`,
                border: `1px solid ${trancheColor(kind)}55`,
                borderRadius: 12,
                padding: "12px 14px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <div style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: `${trancheColor(kind)}22`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={trancheColor(kind)} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" />
                  </svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: trancheColor(kind), fontFamily: FM, letterSpacing: "0.18em", fontWeight: 500, marginBottom: 3 }}>
                    PERSONALIZATION · RECOMMENDED
                  </div>
                  <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD, fontWeight: 500 }}>
                    Deposit {fmtUsd(recommendedAmount, recommendedAmount % 1 === 0 ? 0 : 2)}
                  </div>
                </div>
              </div>
            )}
            <ConnectWalletCard
              title={`Buy ${kind} tranche`}
              subtitle={`Issue price $${q.pricePerToken.toFixed(2)} · ${q.expectedYieldPct.toFixed(1)}% expected APY.${recommendedAmount != null ? ` Your Personalization recommended depositing ${fmtUsd(recommendedAmount, recommendedAmount % 1 === 0 ? 0 : 2)} into the ${kind} tranche.` : ""} Connect a Solana wallet to deposit USDC into the ${kind} tranche.`}
              accent={trancheColor(kind)}
            />
          </div>
        </div>
      </PageFrame>
    </>
  );
}
