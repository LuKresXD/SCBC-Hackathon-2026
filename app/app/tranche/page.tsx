"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Header, PageFrame } from "../_components/Header";
import { C, FS, FD, FM, EASE, trancheColor, tc } from "../_lib/tokens";
import { useLiveBaskets, formatYieldPct } from "../_lib/use-live-baskets";
import { quoteTranchesLocal, type TrancheQuote } from "./_quote";
import type { LiveBasket } from "../_lib/live-baskets";

const TIER_LABEL: Record<90 | 70 | 50, string> = {
  90: "High probability",
  70: "Mid probability",
  50: "Low probability",
};

const WINDOW_LABEL: Record<"week" | "month" | "long", string> = {
  week: "Short term",
  month: "Medium term",
  long: "Long term",
};

export default function TranchesPage() {
  const router = useRouter();
  const state = useLiveBaskets();

  const groups = useMemo(() => {
    const empty: Record<90 | 70 | 50, LiveBasket[]> = { 90: [], 70: [], 50: [] };
    if (state.status !== "ok") return empty;
    for (const b of state.baskets) empty[b.tier].push(b);
    const winOrder: Record<"week" | "month" | "long", number> = {
      week: 0,
      month: 1,
      long: 2,
    };
    for (const t of [90, 70, 50] as const) {
      empty[t].sort((a, b) => winOrder[a.window] - winOrder[b.window]);
    }
    return empty;
  }, [state]);

  return (
    <>
      <Header />
      <PageFrame>
        <section style={{ marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: FD,
              fontSize: "clamp(28px, 3vw, 40px)",
              fontWeight: 400,
              letterSpacing: "-0.024em",
              color: C.textPrimary,
              margin: 0,
            }}
          >
            Tranches
          </h1>
          <p
            style={{
              fontFamily: FS,
              fontSize: 13,
              color: C.textSecondary,
              maxWidth: 620,
              margin: "10px 0 0",
              lineHeight: 1.55,
            }}
          >
            Split any live basket into{" "}
            <span style={{ color: trancheColor("senior") }}>senior</span>,{" "}
            <span style={{ color: trancheColor("mezzanine") }}>mezzanine</span> and{" "}
            <span style={{ color: trancheColor("junior") }}>junior</span> claims with a payout
            waterfall. Tranches track the same live Polymarket constellations as{" "}
            <a href="/app/basket" style={{ color: C.tealLight, textDecoration: "none" }}>
              /app/basket
            </a>
            , so NAV, legs and resolution dates stay in lock-step.
          </p>
        </section>

        {state.status === "loading" && <LoadingGrid />}
        {state.status === "error" && (
          <EmptyState title="Couldn't load live baskets" subtitle={state.error} />
        )}
        {state.status === "ok" && state.baskets.length === 0 && (
          <EmptyState
            title="No live baskets yet"
            subtitle="No tier × window combo has 10 liquid legs right now. Try again in a minute."
          />
        )}
        {state.status === "ok" && state.baskets.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {([90, 70, 50] as const).map((t) => {
              const baskets = groups[t];
              if (baskets.length === 0) return null;
              return (
                <TierGroup
                  key={t}
                  tier={t}
                  baskets={baskets}
                  onClick={(b) => router.push(`/app/tranche/${b.id}`)}
                />
              );
            })}
          </div>
        )}
      </PageFrame>
    </>
  );
}

/* ---------- Tier group (header + basket row) ---------- */

function TierGroup({
  tier,
  baskets,
  onClick,
}: {
  tier: 90 | 70 | 50;
  baskets: LiveBasket[];
  onClick: (b: LiveBasket) => void;
}) {
  const color = tc(tier);
  return (
    <section>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: color,
            boxShadow: `0 0 10px ${color}80`,
          }}
        />
        <span
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.22em",
            color,
            textTransform: "uppercase",
            fontWeight: 600,
          }}
        >
          {tier}% tier · {TIER_LABEL[tier]}
        </span>
        <span style={{ flex: 1, height: 1, background: C.border }} />
        <span
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.1em",
            color: C.textMuted,
          }}
        >
          {baskets.length} basket{baskets.length === 1 ? "" : "s"}
        </span>
      </header>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
          gap: 14,
        }}
      >
        {baskets.map((b) => (
          <BasketTrancheCard key={b.id} basket={b} onClick={() => onClick(b)} />
        ))}
      </div>
    </section>
  );
}

/* ---------- Basket card (one live basket + 3 tranche quotes) ---------- */

function BasketTrancheCard({
  basket,
  onClick,
}: {
  basket: LiveBasket;
  onClick: () => void;
}) {
  const color = tc(basket.tier);
  const quotes: TrancheQuote[] = useMemo(
    () => quoteTranchesLocal(basket.nav, basket.totalLegs, basket.daysLeft),
    [basket.nav, basket.totalLegs, basket.daysLeft],
  );

  // Rank by volume so the biggest live markets surface first, regardless
  // of whether the basket is large enough to tie the top legs on weight.
  const top = useMemo(
    () => [...basket.markets].sort((a, b) => b.volumeUsd - a.volumeUsd).slice(0, 3),
    [basket.markets],
  );

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        background: C.card,
        borderTop: `0.5px solid ${C.border}`,
        borderRight: `0.5px solid ${C.border}`,
        borderBottom: `0.5px solid ${C.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 14,
        padding: "18px 20px",
        cursor: "pointer",
        transition: `transform 0.15s ${EASE}, box-shadow 0.15s ${EASE}, background 0.15s ${EASE}`,
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = C.cardHover;
        el.style.transform = "translateY(-2px)";
        el.style.boxShadow = `0 12px 36px rgba(0,0,0,0.25), 0 0 0 1px ${color}22`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.background = C.card;
        el.style.transform = "translateY(0)";
        el.style.boxShadow = "none";
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontSize: 14,
              fontWeight: 600,
              color: C.textPrimary,
              fontFamily: FD,
              letterSpacing: "0.01em",
            }}
          >
            {basket.id}
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.textMuted,
              fontFamily: FM,
              marginTop: 4,
              letterSpacing: "0.04em",
            }}
          >
            {basket.totalLegs} legs · NAV {(basket.nav * 100).toFixed(1)}% ·{" "}
            {WINDOW_LABEL[basket.window]}
          </div>
        </div>
        <div
          style={{
            fontSize: 11,
            color,
            fontFamily: FM,
            fontWeight: 600,
            letterSpacing: "0.08em",
            whiteSpace: "nowrap",
          }}
        >
          {basket.daysLeft}d
        </div>
      </div>

      <div
        style={{
          background: C.surface,
          borderRadius: 10,
          padding: "10px 12px",
          marginBottom: 14,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: 9,
            color: C.textMuted,
            fontFamily: FM,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Top constituents
        </div>
        {top.map((m) => (
          <div
            key={m.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              fontFamily: FS,
            }}
          >
            <span
              style={{
                color: C.textSecondary,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                flex: 1,
                minWidth: 0,
              }}
            >
              {m.question}
            </span>
            <span
              style={{
                color,
                fontFamily: FM,
                fontSize: 10,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}
            >
              {((m.weight ?? 0) * 100).toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {quotes.map((q) => (
          <TrancheRow key={q.kind} quote={q} />
        ))}
      </div>
    </div>
  );
}

function TrancheRow({ quote }: { quote: TrancheQuote }) {
  const color = trancheColor(quote.kind);
  const attach = Math.round(quote.attach * 100);
  const detach = Math.round(quote.detach * 100);
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "14px 1fr auto",
        alignItems: "center",
        gap: 10,
        padding: "8px 12px",
        background: C.surface,
        borderRadius: 8,
        border: `0.5px solid ${C.border}`,
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: 2,
          background: color,
          boxShadow: `0 0 8px ${color}55`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <div
          style={{
            fontSize: 12,
            color: C.textPrimary,
            fontFamily: FD,
            fontWeight: 500,
            textTransform: "capitalize",
          }}
        >
          {quote.kind}
        </div>
        <div
          style={{
            fontSize: 10,
            color: C.textMuted,
            fontFamily: FM,
            letterSpacing: "0.04em",
          }}
        >
          {attach}–{detach}% · ${quote.pricePerToken.toFixed(2)}
        </div>
      </div>
      <div
        style={{
          fontFamily: FM,
          fontSize: 11,
          fontWeight: 600,
          color:
            quote.expectedYieldPct >= 0
              ? quote.expectedYieldPct >= 50
                ? C.green
                : C.tealLight
              : C.red,
          whiteSpace: "nowrap",
        }}
      >
        {formatYieldPct(quote.expectedYieldPct)} APY
      </div>
    </div>
  );
}

/* ---------- Loading / empty ---------- */

function LoadingGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
        gap: 14,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 220,
            background: C.card,
            border: `0.5px solid ${C.border}`,
            borderRadius: 14,
            opacity: 0.45,
          }}
        />
      ))}
    </div>
  );
}

function EmptyState({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div
      style={{
        padding: "48px 24px",
        textAlign: "center",
        background: C.card,
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
      }}
    >
      <div
        style={{
          fontFamily: FD,
          fontSize: 16,
          color: C.textPrimary,
          fontWeight: 500,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: FS,
          fontSize: 12,
          color: C.textSecondary,
          maxWidth: 420,
          margin: "0 auto",
          lineHeight: 1.6,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
