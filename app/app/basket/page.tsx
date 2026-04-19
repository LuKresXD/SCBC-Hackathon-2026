"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Header, PageFrame } from "../_components/Header";
import { Sparkline } from "../_components/charts";
import { C, FS, FD, FM, EASE, tc, tl } from "../_lib/tokens";
import { BUNDLES, type Bundle } from "../_lib/bundles";
import {
  isLiveBasket,
  type BasketSlot,
  type LiveBasket,
  type WindowKey,
} from "../_lib/live-baskets";
import { useLiveBaskets } from "../_lib/use-live-baskets";

type TierFilter = "all" | 90 | 70 | 50;
type WindowFilter = "all" | "week" | "month" | "long";
type SortOption =
  | "grid"
  | "change_desc"
  | "change_asc"
  | "nav_desc"
  | "nav_asc"
  | "days_asc";

const WINDOW_LABEL: Record<Exclude<WindowFilter, "all">, string> = {
  week: "This week",
  month: "This month",
  long: "Long term",
};

const SORT_LABEL: Record<SortOption, string> = {
  grid: "By tier · time",
  change_desc: "Top gainers",
  change_asc: "Top losers",
  nav_desc: "Highest prob",
  nav_asc: "Lowest prob",
  days_asc: "Expiring soon",
};

// Rendering order for the natural grid sort.
const WINDOW_ORDER: Record<WindowKey, number> = { week: 0, month: 1, long: 2 };
const TIER_ORDER: Record<90 | 70 | 50, number> = { 90: 0, 70: 1, 50: 2 };

function formatDaysLeft(days: number): string {
  if (!Number.isFinite(days)) return "TBD";
  if (days <= 0) return "Resolving";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatAgo(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
}

type DataState =
  | { status: "loading" }
  | { status: "ok"; slots: BasketSlot[]; at: number; source: "live" }
  | { status: "fallback"; baskets: Bundle[]; error: string; source: "seed" };

export default function BasketsPage() {
  const router = useRouter();
  const [tier, setTier] = useState<TierFilter>("all");
  const [win, setWin] = useState<WindowFilter>("all");
  const [sort, setSort] = useState<SortOption>("grid");
  const [query, setQuery] = useState("");
  const basketState = useLiveBaskets();

  // Derive our local view from the shared cache. The shared hook already
  // deduplicates fetches across every /app/* page — we just reshape its
  // output into the existing DataState to keep the UI tree unchanged.
  const data: DataState = useMemo(() => {
    if (basketState.status === "loading") return { status: "loading" };
    if (basketState.status === "error") {
      return {
        status: "fallback",
        baskets: BUNDLES,
        error: basketState.error,
        source: "seed",
      };
    }
    return {
      status: "ok",
      slots: basketState.baskets as unknown as BasketSlot[],
      at: basketState.at,
      source: "live",
    };
  }, [basketState]);

  // The grid mixes real live baskets (LiveBasket) with placeholder slots for
  // tier×window combos that don't have 10 live legs yet. Fallback mode shows
  // only seeded bundles (no placeholders).
  const slots: BasketSlot[] =
    data.status === "ok"
      ? data.slots
      : data.status === "fallback"
        ? data.baskets.map((b) => ({
            ...b,
            live: true as const,
            window: (tl(b.daysLeft) === "This week"
              ? "week"
              : tl(b.daysLeft) === "This month"
                ? "month"
                : "long") as WindowKey,
            markets: [],
          }))
        : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = slots.filter((s) => {
      if (tier !== "all" && s.tier !== tier) return false;
      if (win !== "all" && s.window !== win) return false;
      if (q && !s.id.toLowerCase().includes(q)) return false;
      return true;
    });

    // "grid" sort keeps the canonical 3×3 layout (rows = tier 90→50,
    // cols = window week→long). Placeholders stay in their natural slot so
    // the grid is uniform even when some combos don't have 10 live legs.
    if (sort === "grid") {
      return matching.sort((a, b) => {
        const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
        if (tierDiff !== 0) return tierDiff;
        return WINDOW_ORDER[a.window] - WINDOW_ORDER[b.window];
      });
    }

    // For every other sort mode, push placeholders to the bottom so the
    // real baskets surface first in the chosen ranking.
    return matching.sort((a, b) => {
      const aLive = isLiveBasket(a);
      const bLive = isLiveBasket(b);
      if (aLive !== bLive) return aLive ? -1 : 1;
      if (!aLive || !bLive) return 0;
      if (sort === "change_desc") return b.change - a.change;
      if (sort === "change_asc") return a.change - b.change;
      if (sort === "nav_desc") return b.nav - a.nav;
      if (sort === "nav_asc") return a.nav - b.nav;
      return a.daysLeft - b.daysLeft;
    });
  }, [slots, tier, win, sort, query]);

  return (
    <>
      <Header />
      <style>{BASKET_CSS}</style>
      <PageFrame>
        {/* Hero */}
        <section style={{ marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: FD,
              fontSize: "clamp(32px, 3.6vw, 44px)",
              lineHeight: 1.05,
              letterSpacing: "-0.028em",
              fontWeight: 400,
              color: C.textPrimary,
              margin: 0,
            }}
          >
            Baskets
          </h1>
          <p
            style={{
              fontFamily: FS,
              fontSize: 14,
              lineHeight: 1.5,
              color: C.textSecondary,
              maxWidth: 540,
              margin: "10px 0 0",
            }}
          >
            Buy a basket of prediction markets as one token
          </p>
        </section>

        {/* Toolbar */}
        <section
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 10,
            marginBottom: 20,
          }}
        >
          <PillGroup<TierFilter>
            value={tier}
            onChange={setTier}
            options={[
              { value: "all", label: "All" },
              { value: 90, label: "High", color: tc(90) },
              { value: 70, label: "Mid", color: tc(70) },
              { value: 50, label: "Low", color: tc(50) },
            ]}
          />
          <PillGroup<WindowFilter>
            value={win}
            onChange={setWin}
            options={[
              { value: "all", label: "Any" },
              { value: "week", label: "Short" },
              { value: "month", label: "Medium" },
              { value: "long", label: "Long" },
            ]}
          />
          <div style={{ flex: 1 }} />
          <SearchInput value={query} onChange={setQuery} />
          <SortMenu value={sort} onChange={setSort} />
        </section>

        {/* Grid */}
        {data.status === "fallback" && (
          <div
            style={{
              marginBottom: 14,
              padding: "10px 14px",
              borderRadius: 10,
              border: `0.5px solid rgba(217, 119, 6, 0.28)`,
              background: "rgba(217, 119, 6, 0.07)",
              color: "#fbbf24",
              fontFamily: FM,
              fontSize: 11,
              letterSpacing: "0.06em",
            }}
          >
            Live feed unavailable · showing sandbox data · {data.error}
          </div>
        )}
        {data.status === "loading" ? (
          <LoadingGrid />
        ) : filtered.length === 0 ? (
          <EmptyState onReset={() => { setTier("all"); setWin("all"); setQuery(""); }} />
        ) : (
          <div
            style={{
              display: "grid",
              // auto-fit collapses empty tracks so the visible cards always
              // stretch to fill the row evenly (no phantom 4th column on
              // wide monitors where 3 cards otherwise leave a gap on the
              // right). minmax keeps a sensible min so cards don’t squish.
              gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
              gap: 20,
              alignItems: "stretch",
            }}
          >
            {filtered.map((s, i) =>
              isLiveBasket(s) ? (
                <BasketCard
                  key={s.id}
                  bundle={s}
                  onClick={() => router.push(`/app/basket/${s.id}`)}
                  shimmerDelay={(i % 6) * 0.9}
                />
              ) : (
                <PlaceholderCard key={s.id} tier={s.tier} window={s.window} />
              ),
            )}
          </div>
        )}

        {data.status === "ok" && (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              fontFamily: FM,
              fontSize: 11,
              letterSpacing: "0.08em",
              color: C.textSecondary,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: C.tealLight,
                  boxShadow: `0 0 8px ${C.tealLight}99`,
                }}
              />
              Live · polymarket · updated {formatAgo(data.at)}
            </span>
          </div>
        )}
      </PageFrame>
    </>
  );
}

/* ---------- Chart-forward card ---------- */

function BasketCard({
  bundle,
  onClick,
  shimmerDelay,
}: {
  bundle: Bundle;
  onClick: () => void;
  shimmerDelay: number;
}) {
  const [hov, setHov] = useState(false);
  const color = tc(bundle.tier);
  const posChange = bundle.change >= 0;
  const urgent = bundle.daysLeft <= 20;
  const tierCls = `basket-card-tier-${bundle.tier}`;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={`basket-card ${tierCls} ${hov ? "basket-card--hov" : ""}`}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        borderRadius: 16,
        padding: "1.2px", // thickness of animated border frame
        cursor: "pointer",
        overflow: "hidden",
        transition: `transform 0.25s ${EASE}, box-shadow 0.25s ${EASE}`,
        transform: hov ? "translateY(-3px)" : "translateY(0)",
        boxShadow: hov
          ? `0 14px 36px rgba(0,0,0,0.42), 0 0 30px ${color}22`
          : "0 4px 14px rgba(0,0,0,0.18)",
      }}
    >
      {/* Rotating conic gradient border (per tier) */}
      <span aria-hidden className="basket-card__border" />

      {/* Inner content surface */}
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: 20,
          borderRadius: 14.8,
          background: hov
            ? "linear-gradient(160deg, rgba(15, 22, 34, 0.94) 0%, rgba(6, 10, 18, 0.96) 100%)"
            : "linear-gradient(160deg, rgba(12, 18, 28, 0.88) 0%, rgba(6, 10, 18, 0.94) 100%)",
          overflow: "hidden",
          transition: `background 0.25s ${EASE}`,
          backdropFilter: "blur(10px)",
        }}
      >
        {/* Corner halo — brighter on hover */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: -70,
            right: -70,
            width: 200,
            height: 200,
            background: `radial-gradient(circle, ${color}2a 0%, transparent 65%)`,
            opacity: hov ? 1 : 0.55,
            transition: `opacity 0.25s ${EASE}`,
            pointerEvents: "none",
          }}
        />
        {/* Diagonal shimmer sweep */}
        <span
          aria-hidden
          className="basket-card__shimmer"
          style={{ animationDelay: `${shimmerDelay}s` }}
        />

        {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, position: "relative" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                background: color,
                boxShadow: `0 0 10px ${color}80`,
                flexShrink: 0,
              }}
            />
            <div
              style={{
                fontFamily: FD,
                fontSize: 15,
                fontWeight: 500,
                color: C.textPrimary,
                letterSpacing: "0.01em",
              }}
            >
              {bundle.id}
            </div>
          </div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 11,
              color: C.textMuted,
              marginTop: 6,
              letterSpacing: "0.02em",
            }}
          >
            {bundle.totalLegs} legs · {bundle.tier === 90 ? "high" : bundle.tier === 70 ? "mid" : "low"} probability
          </div>
        </div>
        <span
          style={{
            flexShrink: 0,
            marginTop: 2,
            fontFamily: FM,
            fontSize: 11,
            fontWeight: 500,
            color: urgent ? color : C.textSecondary,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          {formatDaysLeft(bundle.daysLeft)}
        </span>
      </div>

      {/* Chart — the star of the card. `bundle.history` is a full year of
          daily NAV points; the card preview always shows the most-recent
          30 days so the visual matches the "today" numbers below. The
          full history is only consumed by the basket detail page. */}
      <div
        style={{
          position: "relative",
          height: 120,
          margin: "0 -4px",
        }}
      >
        <Sparkline data={bundle.history.slice(-30)} color={color} height={120} />
      </div>

      {/* Footer: probability + 24h change + resolves */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 12,
          position: "relative",
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FD,
              fontSize: 28,
              fontWeight: 300,
              color,
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {(bundle.nav * 100).toFixed(1)}%
          </div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 11,
              color: C.textMuted,
              marginTop: 6,
            }}
          >
            ${bundle.nav.toFixed(3)}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontFamily: FM,
              fontSize: 13,
              fontWeight: 500,
              color: posChange ? C.green : C.red,
              letterSpacing: "0.01em",
            }}
          >
            {posChange ? "+" : ""}
            {bundle.change.toFixed(1)}% today
          </div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 11,
              color: C.textMuted,
              marginTop: 6,
              letterSpacing: "0.02em",
            }}
          >
            Resolves {bundle.date}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

/* ---------- Toolbar building blocks ---------- */

type PillOption<V> = { value: V; label: string; color?: string };

function PillGroup<V extends string | number>({
  value,
  onChange,
  options,
}: {
  value: V;
  onChange: (v: V) => void;
  options: PillOption<V>[];
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        borderRadius: 999,
        background: "rgba(10, 15, 24, 0.55)",
        border: `0.5px solid ${C.border}`,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        const accent = o.color ?? C.tealLight;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              padding: "5px 13px",
              fontFamily: FD,
              fontSize: 12,
              fontWeight: active ? 500 : 400,
              letterSpacing: "0.01em",
              color: active ? accent : C.textSecondary,
              background: active ? `${accent}14` : "transparent",
              border: "none",
              borderRadius: 999,
              cursor: "pointer",
              transition: `color 0.15s ${EASE}, background 0.15s ${EASE}`,
            }}
            onMouseEnter={(e) => {
              if (!active) (e.currentTarget as HTMLElement).style.color = C.textPrimary;
            }}
            onMouseLeave={(e) => {
              if (!active) (e.currentTarget as HTMLElement).style.color = C.textSecondary;
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 999,
        border: `0.5px solid ${focus ? C.borderHover : C.border}`,
        background: "rgba(10, 15, 24, 0.55)",
        transition: `border-color 0.15s ${EASE}`,
        width: 220,
      }}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <circle cx="7" cy="7" r="5" stroke={C.textMuted} strokeWidth="1.2" />
        <path d="M11 11L14 14" stroke={C.textMuted} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        placeholder="Search"
        style={{
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          outline: "none",
          color: C.textPrimary,
          fontFamily: FD,
          fontSize: 12,
          letterSpacing: "0.01em",
        }}
      />
    </div>
  );
}

function SortMenu({
  value,
  onChange,
}: {
  value: SortOption;
  onChange: (s: SortOption) => void;
}) {
  return (
    <label
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        padding: "6px 26px 6px 14px",
        borderRadius: 999,
        border: `0.5px solid ${C.border}`,
        background: "rgba(10, 15, 24, 0.55)",
        cursor: "pointer",
      }}
    >
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortOption)}
        style={{
          appearance: "none",
          WebkitAppearance: "none",
          MozAppearance: "none",
          background: "transparent",
          border: "none",
          color: C.textPrimary,
          fontFamily: FD,
          fontSize: 12,
          letterSpacing: "0.01em",
          cursor: "pointer",
          outline: "none",
          paddingRight: 4,
        }}
      >
        {(Object.keys(SORT_LABEL) as SortOption[]).map((k) => (
          <option key={k} value={k} style={{ background: C.bg, color: C.textPrimary }}>
            {SORT_LABEL[k]}
          </option>
        ))}
      </select>
      <span
        aria-hidden
        style={{
          position: "absolute",
          right: 12,
          top: "50%",
          transform: "translateY(-50%)",
          fontSize: 9,
          color: C.textMuted,
          pointerEvents: "none",
        }}
      >
        ▾
      </span>
    </label>
  );
}

function PlaceholderCard({ tier, window: win }: { tier: 90 | 70 | 50; window: WindowKey }) {
  const color = tc(tier);
  const tierLabel = tier === 90 ? "High" : tier === 70 ? "Mid" : "Low";
  const winLabel = win === "week" ? "Short term" : win === "month" ? "Medium term" : "Long term";
  return (
    <div
      style={{
        position: "relative",
        borderRadius: 16,
        padding: 20,
        minHeight: 250,
        display: "flex",
        flexDirection: "column",
        background: "rgba(8, 12, 20, 0.35)",
        border: `0.5px dashed ${C.border}`,
        overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            border: `1px solid ${color}`,
            opacity: 0.45,
          }}
        />
        <div
          style={{
            fontFamily: FD,
            fontSize: 14,
            fontWeight: 500,
            color: C.textSecondary,
            letterSpacing: "0.01em",
          }}
        >
          {tierLabel} · {winLabel}
        </div>
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span
          style={{
            fontFamily: FM,
            fontSize: 11,
            letterSpacing: "0.16em",
            color: C.textMuted,
            textTransform: "uppercase",
          }}
        >
          Not yet available
        </span>
      </div>
    </div>
  );
}

function LoadingGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
        gap: 20,
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 250,
            borderRadius: 16,
            border: `0.5px solid ${C.border}`,
            background:
              "linear-gradient(160deg, rgba(12, 18, 28, 0.6) 0%, rgba(6, 10, 18, 0.75) 100%)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <span
            style={{
              position: "absolute",
              inset: 0,
              background:
                "linear-gradient(100deg, transparent 40%, rgba(255,255,255,0.04) 50%, transparent 60%)",
              animation: "basket-shimmer 2.4s ease-in-out infinite",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div
      style={{
        border: `0.5px dashed ${C.border}`,
        borderRadius: 16,
        padding: "60px 24px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ fontFamily: FD, fontSize: 16, color: C.textPrimary, fontWeight: 500 }}>
        No baskets match
      </div>
      <div style={{ fontFamily: FS, fontSize: 13, color: C.textSecondary, maxWidth: 320 }}>
        Try a different tier, resolution window, or clear the search
      </div>
      <button
        onClick={onReset}
        style={{
          marginTop: 4,
          padding: "7px 16px",
          borderRadius: 100,
          border: `0.5px solid ${C.borderHover}`,
          background: "rgba(45, 212, 191, 0.08)",
          color: C.tealLight,
          fontFamily: FD,
          fontSize: 12,
          letterSpacing: "0.02em",
          cursor: "pointer",
          transition: `all 0.2s ${EASE}`,
        }}
      >
        Reset filters
      </button>
    </div>
  );
}

/* ---------- Animated gradient border + shimmer CSS ---------- */

const BASKET_CSS = `
@keyframes basket-spin {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes basket-shimmer {
  0%   { transform: translateX(-130%) skewX(-18deg); opacity: 0; }
  20%  { opacity: 0.22; }
  60%  { opacity: 0.22; }
  100% { transform: translateX(230%) skewX(-18deg); opacity: 0; }
}
@keyframes basket-pulse {
  0%, 100% { opacity: 0.16; }
  50%      { opacity: 0.32; }
}

.basket-card {
  isolation: isolate;
}
.basket-card__border {
  position: absolute;
  inset: -40%;
  width: 180%;
  height: 180%;
  z-index: 0;
  border-radius: 50%;
  animation: basket-spin 18s linear infinite, basket-pulse 7s ease-in-out infinite;
  pointer-events: none;
  filter: blur(0.6px);
}
.basket-card--hov .basket-card__border {
  animation: basket-spin 10s linear infinite, basket-pulse 5s ease-in-out infinite;
}

.basket-card-tier-90 .basket-card__border {
  background: conic-gradient(
    from 0deg,
    rgba(94, 234, 212, 0) 0%,
    rgba(94, 234, 212, 0.35) 18%,
    rgba(45, 212, 191, 0.28) 30%,
    rgba(6, 182, 212, 0) 48%,
    rgba(20, 184, 166, 0.30) 70%,
    rgba(94, 234, 212, 0) 100%
  );
}
.basket-card-tier-70 .basket-card__border {
  background: conic-gradient(
    from 0deg,
    rgba(251, 191, 36, 0) 0%,
    rgba(253, 230, 138, 0.30) 18%,
    rgba(251, 191, 36, 0.28) 30%,
    rgba(245, 158, 11, 0) 48%,
    rgba(249, 115, 22, 0.28) 70%,
    rgba(251, 191, 36, 0) 100%
  );
}
.basket-card-tier-50 .basket-card__border {
  background: conic-gradient(
    from 0deg,
    rgba(244, 114, 182, 0) 0%,
    rgba(251, 113, 133, 0.32) 18%,
    rgba(239, 68, 68, 0.26) 30%,
    rgba(244, 114, 182, 0) 48%,
    rgba(251, 146, 60, 0.28) 70%,
    rgba(220, 38, 38, 0) 100%
  );
}

.basket-card__shimmer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(
    105deg,
    transparent 42%,
    rgba(255, 255, 255, 0.025) 49%,
    rgba(255, 255, 255, 0.05) 50%,
    rgba(255, 255, 255, 0.025) 51%,
    transparent 58%
  );
  mix-blend-mode: screen;
  animation: basket-shimmer 11s ease-in-out infinite;
  opacity: 0;
}
.basket-card--hov .basket-card__shimmer {
  animation-duration: 6s;
}

@media (prefers-reduced-motion: reduce) {
  .basket-card__border,
  .basket-card__shimmer { animation: none !important; }
}
`;
