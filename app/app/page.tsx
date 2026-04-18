"use client";
/**
 * Markets page (root of /app).
 *
 * Lists live Polymarket markets from the filter pipeline and deep-links into
 * the four product primitives. The older monolithic app has been split across
 * dedicated routes under /app/basket, /app/tranche, /app/ppn, /app/lending,
 * /app/hedge, and /app/portfolio.
 */

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Header, PageFrame } from "./_components/Header";
import { PulseGauge } from "./_components/charts";
import { C, FS, FD, EASE, BACKEND_URL, fmtUsd } from "./_lib/tokens";
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
        if (!cancelled) {
          setMarkets(body.markets ?? []);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    }
    pull();
    const iv = setInterval(pull, 30000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [cat]);

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Markets</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Live Polymarket markets · filtered through the Senthos NLP + quality pipeline
            {err && <span style={{ color: C.red, marginLeft: 10 }}>· feed offline: {err}</span>}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
          {[
            { href: "/app/basket", label: "Native Baskets", sub: "tokenized index of uncorrelated events", color: C.teal },
            { href: "/app/tranche", label: "Tranches", sub: "senior / mezz / junior claims", color: C.amber },
            { href: "/app/ppn", label: "Principal Protected", sub: "100% capital-back structured note", color: C.violet },
            { href: "/app/lending", label: "Lending / Repo", sub: "borrow against basket collateral", color: C.blue },
          ].map((p) => (
            <Link
              key={p.href}
              href={p.href}
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderRadius: 12,
                padding: "16px 18px",
                textDecoration: "none",
                transition: `all 0.15s ${EASE}`,
                borderTop: `2px solid ${p.color}`,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 6 }}>{p.label}</div>
              <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: FS, lineHeight: 1.45 }}>{p.sub}</div>
            </Link>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          {["all", "crypto", "sports", "politics", "economics", "tech", "world"].map((k) => (
            <button
              key={k}
              onClick={() => setCat(k)}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: `0.5px solid ${cat === k ? C.teal : C.border}`,
                background: cat === k ? C.teal + "18" : "transparent",
                color: cat === k ? C.teal : C.textSecondary,
                fontSize: 12,
                fontFamily: FS,
                cursor: "pointer",
              }}
            >
              {k}
            </button>
          ))}
        </div>

        {markets === null && !err && <div style={{ color: C.textMuted, padding: "24px 0", fontSize: 13, fontFamily: FS }}>Loading curated markets…</div>}
        {markets && markets.length === 0 && <div style={{ color: C.textMuted, padding: "24px 0", fontSize: 13, fontFamily: FS }}>No markets match this filter.</div>}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
          {(markets ?? []).map((m) => {
            const pct = m.yes_probability == null ? null : m.yes_probability * 100;
            const color = pct == null ? C.textMuted : pct > 70 ? C.teal : pct > 45 ? C.amber : C.coral;
            return (
              <div
                key={m.id}
                style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "14px 16px", display: "flex", gap: 12 }}
              >
                {pct != null && <PulseGauge prob={pct} color={color} size={48} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: C.textPrimary, fontFamily: FD }}>
                      {pct != null ? pct.toFixed(1) + "%" : "-"}
                    </span>
                    <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", padding: "2px 6px", border: `0.5px solid ${C.border}`, borderRadius: 4 }}>
                      {m.category.toUpperCase()}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: C.textPrimary, fontFamily: FS, lineHeight: 1.35, marginBottom: 4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }}>
                    {m.question}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS }}>
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
