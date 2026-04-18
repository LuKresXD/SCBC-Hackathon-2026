"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header, PageFrame } from "./_components/Header";
import { PulseGauge } from "./_components/charts";
import { C, FS, FD, FM, EASE, BACKEND_URL, fmtUsd } from "./_lib/tokens";
import { useSandbox } from "./_lib/demo-state";

type Curated = {
  id: string;
  question: string;
  condition_id: string;
  volume_usd: number;
  days_to_resolution: number | null;
  yes_probability: number | null;
  category: string;
};

const PRODUCTS = [
  { href: "/app/basket",  label: "Constellations",    sub: "Tokenized bundles of uncorrelated prediction markets", color: C.teal,   tag: "STHS TOKEN" },
  { href: "/app/tranche", label: "Tranches",           sub: "Senior / mezz / junior claims on basket payouts",      color: C.amber,  tag: "STRUCTURED" },
  { href: "/app/ppn",     label: "Principal Protected",sub: "100% capital-back note with yield-funded upside",      color: C.violet, tag: "PROTECTED" },
  { href: "/app/lending", label: "Lending / Repo",     sub: "Borrow against basket collateral at fixed rates",      color: C.blue,   tag: "LEVERAGE" },
];

export default function MarketsPage() {
  const { dispatch } = useSandbox();
  const [markets, setMarkets] = useState<Curated[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [cat, setCat] = useState<string>("all");

  useEffect(() => {
    let cancelled = false;
    async function pull() {
      try {
        const url =
          cat === "all"
            ? `${BACKEND_URL}/api/markets/curated?limit=40&overfetch=140`
            : `${BACKEND_URL}/api/markets/curated?limit=40&overfetch=200&category=${cat}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.json();
        if (!cancelled) { setMarkets(body.markets ?? []); setErr(null); }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    pull();
    const iv = setInterval(pull, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [cat]);

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>

        {/* Page header */}
        <div style={{ marginBottom: 32, position: "relative", paddingBottom: 24, borderBottom: "0.5px solid rgba(45, 212, 191, 0.1)" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: 140, background: "radial-gradient(ellipse at top right, rgba(45, 212, 191, 0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ width: 18, height: 1, background: C.tealLight, opacity: 0.6 }} />
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.22em", color: C.tealLight, fontWeight: 500 }}>MARKETS</span>
            <span style={{ width: 18, height: 1, background: C.tealLight, opacity: 0.6 }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 200, color: C.textPrimary, fontFamily: FD, marginBottom: 6, letterSpacing: "-0.02em" }}>
            The <span style={{ fontWeight: 500, background: `linear-gradient(90deg, ${C.tealLight} 0%, #a5f3fc 100%)`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>live sky</span>
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Live Polymarket markets, filtered through the Senthos NLP + quality pipeline
            {err && <span style={{ color: C.red, marginLeft: 10 }}>· feed offline: {err}</span>}
          </div>
        </div>

        {/* Product cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 36 }}>
          {PRODUCTS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                textDecoration: "none",
                background: "linear-gradient(135deg, rgba(15, 21, 32, 0.7) 0%, rgba(5, 8, 12, 0.85) 100%)",
                border: `0.5px solid rgba(255, 255, 255, 0.06)`,
                borderRadius: 16,
                padding: "20px 20px 18px",
                position: "relative",
                overflow: "hidden",
                backdropFilter: "blur(10px)",
                transition: `all 0.3s ${EASE}`,
                display: "block",
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.borderColor = p.color + "50";
                (e.currentTarget as HTMLElement).style.transform = "translateY(-3px)";
                (e.currentTarget as HTMLElement).style.boxShadow = `0 12px 32px rgba(0,0,0,0.4), 0 0 24px ${p.color}18`;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.06)";
                (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Top accent */}
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: p.color, opacity: 0.8 }} />
              {/* Corner glow */}
              <div style={{ position: "absolute", top: -50, right: -50, width: 150, height: 150, background: `radial-gradient(circle, ${p.color}25 0%, transparent 65%)`, pointerEvents: "none" }} />
              {/* Tag */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 100, background: p.color + "15", border: `0.5px solid ${p.color}40`, marginBottom: 12 }}>
                <span style={{ width: 4, height: 4, borderRadius: "50%", background: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                <span style={{ fontSize: 9, color: p.color, fontFamily: FM, letterSpacing: "0.14em", fontWeight: 500 }}>{p.tag}</span>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 6, letterSpacing: "-0.005em" }}>{p.label}</div>
              <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: FS, lineHeight: 1.5 }}>{p.sub}</div>
            </Link>
          ))}
        </div>

        {/* Category filters */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
          <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.5 }} />
          <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.18em", marginRight: 4 }}>FILTER</span>
          {["all", "crypto", "sports", "politics", "economics", "tech", "world"].map((k) => (
            <button
              key={k}
              onClick={() => setCat(k)}
              style={{
                padding: "6px 14px",
                borderRadius: 100,
                border: `0.5px solid ${cat === k ? C.tealLight : "rgba(255, 255, 255, 0.08)"}`,
                background: cat === k ? `${C.tealLight}15` : "rgba(15, 21, 32, 0.4)",
                color: cat === k ? C.tealLight : C.textSecondary,
                fontSize: 12,
                fontFamily: FD,
                cursor: "pointer",
                transition: `all 0.2s ${EASE}`,
                fontWeight: cat === k ? 500 : 400,
                boxShadow: cat === k ? `0 0 12px ${C.tealLight}20` : "none",
                letterSpacing: "0.01em",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Market feed */}
        {markets === null && !err && (
          <div style={{ color: C.textMuted, padding: "40px 0", fontSize: 13, fontFamily: FS, textAlign: "center" }}>
            Loading curated markets...
          </div>
        )}
        {markets && markets.length === 0 && (
          <div style={{ color: C.textMuted, padding: "40px 0", fontSize: 13, fontFamily: FS, textAlign: "center" }}>
            No markets match this filter.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {(markets ?? []).map((m) => {
            const pct = m.yes_probability == null ? null : m.yes_probability * 100;
            const color = pct == null ? C.textMuted : pct > 70 ? C.teal : pct > 45 ? C.amber : C.coral;
            return (
              <div
                key={m.id}
                style={{
                  background: "linear-gradient(135deg, rgba(15, 21, 32, 0.65) 0%, rgba(5, 8, 12, 0.8) 100%)",
                  border: "0.5px solid rgba(255, 255, 255, 0.06)",
                  borderRadius: 14,
                  padding: "14px 16px",
                  display: "flex",
                  gap: 12,
                  backdropFilter: "blur(10px)",
                  transition: `all 0.3s ${EASE}`,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = color + "40"; e.currentTarget.style.boxShadow = `0 0 18px ${color}12`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)"; e.currentTarget.style.boxShadow = "none"; }}
              >
                {pct != null && <PulseGauge prob={pct} color={color} size={48} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 500, color: C.textPrimary, fontFamily: FD }}>{pct != null ? pct.toFixed(1) + "%" : "-"}</span>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.08em", padding: "2px 6px", border: "0.5px solid rgba(255, 255, 255, 0.08)", borderRadius: 4 }}>
                      {m.category.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textPrimary, fontFamily: FS, lineHeight: 1.4, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {m.question}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, letterSpacing: "0.02em" }}>
                    {fmtUsd(m.volume_usd)} vol
                    {m.days_to_resolution != null && <> · resolves in {m.days_to_resolution.toFixed(0)}d</>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PageFrame>
    </>
  );
}