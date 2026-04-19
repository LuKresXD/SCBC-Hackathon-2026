"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { ConnectWalletCard } from "../../_components/ConnectWalletCard";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, FM, EASE, tc } from "../../_lib/tokens";
import { bundleById, type Bundle } from "../../_lib/bundles";
import type { LiveBasket, LiveMarket, WindowKey } from "../../_lib/live-baskets";
import { useLiveBaskets } from "../../_lib/use-live-baskets";

type ResolvedBasket =
  | { kind: "live"; basket: LiveBasket }
  | { kind: "seed"; basket: Bundle }
  | { kind: "missing" };

const WINDOW_LABEL: Record<WindowKey, string> = {
  week: "Short term",
  month: "Medium term",
  long: "Long term",
};

export default function BasketDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const basketState = useLiveBaskets();

  // Resolve the basket for this id. **Live data wins when available** —
  // the seed bundle exists only as a fallback for offline / degraded
  // mode. Since the seed ids now mirror the live-grid ids (STHS-HIGH-
  // SHORT, etc.) a naive "seed first" lookup would permanently shadow
  // the live basket's real leg count, constituents list and resolution
  // span. Priority order:
  //   1. live cache has this id       → kind: "live"
  //   2. live still loading            → "loading" (seed would be a lie
  //                                      if live is about to show up)
  //   3. live errored / id not in grid → seed if we have one, else missing
  const resolved: ResolvedBasket | "loading" = useMemo(() => {
    if (basketState.status === "ok") {
      const live = basketState.baskets.find((b) => b.id === id);
      if (live) return { kind: "live", basket: live };
      const seed = bundleById(id);
      return seed ? { kind: "seed", basket: seed } : { kind: "missing" };
    }
    if (basketState.status === "loading") return "loading";
    // error state
    const seed = bundleById(id);
    return seed ? { kind: "seed", basket: seed } : { kind: "missing" };
  }, [id, basketState]);

  if (resolved === "loading") {
    return (
      <>
        <Header />
        <PageFrame>
          <LoadingSkeleton />
        </PageFrame>
      </>
    );
  }

  if (resolved.kind === "missing") {
    return (
      <>
        <Header />
        <PageFrame>
          <div
            style={{
              padding: 48,
              textAlign: "center",
              color: C.textMuted,
              fontFamily: FS,
            }}
          >
            Basket not found.{" "}
            <Link href="/app/basket" style={{ color: C.teal }}>
              Back to all baskets
            </Link>
          </div>
        </PageFrame>
      </>
    );
  }

  const bundle = resolved.basket;
  const color = tc(bundle.tier);
  const tierLabel =
    bundle.tier === 90 ? "High" : bundle.tier === 70 ? "Mid" : "Low";
  const liveMarkets: LiveMarket[] =
    resolved.kind === "live" ? resolved.basket.markets : [];
  const windowLabel: string | null =
    resolved.kind === "live" ? WINDOW_LABEL[resolved.basket.window] : null;

  return (
    <>
      <Header />
      <PageFrame>
        <Link
          href="/app/basket"
          style={{
            fontSize: 13,
            color: C.textSecondary,
            textDecoration: "none",
            fontFamily: FS,
            display: "inline-flex",
            gap: 8,
            marginBottom: 20,
          }}
        >
          <span>←</span> Back to Baskets
        </Link>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 24,
            gap: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 10,
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
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color,
                  textTransform: "uppercase",
                }}
              >
                {tierLabel}
                {windowLabel ? ` · ${windowLabel}` : ""}
              </span>
            </div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 700,
                color: C.textPrimary,
                fontFamily: FD,
                letterSpacing: "-0.01em",
                marginBottom: 6,
              }}
            >
              {bundle.id}
            </div>
            <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
              {renderHeaderMeta(bundle, liveMarkets)}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color,
                fontFamily: FD,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              {(bundle.nav * 100).toFixed(1)}%
            </div>
            <div style={{ fontSize: 13, fontFamily: FS, marginTop: 4 }}>
              <span style={{ color: C.textSecondary }}>${bundle.nav.toFixed(3)} · </span>
              <span style={{ color: bundle.change >= 0 ? C.green : C.red }}>
                {bundle.change >= 0 ? "+" : ""}
                {bundle.change.toFixed(1)}% today
              </span>
            </div>
          </div>
        </div>

        <div
          className="basket-detail-grid"
          style={{
            display: "grid",
            // minmax(0, 1fr) on the left lets long questions wrap instead
            // of blowing out the grid; the right column collapses to full
            // width below 900px via the media query in basket-detail.css
            // so the deposit card doesn't get squeezed at high zoom.
            gridTemplateColumns: "minmax(0, 1fr) 340px",
            alignItems: "start",
            gap: 20,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <div
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderRadius: 14,
                padding: "18px 20px 14px",
              }}
            >
              <DetailChart
                history={bundle.history}
                dayHistory={bundle.dayHistory}
                hourHistory={bundle.hourHistory}
                color={color}
                currentNav={bundle.nav}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              <MetricTile
                label="ISSUE PRICE"
                value={`$${bundle.issue.toFixed(2)}`}
                sub="per STHS token"
              />
              <MetricTile
                label="MAX PAYOUT"
                value="$1.00"
                color={C.green}
                sub="if all legs resolve YES"
              />
              {/* BREAKEVEN used to sit here but just repeated the NAV%.
                  Replaced with TOTAL VOLUME — live Polymarket volume
                  summed across every leg. When the live feed is
                  unavailable we show a dash instead of faking a number. */}
              <MetricTile
                label="TOTAL VOLUME"
                value={formatTotalVolume(liveMarkets)}
                sub={
                  liveMarkets.length > 0
                    ? `across ${liveMarkets.length} live legs`
                    : "live feed unavailable"
                }
              />
            </div>

            {liveMarkets.length > 0 && (
              <ConstituentTable markets={liveMarkets} tierColor={color} />
            )}
          </div>

          {/* alignSelf:start pins the deposit card to the top of the
              right column so it doesn't stretch to match the (much
              taller) constituent table on the left — which used to
              leave a huge dark void below the wallet button. */}
          <div style={{ alignSelf: "start", position: "sticky", top: 72 }}>
            <ConnectWalletCard
              title={`Deposit into ${bundle.id}`}
              subtitle="Connect a Solana wallet to buy STHS at live NAV. USDC is deposited into the traxis_vault program for this bundle."
              accent={color}
            />
          </div>
        </div>
        <style>{BASKET_DETAIL_CSS}</style>
      </PageFrame>
    </>
  );
}

// Media-query overrides for the detail grid. Stacks the deposit card
// below the main column once the viewport drops under 900px (which
// matches what happens at high browser zoom on a standard 14" laptop).
const BASKET_DETAIL_CSS = `
  @media (max-width: 900px) {
    .basket-detail-grid {
      grid-template-columns: minmax(0, 1fr) !important;
    }
    .basket-detail-grid > div[style*="position: sticky"] {
      position: static !important;
    }
  }
`;

/* ---------- Constituents ---------- */

// Constituents shown on the detail page. We sort by weight desc and only
// surface the top slice — baskets can be 100+ legs, and the top few are
// what dominate the weighted NAV anyway.
const TOP_CONSTITUENTS = 5;

function ConstituentTable({
  markets,
  tierColor,
}: {
  markets: LiveMarket[];
  tierColor: string;
}) {
  // Rank by 24h-liquidity proxy (lifetime volume USD) so the biggest
  // markets surface first. Weight ties are common once the basket is
  // large enough for all top legs to hit the max-weight clamp, so sorting
  // by weight would be effectively random within that tie.
  const sorted = useMemo(
    () => [...markets].sort((a, b) => b.volumeUsd - a.volumeUsd),
    [markets],
  );
  const rows = sorted.slice(0, TOP_CONSTITUENTS);
  const weightCovered = rows.reduce((s, m) => s + (m.weight ?? 0), 0);

  return (
    <div
      style={{
        background: C.card,
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `0.5px solid ${C.border}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: C.textMuted,
            fontFamily: FM,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Top {rows.length} of {sorted.length} constituents ·{" "}
          {(weightCovered * 100).toFixed(1)}% of basket
        </div>
        <div
          style={{
            fontFamily: FM,
            fontSize: 11,
            color: C.textSecondary,
            letterSpacing: "0.06em",
          }}
        >
          live from polymarket
        </div>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "28px 80px minmax(200px, 1fr) 70px 74px 90px 80px 32px",
          alignItems: "center",
          padding: "10px 20px",
          borderBottom: `0.5px solid ${C.border}`,
          fontFamily: FM,
          fontSize: 10,
          letterSpacing: "0.12em",
          color: C.textMuted,
          textTransform: "uppercase",
          columnGap: 12,
        }}
      >
        <div>#</div>
        <div>Category</div>
        <div>Question</div>
        <div style={{ textAlign: "right" }}>Weight</div>
        <div style={{ textAlign: "right" }}>Prob</div>
        <div style={{ textAlign: "right" }}>Volume</div>
        <div style={{ textAlign: "right" }}>Resolves</div>
        <div />
      </div>
      {rows.map((m, i) => (
        <ConstituentRow
          key={m.id}
          index={i + 1}
          market={m}
          tierColor={tierColor}
          isLast={i === rows.length - 1}
        />
      ))}
    </div>
  );
}

/* ---------- Responsive detail chart ----------
 *
 * The chart is driven by a single `history` array (365 most-recent daily
 * NAV points ending at `currentNav`). The range picker above the chart
 * slices the tail of this array — we never re-synthesize data — so
 * switching ranges is instant, deterministic, and can't introduce
 * jitter between renders.
 *
 * Why the data pipeline looks the way it does:
 *   • Catmull-Rom → cubic Bezier produces a genuinely smooth line even
 *     on 7D (few points); the old quadratic-midpoint path would kink on
 *     sharp direction changes.
 *   • The y-axis auto-scales per slice with a small visual pad so tight
 *     series (e.g. +–0.3% over 7 days) still have breathing room and
 *     don't render as a hairline at the plot baseline.
 *   • `niceTicks` rounds the tick values to 1–2/5 of the nearest
 *     power-of-ten so the axis labels read as "94%, 95%, 96%" rather
 *     than "93.74%, 95.11%, 96.48%".
 *   • X-axis labels collapse to 3 points (range start / midpoint /
 *     "Now") — this is enough orientation without crowding on narrow
 *     viewports.
 */

type ChartRange = "1H" | "1D" | "7D" | "30D" | "6M" | "1Y";
type ChartSource = "hour" | "day" | "year";

const CHART_RANGES: Array<{
  key: ChartRange;
  label: string;        // compact pill label ("1H", "1D", ...)
  longLabel: string;    // prose form for the header ("1 hour", "24 hour", ...)
  totalMinutes: number; // total timespan rendered, used for x-axis labels
  source: ChartSource;  // which of the three history arrays to slice from
  points: number;       // desired slice length from `source` (tail-most)
}> = [
  { key: "1H",  label: "1H",  longLabel: "1 hour",   totalMinutes: 60,             source: "hour", points: 60 },
  { key: "1D",  label: "1D",  longLabel: "24 hour",  totalMinutes: 60 * 24,        source: "day",  points: 288 },
  { key: "7D",  label: "7D",  longLabel: "7 day",    totalMinutes: 60 * 24 * 7,    source: "year", points: 7 },
  { key: "30D", label: "30D", longLabel: "30 day",   totalMinutes: 60 * 24 * 30,   source: "year", points: 30 },
  { key: "6M",  label: "6M",  longLabel: "6 month",  totalMinutes: 60 * 24 * 180,  source: "year", points: 180 },
  { key: "1Y",  label: "1Y",  longLabel: "1 year",   totalMinutes: 60 * 24 * 365,  source: "year", points: 365 },
];

function DetailChart({
  history,
  dayHistory,
  hourHistory,
  color,
  currentNav,
}: {
  history: number[];
  dayHistory: number[];
  hourHistory: number[];
  color: string;
  currentNav: number;
}) {
  const [range, setRange] = useState<ChartRange>("1D");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 700, h: 180 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(160, Math.floor(e.contentRect.width));
        setSize((prev) => (prev.w === w ? prev : { ...prev, w }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const activeRange = CHART_RANGES.find((r) => r.key === range) ?? CHART_RANGES[1];

  // Pick the right source array per range so 1H doesn't try to slice 60
  // minutes out of a daily-resolution array (which would give one point).
  // Guard against any source that came in empty by falling back to the
  // year-resolution series.
  const data = useMemo(() => {
    const pickSource = (): number[] => {
      if (activeRange.source === "hour" && hourHistory.length > 0) return hourHistory;
      if (activeRange.source === "day" && dayHistory.length > 0) return dayHistory;
      return history;
    };
    const source = pickSource();
    if (source.length === 0) return [] as number[];
    const want = Math.min(source.length, activeRange.points + 1);
    return source.slice(-want);
  }, [activeRange, history, dayHistory, hourHistory]);

  // The x-axis is labelled in wall-clock terms, not "days ago", so the
  // label formatter needs to know the full span — not the number of
  // rendered points (which for 1D is 288 but represents 24 hours).
  const totalMinutes = activeRange.totalMinutes;

  const W = size.w;
  const H = size.h;
  const padL = 6;
  const padR = 58; // room for y-axis label gutter
  const padT = 14;
  const padB = 26; // room for x-axis labels
  const plotW = Math.max(1, W - padL - padR);
  const plotH = Math.max(1, H - padT - padB);

  const headerLabel = `NAV · ${activeRange.longLabel}`;

  // Render the framing chrome even when we have <2 data points so the
  // range picker doesn't disappear on first paint.
  if (data.length < 2) {
    return (
      <>
        <ChartHeader
          label={headerLabel}
          currentNav={currentNav}
          range={range}
          onRangeChange={setRange}
        />
        <div ref={wrapRef} style={{ width: "100%", height: H }} />
      </>
    );
  }

  const rawMin = Math.min(...data);
  const rawMax = Math.max(...data);
  // Visual padding so a near-flat series still has breathing room. Use a
  // floor of 0.2% of NAV or the raw variance × 0.18, whichever is larger.
  const variance = Math.max(0, rawMax - rawMin);
  const pad = Math.max(currentNav * 0.002, variance * 0.18, 0.0005);
  const yMin = Math.max(0, rawMin - pad);
  const yMax = Math.min(1, rawMax + pad);
  const yRange = yMax - yMin || 0.0001;

  const pts = data.map((v, i) => ({
    x: padL + (i / (data.length - 1)) * plotW,
    y: padT + (1 - (v - yMin) / yRange) * plotH,
  }));

  const linePath = catmullRomPath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x} ${padT + plotH} L ${pts[0].x} ${padT + plotH} Z`;

  // Y-axis ticks: 4 “nice” values spread across [yMin, yMax]
  const yTicks = niceTicks(yMin, yMax, 4);
  // X-axis: 3 labels at start / mid / now. Formatting scales with the
  // range — time-of-day for 1H/1D, dates for everything >=7D.
  const xLabels = computeXLabels(totalMinutes);

  const last = pts[pts.length - 1];
  const lastVal = data[data.length - 1];
  const gradId = `detail-fill-${color.replace("#", "")}`;

  return (
    <>
      <ChartHeader
        label={headerLabel}
        currentNav={currentNav}
        range={range}
        onRangeChange={setRange}
      />
      <div ref={wrapRef} style={{ width: "100%" }}>
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block" }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* y-axis gridlines at nice-tick values */}
          {yTicks.map((t, i) => {
            const y = padT + (1 - (t - yMin) / yRange) * plotH;
            return (
              <line
                key={`g-${i}`}
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.045)"
                strokeWidth={1}
              />
            );
          })}

          {/* y-axis labels */}
          {yTicks.map((t, i) => {
            const y = padT + (1 - (t - yMin) / yRange) * plotH;
            return (
              <text
                key={`yl-${i}`}
                x={W - padR + 8}
                y={y + 3}
                fill={C.textMuted}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize={10}
                letterSpacing="0.04em"
              >
                {formatPct(t)}
              </text>
            );
          })}

          {/* area fill */}
          <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
          {/* line */}
          <path
            d={linePath}
            fill="none"
            stroke={color}
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* x-axis labels */}
          {xLabels.map((lab, i) => {
            const x = padL + (i / (xLabels.length - 1)) * plotW;
            const anchor =
              i === 0 ? "start" : i === xLabels.length - 1 ? "end" : "middle";
            return (
              <text
                key={`xl-${i}`}
                x={x}
                y={H - 8}
                fill={C.textMuted}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize={10}
                letterSpacing="0.04em"
                textAnchor={anchor}
              >
                {lab}
              </text>
            );
          })}

          {/* current-value marker + callout */}
          <circle cx={last.x} cy={last.y} r={4} fill={color} />
          <circle cx={last.x} cy={last.y} r={8} fill={color} opacity={0.18} />
          <text
            x={last.x + 8}
            y={Math.max(padT + 10, last.y - 8)}
            fill={color}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={11}
            fontWeight={500}
          >
            {(lastVal * 100).toFixed(1)}%
          </text>
        </svg>
      </div>
    </>
  );
}

function ChartHeader({
  label,
  currentNav,
  range,
  onRangeChange,
}: {
  label: string;
  currentNav: number;
  range: ChartRange;
  onRangeChange: (r: ChartRange) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        marginBottom: 12,
        flexWrap: "wrap",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span
          style={{
            fontSize: 11,
            color: C.textMuted,
            fontFamily: FM,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: FM,
            fontSize: 11,
            color: C.textSecondary,
            letterSpacing: "0.04em",
          }}
        >
          ${currentNav.toFixed(3)}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Chart time range"
        style={{
          display: "inline-flex",
          padding: 2,
          borderRadius: 999,
          background: "rgba(10, 15, 24, 0.55)",
          border: `0.5px solid ${C.border}`,
        }}
      >
        {CHART_RANGES.map((r) => {
          const active = r.key === range;
          return (
            <button
              key={r.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onRangeChange(r.key)}
              style={{
                padding: "4px 11px",
                fontFamily: FM,
                fontSize: 11,
                fontWeight: active ? 600 : 500,
                letterSpacing: "0.04em",
                color: active ? C.tealLight : C.textSecondary,
                background: active ? `${C.tealLight}14` : "transparent",
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
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Catmull-Rom-to-Bezier path. Produces a visually smooth curve through
 * every data point without the angularity of a midpoint-quadratic path.
 * Tension=0.5 keeps overshoot minimal on choppy data.
 */
function catmullRomPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 >= pts.length ? pts.length - 1 : i + 2];
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return path;
}

/**
 * Pick `target` tick values between `min` and `max` rounded to a nice
 * step (1 / 2 / 5 × 10^n). The returned array is always inside the
 * [min, max] interval.
 */
function niceTicks(min: number, max: number, target: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [min];
  }
  const span = max - min;
  const rawStep = span / Math.max(1, target - 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const step = (norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 0.001; v += step) {
    if (v >= min - step * 0.001) ticks.push(Number(v.toFixed(10)));
  }
  // Guarantee at least 2 ticks so the axis isn't empty on very tight slices.
  if (ticks.length < 2) return [min, max];
  return ticks;
}

/** Format a 0..1 probability value to a percentage with adaptive precision. */
function formatPct(v: number): string {
  const pct = v * 100;
  // Use more precision when the value is small so low-tier baskets don't
  // collapse to "0%" on the y-axis.
  if (pct >= 10) return `${pct.toFixed(1)}%`;
  if (pct >= 1) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(2)}%`;
}

/**
 * Produce 3 x-axis labels (start / midpoint / "Now") formatted for the
 * active range. The formatter switches shape based on span:
 *   • ≤ 3 hours  → "HH:MM"   (1H range)
 *   • ≤ 48 hours → "H\u202fAM/PM" (1D range)
 *   • ≤ 90 days  → "MMM D"   (7D / 30D)
 *   • >  90 days  → "MMM 'YY" (6M / 1Y)
 */
function computeXLabels(totalMinutes: number): string[] {
  if (totalMinutes <= 0) return ["Now"];
  const now = new Date();
  const start = new Date(now.getTime() - totalMinutes * 60_000);
  const mid = new Date(now.getTime() - (totalMinutes / 2) * 60_000);

  if (totalMinutes <= 60 * 3) {
    const fmt: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };
    return [start.toLocaleTimeString([], fmt), mid.toLocaleTimeString([], fmt), "Now"];
  }
  if (totalMinutes <= 60 * 48) {
    const fmt: Intl.DateTimeFormatOptions = { hour: "numeric" };
    return [start.toLocaleTimeString([], fmt), mid.toLocaleTimeString([], fmt), "Now"];
  }
  const totalDays = totalMinutes / 1440;
  const useLong = totalDays > 90;
  const fmt: Intl.DateTimeFormatOptions = useLong
    ? { month: "short", year: "2-digit" }
    : { month: "short", day: "numeric" };
  const toStr = (d: Date) => d.toLocaleDateString("en-US", fmt);
  return [toStr(start), toStr(mid), "Now"];
}

/**
 * Build the meta line under the basket id. Live baskets show the
 * leg count and first / last resolution days (pulled from per-leg
 * `daysToResolution`), which is far more informative than the old
 * "0/N resolved · Xd remaining · resolves DATE" string where the
 * first fragment was structurally always "0/N" (live pipeline filters
 * out closed markets upstream). Seed fallbacks keep the short
 * resolution line since they don't carry per-leg data.
 */
function renderHeaderMeta(
  bundle: Bundle,
  liveMarkets: LiveMarket[],
): React.ReactNode {
  if (liveMarkets.length > 0) {
    const daysList = liveMarkets
      .map((m) => m.daysToResolution)
      .filter((d) => Number.isFinite(d));
    if (daysList.length === 0) {
      return `${bundle.totalLegs} legs · resolution dates pending`;
    }
    const first = Math.max(0, Math.round(Math.min(...daysList)));
    const last = Math.max(0, Math.round(Math.max(...daysList)));
    if (first === last) {
      return `${bundle.totalLegs} legs · all resolve in ${first}d`;
    }
    return `${bundle.totalLegs} legs · first resolves in ${first}d · last in ${last}d`;
  }
  // Seed fallback — no per-leg data to draw on.
  const daysPart = Number.isFinite(bundle.daysLeft)
    ? `${bundle.daysLeft}d to resolution`
    : "resolution TBD";
  const datePart =
    bundle.date && bundle.date !== "Invalid Date" ? ` · ${bundle.date}` : "";
  return `${bundle.totalLegs} legs · ${daysPart}${datePart}`;
}

/**
 * Format total lifetime Polymarket volume across a basket's legs. Used
 * by the MetricTile so the value is always live rather than a stubbed
 * BREAKEVEN% that duplicated the NAV.
 */
function formatTotalVolume(markets: LiveMarket[]): string {
  if (markets.length === 0) return "—";
  const total = markets.reduce((s, m) => s + (Number.isFinite(m.volumeUsd) ? m.volumeUsd : 0), 0);
  if (total >= 1_000_000_000) return `$${(total / 1_000_000_000).toFixed(1)}B`;
  if (total >= 1_000_000) return `$${(total / 1_000_000).toFixed(1)}M`;
  if (total >= 1_000) return `$${(total / 1_000).toFixed(0)}K`;
  return `$${total.toFixed(0)}`;
}

// Build a Polymarket URL that actually resolves. Gamma exposes two slugs:
//   - market.slug   → polymarket.com/market/<market-slug>
//   - event.slug    → polymarket.com/event/<event-slug>[/<market-slug>]
// The old code linked to a 0x… conditionId, which just 404s on Polymarket.
function polymarketHref(market: LiveMarket): string {
  if (market.eventSlug && market.marketSlug) {
    return `https://polymarket.com/event/${market.eventSlug}/${market.marketSlug}`;
  }
  if (market.marketSlug) {
    return `https://polymarket.com/market/${market.marketSlug}`;
  }
  if (market.eventSlug) {
    return `https://polymarket.com/event/${market.eventSlug}`;
  }
  // Last-resort fallback — Polymarket's site search handles free text.
  return `https://polymarket.com/search?q=${encodeURIComponent(market.question)}`;
}

function ConstituentRow({
  index,
  market,
  tierColor,
  isLast,
}: {
  index: number;
  market: LiveMarket;
  tierColor: string;
  isLast: boolean;
}) {
  const [hov, setHov] = useState(false);
  const href = polymarketHref(market);
  const days = Math.max(0, Math.round(market.daysToResolution));
  const weightPct = (market.weight ?? 0) * 100;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns:
          "28px 80px minmax(200px, 1fr) 70px 74px 90px 80px 32px",
        alignItems: "center",
        padding: "12px 20px",
        borderBottom: isLast ? "none" : `0.5px solid ${C.border}`,
        background: hov ? "rgba(45, 212, 191, 0.03)" : "transparent",
        textDecoration: "none",
        transition: `background 0.15s ${EASE}`,
        columnGap: 12,
      }}
    >
      <div
        style={{
          fontFamily: FM,
          fontSize: 11,
          color: C.textMuted,
          letterSpacing: "0.04em",
        }}
      >
        {String(index).padStart(2, "0")}
      </div>
      <div
        style={{
          fontFamily: FM,
          fontSize: 10,
          color: C.textSecondary,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {market.category}
      </div>
      <div
        style={{
          fontFamily: FD,
          fontSize: 13,
          color: C.textPrimary,
          lineHeight: 1.35,
          overflow: "hidden",
          textOverflow: "ellipsis",
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
      >
        {market.question}
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: FM,
          fontSize: 13,
          fontWeight: 600,
          color: C.textPrimary,
          letterSpacing: "0.01em",
        }}
      >
        {weightPct.toFixed(1)}%
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: FM,
          fontSize: 13,
          fontWeight: 500,
          color: tierColor,
          letterSpacing: "0.01em",
        }}
      >
        {(market.probability * 100).toFixed(1)}%
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: FM,
          fontSize: 12,
          color: C.textSecondary,
        }}
      >
        {formatUsd(market.volumeUsd)}
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: FM,
          fontSize: 12,
          color: C.textSecondary,
        }}
      >
        {days}d
      </div>
      <div
        style={{
          textAlign: "right",
          fontFamily: FM,
          fontSize: 12,
          color: hov ? tierColor : C.textMuted,
          transition: `color 0.15s ${EASE}`,
        }}
      >
        ↗
      </div>
    </a>
  );
}

function formatUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function LoadingSkeleton() {
  return (
    <div>
      <div
        style={{
          height: 13,
          width: 140,
          background: C.border,
          borderRadius: 4,
          marginBottom: 24,
          opacity: 0.5,
        }}
      />
      <div
        style={{
          height: 72,
          width: "70%",
          background: C.border,
          borderRadius: 8,
          marginBottom: 18,
          opacity: 0.3,
        }}
      />
      <div
        style={{
          height: 200,
          background: C.card,
          border: `0.5px solid ${C.border}`,
          borderRadius: 14,
        }}
      />
    </div>
  );
}
