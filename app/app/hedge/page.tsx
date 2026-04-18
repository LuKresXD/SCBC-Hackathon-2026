"use client";

import React, { useEffect, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, EASE, BACKEND_URL, fmtUsd } from "../_lib/tokens";
import { useSandbox } from "../_lib/demo-state";

type Market = { id: string; question: string; condition_id: string; yes_probability: number | null; volume_usd: number; category: string };

type LegDraft = { market_id: string; side: "YES" | "NO"; question: string };

type AnalyzeResp = {
  legs: Array<{ market_id: string; side: "YES" | "NO"; question: string; raw_yes_probability: number; effective_probability: number; weight: number }>;
  correlation: Array<{ a: number; b: number; corr: number }>;
  risk: { accepted: boolean; reason?: string; internal_corr_mean: number; var_95_projected: number; cvar_99_projected: number };
  delta_approx: number;
};

export default function HedgePage() {
  const { state, dispatch } = useSandbox();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [legs, setLegs] = useState<LegDraft[]>([]);
  const [analyze, setAnalyze] = useState<AnalyzeResp | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/markets/curated?limit=24&overfetch=120`)
      .then((r) => r.json())
      .then((body) => setMarkets(body.markets ?? []))
      .catch((e) => setErr((e as Error).message));
  }, []);

  useEffect(() => {
    if (legs.length < 2) {
      setAnalyze(null);
      return;
    }
    fetch(`${BACKEND_URL}/api/hedge/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ legs: legs.map((l) => ({ market_id: l.market_id, side: l.side, question: l.question })) }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (body.error) setErr(body.error);
        else {
          setAnalyze(body);
          setErr(null);
        }
      })
      .catch((e) => setErr((e as Error).message));
  }, [legs]);

  function addLeg(m: Market, side: "YES" | "NO") {
    if (legs.find((l) => l.market_id === m.condition_id && l.side === side)) return;
    setLegs((prev) => [...prev, { market_id: m.condition_id, side, question: m.question }]);
  }
  function removeLeg(i: number) {
    setLegs((prev) => prev.filter((_, idx) => idx !== i));
  }

  const basketSize = legs.length;

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Hedge Builder</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Build a custom long/short basket from live Polymarket markets. Correlation, risk, and delta are evaluated by the same ML model that gates production baskets.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 10 }}>AVAILABLE MARKETS</div>
            {err && <div style={{ color: C.red, fontFamily: FS, fontSize: 12, marginBottom: 10 }}>Error: {err}</div>}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {markets.map((m) => {
                const yes = m.yes_probability ?? 0.5;
                return (
                  <div key={m.condition_id} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.06em", marginBottom: 6 }}>{m.category.toUpperCase()}</div>
                    <div style={{ fontSize: 12, color: C.textPrimary, fontFamily: FS, lineHeight: 1.4, marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                      {m.question}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={() => addLeg(m, "YES")}
                        style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.teal}`, background: C.teal + "18", color: C.teal, fontSize: 11, fontFamily: FS, cursor: "pointer" }}
                      >
                        + YES · {(yes * 100).toFixed(0)}%
                      </button>
                      <button
                        onClick={() => addLeg(m, "NO")}
                        style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `0.5px solid ${C.coral}`, background: C.coral + "18", color: C.coral, fontSize: 11, fontFamily: FS, cursor: "pointer" }}
                      >
                        + NO · {((1 - yes) * 100).toFixed(0)}%
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18, marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 10 }}>
                Your basket ({basketSize} {basketSize === 1 ? "leg" : "legs"})
              </div>
              {legs.length === 0 ? (
                <div style={{ color: C.textMuted, fontSize: 12, fontFamily: FS, padding: "16px 0", textAlign: "center" }}>
                  Add at least 2 legs to analyze.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {legs.map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, color: l.side === "YES" ? C.teal : C.coral, fontFamily: FD, width: 28 }}>{l.side}</span>
                        <span style={{ fontSize: 11, color: C.textPrimary, fontFamily: FS, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {l.question}
                        </span>
                      </div>
                      <button
                        onClick={() => removeLeg(i)}
                        style={{ background: "none", border: "none", color: C.textMuted, fontSize: 14, cursor: "pointer", padding: 0, marginLeft: 8 }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {analyze && (
              <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 18 }}>
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 12 }}>RISK ANALYSIS</div>
                <div style={{ padding: "10px 12px", background: analyze.risk.accepted ? C.greenBg : C.redBg, border: `0.5px solid ${analyze.risk.accepted ? C.green : C.red}44`, borderRadius: 8, marginBottom: 12 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: analyze.risk.accepted ? C.green : C.red, fontFamily: FD, marginBottom: 4 }}>
                    {analyze.risk.accepted ? "✓ Accepted by risk gate" : "✗ Rejected by risk gate"}
                  </div>
                  {analyze.risk.reason && (
                    <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: FS, lineHeight: 1.4 }}>{analyze.risk.reason}</div>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <MetricTile label="INTERNAL ρ" value={analyze.risk.internal_corr_mean.toFixed(3)} sub="weighted pairwise corr" />
                  <MetricTile label="DELTA" value={analyze.delta_approx.toFixed(3)} color={Math.abs(analyze.delta_approx) < 0.05 ? C.green : C.amber} sub="basket vs 50-50" />
                  <MetricTile label="VaR 95" value={(analyze.risk.var_95_projected * 100).toFixed(2) + "%"} color={C.amber} sub="7-day horizon" />
                  <MetricTile label="CVaR 99" value={(analyze.risk.cvar_99_projected * 100).toFixed(2) + "%"} color={C.red} sub="expected tail loss" />
                </div>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 8 }}>OPTIMIZED WEIGHTS</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                  {analyze.legs.map((l, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, fontFamily: FS }}>
                      <span style={{ color: l.side === "YES" ? C.teal : C.coral, fontWeight: 600, width: 28 }}>{l.side}</span>
                      <div style={{ flex: 1, height: 6, background: C.surface, borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: `${l.weight * 100}%`, height: "100%", background: l.side === "YES" ? C.teal : C.coral }} />
                      </div>
                      <span style={{ color: C.textSecondary, width: 48, textAlign: "right" }}>{(l.weight * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </PageFrame>
    </>
  );
}
