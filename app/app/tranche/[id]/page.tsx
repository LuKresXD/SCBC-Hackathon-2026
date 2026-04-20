"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Header, PageFrame } from "../../_components/Header";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, FM, EASE, trancheColor, tc } from "../../_lib/tokens";
import { bundleById, type Bundle } from "../../_lib/bundles";
import type { LiveBasket, LiveMarket } from "../../_lib/live-baskets";
import { useLiveBaskets, formatYieldPct } from "../../_lib/use-live-baskets";
import { useSandbox } from "../../_lib/demo-state";
import {
  fetchOrderbooks,
  quoteSideImpact,
  SLIPPAGE_BPS_CEILING,
  type Orderbook,
} from "../../_lib/orderbook";
import {
  computeBasketStats,
  quoteTranchesFromStats,
  quoteTrancheOrder,
  betaShapeMatching,
  type BasketStats,
  type TrancheQuote,
  type TrancheKind,
} from "../_quote";
import {
  useWalletSigner,
  useUsdcBalance,
  explorerTxUrl,
} from "../../_lib/wallet-bridge";
import { ppnDeposit, PpnError } from "../../_lib/ppn-client";

const WINDOW_LABEL: Record<"week" | "month" | "long", string> = {
  week: "Short term",
  month: "Medium term",
  long: "Long term",
};

const TIER_LABEL: Record<90 | 70 | 50, string> = {
  90: "High",
  70: "Mid",
  50: "Low",
};

type ResolvedBasket =
  | { kind: "live"; basket: LiveBasket }
  | { kind: "seed"; basket: Bundle }
  | { kind: "missing" };

export default function TrancheDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const basketState = useLiveBaskets();
  const [selectedKind, setSelectedKind] = useState<TrancheKind>("senior");

  // Same resolution priority as /app/basket/[id]: live cache wins when
  // available, seed is fallback only. Without this, the live id space
  // gets permanently shadowed by the stale seed bundle.
  const resolved: ResolvedBasket | "loading" = useMemo(() => {
    if (basketState.status === "ok") {
      const live = basketState.baskets.find((b) => b.id === id);
      if (live) return { kind: "live", basket: live };
      const seed = bundleById(id);
      return seed ? { kind: "seed", basket: seed } : { kind: "missing" };
    }
    if (basketState.status === "loading") return "loading";
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
            <Link href="/app/tranche" style={{ color: C.teal }}>
              Back to tranches
            </Link>
          </div>
        </PageFrame>
      </>
    );
  }

  const bundle = resolved.basket;
  const markets: LiveMarket[] =
    resolved.kind === "live" ? resolved.basket.markets : [];
  const windowLabel: string | null =
    resolved.kind === "live" ? WINDOW_LABEL[resolved.basket.window] : null;

  const stats = computeBasketStats(
    bundle.nav,
    markets,
    bundle.totalLegs,
    bundle.daysLeft,
    bundle.tier,
  );
  const quotes = quoteTranchesFromStats(stats);
  const selected = quotes.find((q) => q.kind === selectedKind) ?? quotes[0];
  const tierColor = tc(bundle.tier);
  const selectedColor = trancheColor(selected.kind);

  return (
    <>
      <Header />
      <PageFrame>
        <Link
          href="/app/tranche"
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
          <span>←</span> Back to Tranches
        </Link>

        {/* Hero */}
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
          <div style={{ minWidth: 0 }}>
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
                  background: tierColor,
                  boxShadow: `0 0 10px ${tierColor}80`,
                }}
              />
              <span
                style={{
                  fontFamily: FM,
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  color: tierColor,
                  textTransform: "uppercase",
                }}
              >
                {TIER_LABEL[bundle.tier]}
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
              {bundle.id} <span style={{ color: C.textMuted, fontWeight: 300 }}>· tranched</span>
            </div>
            {/* Meta line: flex-separated stats with value emphasis,
                no middots. Matches the list-page meta style. */}
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 16,
                rowGap: 4,
                fontSize: 13,
                fontFamily: FS,
                color: C.textSecondary,
              }}
            >
              <span>{bundle.totalLegs} legs</span>
              <span>
                NAV{" "}
                <span style={{ color: C.textPrimary, fontWeight: 500 }}>
                  {(bundle.nav * 100).toFixed(1)}%
                </span>
              </span>
              <span>
                σ{" "}
                <span style={{ color: C.textPrimary, fontWeight: 500 }}>
                  {(stats.sigma * 100).toFixed(2)}%
                </span>
              </span>
              <span>
                <span style={{ color: C.textPrimary, fontWeight: 500 }}>
                  {bundle.daysLeft}d
                </span>{" "}
                to resolution
              </span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 10,
                fontFamily: FM,
                letterSpacing: "0.14em",
                color: C.textMuted,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              {selected.kind} tranche
            </div>
            <div
              style={{
                fontSize: 44,
                fontWeight: 700,
                color: selectedColor,
                fontFamily: FD,
                lineHeight: 1,
                letterSpacing: "-0.02em",
              }}
            >
              ${selected.marketPrice.toFixed(3)}
            </div>
            <div
              style={{
                fontSize: 13,
                fontFamily: FM,
                marginTop: 6,
                color: selected.expectedApyPct >= 0 ? C.green : C.red,
                fontWeight: 500,
              }}
            >
              {formatYieldPct(selected.expectedApyPct)} APY to maturity
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: FM,
                marginTop: 4,
                color: C.textMuted,
                fontWeight: 300,
                letterSpacing: "0.02em",
              }}
            >
              fair ${selected.fairPrice.toFixed(4)} · risk-neutral E[ret]{" "}
              {formatYieldPct(selected.expectedReturnApyPct)}
            </div>
          </div>
        </div>

        {/* Main grid */}
        <div
          className="tranche-detail-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 360px",
            alignItems: "stretch",
            gap: 20,
          }}
        >
          {/* Left column: the chart + metric tiles group pins to the top,
              the waterfall card pins to the bottom via space-between. The
              right column's buy panel uses the same pattern (action stack
              at top, "How it works" at bottom), so the TOP of the chart
              aligns with the TOP of the buy panel and the BOTTOM of the
              waterfall card aligns with the BOTTOM of "How it works". Any
              extra vertical space from the grid-stretch falls INTO the gap
              between the top group and the waterfall, matching the right
              panel's layout exactly. */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: 14,
              minWidth: 0,
              height: "100%",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <DistributionChart
                stats={stats}
                quotes={quotes}
                selectedKind={selected.kind}
              />

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 12,
                }}
              >
                <MetricTile
                  label="MARKET PRICE"
                  value={`$${selected.marketPrice.toFixed(3)}`}
                  color={selectedColor}
                  sub="ask per token"
                />
                <MetricTile
                  label="FAIR VALUE"
                  value={`$${selected.fairPrice.toFixed(3)}`}
                  sub="risk-neutral E[payoff]"
                />
                <MetricTile
                  label="P[ATTACH]"
                  value={`${(selected.attachProbability * 100).toFixed(1)}%`}
                  sub="tranche pays anything"
                />
                <MetricTile
                  label="P[FULL PAY]"
                  value={`${(selected.fullPayProbability * 100).toFixed(1)}%`}
                  color={C.green}
                  sub="tranche pays face"
                />
              </div>
            </div>

            <WaterfallCard
              quotes={quotes}
              selectedKind={selected.kind}
              onSelect={setSelectedKind}
            />
          </div>

          <TrancheBuyPanel
            bundle={bundle}
            stats={stats}
            quotes={quotes}
            selectedKind={selected.kind}
            onSelectKind={setSelectedKind}
            markets={markets}
          />
        </div>
        <style>{TRANCHE_DETAIL_CSS}</style>
      </PageFrame>
    </>
  );
}

const TRANCHE_DETAIL_CSS = `
  @media (max-width: 900px) {
    .tranche-detail-grid {
      grid-template-columns: minmax(0, 1fr) !important;
      align-items: start !important;
    }
  }
`;

/* ---------- Distribution chart ----------
 *
 * Renders the Normal(μ, σ²) density of the basket outcome across [0, 1]
 * with the three tranche slices shaded underneath. The selected
 * tranche gets full opacity, the others half — so the user sees how
 * the picked slice relates to the rest of the distribution.
 *
 * Two light dashed verticals mark the attachment points K1 (senior/
 * mezz boundary) and K2 (mezz/junior boundary). A solid line marks
 * the basket NAV.
 */
function DistributionChart({
  stats,
  quotes,
  selectedKind,
}: {
  stats: BasketStats;
  quotes: TrancheQuote[];
  selectedKind: TrancheKind;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({
    w: 700,
    h: 320,
  });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(220, Math.floor(e.contentRect.width));
        setSize((prev) => (prev.w === w ? prev : { ...prev, w }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Plot window: zoom to where the distribution's mass actually lives.
  // Plotting the full [0, 1] axis was producing huge dead zones (e.g.
  // for HIGH-tier baskets with μ ≈ 0.95 and σ ≈ 0.02, the [0, 0.87]
  // range is essentially flat at zero density). Zooming to μ ± 3σ
  // clipped to [0, 1] keeps the bell centered and fills the chart.
  // Beta density within this window still shows the correct skew.
  const mu = stats.nav;
  const sigma = stats.sigma;
  const lo = Math.max(0, mu - 3 * sigma);
  const hi = Math.min(1, mu + 3 * sigma);
  const span = Math.max(0.01, hi - lo);

  const W = size.w;
  const H = size.h;
  const padL = 12;
  const padR = 12;
  const padT = 20;
  const padB = 28;
  const plotW = Math.max(1, W - padL - padR);
  const plotH = Math.max(1, H - padT - padB);

  // Beta(α,β) shape whose first two moments match the basket. The
  // Normal approximation we used previously produces the same bell
  // shape for every basket since its tail always extends; Beta is
  // bounded to [0,1] and bends correctly toward the mean.
  const shape = betaShapeMatching(mu, Math.max(1e-6, sigma));

  // Sample 400 points across the full axis so the skew on HIGH / LOW
  // baskets renders smoothly.
  const N = 400;
  const pts: Array<{ x: number; y: number; val: number }> = [];
  let maxD = 0;
  for (let i = 0; i <= N; i++) {
    const val = lo + (span * i) / N;
    const d = shape(val);
    pts.push({
      x: padL + (plotW * i) / N,
      y: 0,
      val,
    });
    if (d > maxD) maxD = d;
  }
  for (const p of pts) {
    const d = shape(p.val);
    p.y = padT + (1 - d / Math.max(1e-9, maxD)) * plotH;
  }

  // Convert an outcome value to an x-coordinate in the plot.
  const xOf = (val: number) =>
    padL + (plotW * (Math.max(lo, Math.min(hi, val)) - lo)) / span;

  // Build the line path.
  let linePath = "";
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    linePath += `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)} `;
  }

  // Build the area paths per tranche (clipped by attach / detach).
  const areaPath = (a: number, d: number): string => {
    const xa = xOf(a);
    const xd = xOf(d);
    const slice = pts.filter((p) => p.val >= a && p.val <= d);
    if (slice.length === 0) return "";
    let p = `M ${xa.toFixed(2)} ${(padT + plotH).toFixed(2)} `;
    for (const pt of slice) {
      p += `L ${pt.x.toFixed(2)} ${pt.y.toFixed(2)} `;
    }
    p += `L ${xd.toFixed(2)} ${(padT + plotH).toFixed(2)} Z`;
    return p;
  };

  return (
    <div
      ref={wrapRef}
      style={{
        background: C.card,
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
        padding: "16px 18px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: C.textMuted,
            textTransform: "uppercase",
          }}
        >
          Outcome distribution · Beta(α, β) moment-matched
        </span>
        <span
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.04em",
            color: C.textSecondary,
          }}
        >
          μ {(mu * 100).toFixed(1)}% · σ {(sigma * 100).toFixed(2)}%
        </span>
      </div>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        {/* Tranche slice fills */}
        {quotes.map((q) => {
          const active = q.kind === selectedKind;
          return (
            <path
              key={q.kind}
              d={areaPath(q.attach, q.detach)}
              fill={trancheColor(q.kind)}
              opacity={active ? 0.42 : 0.14}
              stroke="none"
            />
          );
        })}

        {/* Density line */}
        <path
          d={linePath}
          fill="none"
          stroke={C.textPrimary}
          strokeWidth={1.4}
          strokeOpacity={0.78}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* NAV line — solid teal, only visible element on top of the
            density besides the curve itself. Dashed attachment lines
            removed; the slice fills already show the boundaries. */}
        <line
          x1={xOf(mu)}
          x2={xOf(mu)}
          y1={padT}
          y2={padT + plotH}
          stroke={C.tealLight}
          strokeWidth={1.4}
          opacity={0.85}
        />

        {/* NAV label above the line. */}
        <text
          x={xOf(mu)}
          y={padT - 6}
          textAnchor="middle"
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={10}
          fill={C.tealLight}
          fontWeight={500}
        >
          NAV {(mu * 100).toFixed(1)}%
        </text>

        {/* X-axis ticks: the visible window edges (lo, hi) plus the two
            attachment points K1 and K2 so the bucket boundaries are
            explicitly labelled on the axis — for a MID basket with K1=45%,
            K2=55% you see "37% · 45% · 55% · 67%" under the curve instead
            of just the edges. Ticks are deduped (a k-boundary may coincide
            with lo/hi when μ±3σ clamps) and sorted so the labels never
            overlap visually. Middle ticks get colored by their adjacent
            tranche to double as a legend. */}
        {(() => {
          // Attachment points come from the ordered [senior, mezz, junior]
          // triplet: senior.detach = K1, mezzanine.detach = K2.
          const k1 = quotes[0]?.detach ?? lo;
          const k2 = quotes[1]?.detach ?? hi;
          const raw = [lo, k1, k2, hi];
          // Dedupe with an epsilon so near-identical values collapse.
          const eps = span * 0.005;
          const ticks: Array<{ value: number; kind?: TrancheKind }> = [];
          for (const v of raw) {
            if (!ticks.some((t) => Math.abs(t.value - v) < eps)) {
              let kind: TrancheKind | undefined;
              if (Math.abs(v - k1) < eps) kind = "senior";
              else if (Math.abs(v - k2) < eps) kind = "mezzanine";
              ticks.push({ value: v, kind });
            }
          }
          ticks.sort((a, b) => a.value - b.value);
          const precision = span < 0.1 ? 1 : 0;
          return ticks.map((t, i) => {
            const anchor =
              i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle";
            // Attachment-point ticks get their tranche color so the viewer
            // can read the bucket widths at a glance; edge ticks stay muted.
            const fill = t.kind ? trancheColor(t.kind) : C.textMuted;
            return (
              <text
                key={`xa-${i}`}
                x={xOf(t.value)}
                y={padT + plotH + 16}
                textAnchor={anchor}
                fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                fontSize={10}
                fill={fill}
                letterSpacing="0.04em"
                opacity={t.kind ? 0.95 : 0.8}
              >
                {(t.value * 100).toFixed(precision)}%
              </text>
            );
          });
        })()}
      </svg>
    </div>
  );
}

/* ---------- Waterfall card ----------
 *
 * Horizontal bar visualisation of the three tranches at their correct
 * outcome widths, with inline price / APY / notional share. Acts as a
 * secondary click surface for the tranche selector.
 */
function WaterfallCard({
  quotes,
  selectedKind,
  onSelect,
}: {
  quotes: TrancheQuote[];
  selectedKind: TrancheKind;
  onSelect: (k: TrancheKind) => void;
}) {
  return (
    <div
      style={{
        background: C.card,
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
        padding: "16px 18px 14px",
      }}
    >
      <div
        style={{
          fontFamily: FM,
          fontSize: 10,
          letterSpacing: "0.14em",
          color: C.textMuted,
          textTransform: "uppercase",
          marginBottom: 14,
        }}
      >
        Payout order · senior paid first
      </div>

      {/* Segmented selector bar. Column widths scale with notional share,
          clamped to a minimum so a 3%-notional sliver is still readable
          and clickable. On a HIGH basket senior dominates the bar; on a
          LOW basket junior dominates. Click to select the tranche — the
          detail cards below update, as do the metric tiles + buy panel. */}
      <SegmentedSelectorBar
        quotes={quotes}
        selectedKind={selectedKind}
        onSelect={onSelect}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 10,
        }}
      >
        {quotes.map((q) => {
          const active = q.kind === selectedKind;
          return (
            <button
              key={q.kind}
              onClick={() => onSelect(q.kind)}
              style={{
                textAlign: "left",
                background: active ? `${trancheColor(q.kind)}10` : C.surface,
                border: `0.5px solid ${
                  active ? trancheColor(q.kind) + "60" : C.border
                }`,
                borderRadius: 10,
                padding: "10px 12px",
                cursor: "pointer",
                transition: `background 0.15s ${EASE}, border-color 0.15s ${EASE}`,
              }}
            >
              <div
                style={{
                  fontFamily: FM,
                  fontSize: 9.5,
                  letterSpacing: "0.12em",
                  color: trancheColor(q.kind),
                  textTransform: "uppercase",
                  fontWeight: 600,
                }}
              >
                {q.kind}
              </div>
              <div
                style={{
                  fontFamily: FD,
                  fontSize: 18,
                  fontWeight: 600,
                  color: C.textPrimary,
                  letterSpacing: "-0.01em",
                  marginTop: 6,
                }}
              >
                ${q.marketPrice.toFixed(3)}
              </div>
              <div
                style={{
                  fontFamily: FM,
                  fontSize: 10.5,
                  color: C.textSecondary,
                  marginTop: 4,
                  letterSpacing: "0.02em",
                }}
              >
                {(q.notionalShare * 100).toFixed(1)}% notional
              </div>
              <div
                style={{
                  fontFamily: FM,
                  fontSize: 10.5,
                  color:
                    q.expectedApyPct >= 50
                      ? C.green
                      : q.expectedApyPct >= 10
                        ? C.tealLight
                        : C.textSecondary,
                  marginTop: 2,
                }}
              >
                {formatYieldPct(q.expectedApyPct)} APY
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Horizontal segmented bar scaled to each tranche's notional share,
 * with a minimum visual weight so thin slices (e.g. HIGH-tier mezz at
 * 3% notional, or LOW-tier senior at 3%) stay readable and clickable.
 * Active segment renders solid fill + dark text; inactive segments
 * render a tinted background + tranche-colored label.
 */
function SegmentedSelectorBar({
  quotes,
  selectedKind,
  onSelect,
}: {
  quotes: TrancheQuote[];
  selectedKind: TrancheKind;
  onSelect: (k: TrancheKind) => void;
}) {
  // Clamp each share's minimum flex weight so the narrowest slice
  // still reads. Math.max(0.15, share) keeps the smallest segment at
  // ~5-8% of the bar regardless of how skewed the underlying tier is.
  const weights = quotes.map((q) => Math.max(0.15, q.notionalShare));
  return (
    <div
      role="tablist"
      aria-label="Select tranche"
      style={{
        display: "grid",
        gridTemplateColumns: weights.map((w) => `${w}fr`).join(" "),
        gap: 4,
        marginBottom: 16,
      }}
    >
      {quotes.map((q) => {
        const active = q.kind === selectedKind;
        const color = trancheColor(q.kind);
        return (
          <button
            key={q.kind}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(q.kind)}
            style={{
              height: 44,
              borderRadius: 8,
              background: active ? color : `${color}1c`,
              border: `0.5px solid ${active ? color : `${color}40`}`,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: FD,
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: active ? "#001814" : color,
              transition: `background 0.15s ${EASE}, color 0.15s ${EASE}, border-color 0.15s ${EASE}`,
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              padding: "0 8px",
            }}
          >
            {q.kind}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- Tranche buy panel ----------
 *
 * Mirrors the basket-detail BasketBuyPanel: tranche tabs → amount →
 * fee breakdown (protocol / MM spread / underwriting / live slippage)
 * → "you receive X STHS-KIND" → single primary action that opens
 * the wallet picker on demand. Slippage is quoted live from the same
 * CLOB books the basket panel uses, scaled by the tranche's
 * notional share.
 */
function TrancheBuyPanel({
  bundle,
  stats,
  quotes,
  selectedKind,
  onSelectKind,
  markets,
}: {
  bundle: Bundle;
  stats: BasketStats;
  quotes: TrancheQuote[];
  selectedKind: TrancheKind;
  onSelectKind: (k: TrancheKind) => void;
  markets: LiveMarket[];
}) {
  const { connected } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { dispatch } = useSandbox();
  const wallet = useWalletSigner();
  const usdc = useUsdcBalance();
  const [amount, setAmount] = useState<string>("100");
  const [books, setBooks] = useState<Map<string, Orderbook>>(new Map());
  const [bookStatus, setBookStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  // Tx lifecycle mirrors the basket + PPN pages.
  const [txStage, setTxStage] = useState<
    "idle" | "preparing" | "signing" | "confirming" | "persisting" | "done"
  >("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const selected = quotes.find((q) => q.kind === selectedKind) ?? quotes[0];
  const accent = trancheColor(selected.kind);

  // Live CLOB pull for the top 10 weighted legs — same pattern as
  // the basket buy panel, so slippage estimates stay consistent
  // across the two products.
  const topLegs = useMemo(() => {
    const withTokens = markets.filter((m) => m.tokenId);
    return [...withTokens]
      .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
      .slice(0, 10);
  }, [markets]);
  const topTokenIds = useMemo(
    () => topLegs.map((m) => m.tokenId),
    [topLegs],
  );

  useEffect(() => {
    if (topTokenIds.length === 0) {
      setBooks(new Map());
      setBookStatus("idle");
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    setBookStatus("loading");
    fetchOrderbooks(topTokenIds, ac.signal)
      .then((map) => {
        if (cancelled) return;
        setBooks(map);
        setBookStatus(map.size > 0 ? "ok" : "error");
      })
      .catch(() => {
        if (cancelled) return;
        setBookStatus("error");
      });
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [topTokenIds]);

  const usdcAmount = Math.max(0, Number.parseFloat(amount) || 0);

  // Slippage is computed on the MM's actual basket-hedge notional,
  // which is `usdcAmount × selected.notionalShare` (the tranche only
  // exposes the MM to a sliver of the full basket). Previously we
  // quoted slippage for the FULL usdcAmount and then linearly scaled
  // it by notionalShare in quoteTrancheOrder — that over-stated
  // slippage for small-width tranches because per-leg CLOB impact is
  // sub-linear in size. Passing the hedge amount directly to the
  // CLOB-walk produces the honest per-tranche number.
  const basketSlippageBps = useMemo(() => {
    const hedgeAmount = usdcAmount * Math.max(1e-6, selected.notionalShare);
    if (hedgeAmount <= 0 || topLegs.length === 0) return 0;
    let slippage = 0;
    let covered = 0;
    let hasLive = false;
    for (const m of topLegs) {
      const w = m.weight && m.weight > 0 ? m.weight : 1 / topLegs.length;
      const book = m.tokenId ? books.get(m.tokenId) : undefined;
      if (book && book.asks.length > 0) {
        hasLive = true;
        const impact = quoteSideImpact(hedgeAmount * w, book);
        slippage += impact.slippageBps * w;
        covered += w;
      }
    }
    if (!hasLive) {
      // Volume-proxy fallback: 0.5% of lifetime leg volume as depth.
      let weighted = 0;
      let weightTotal = 0;
      for (const m of topLegs) {
        const w = m.weight && m.weight > 0 ? m.weight : 1 / topLegs.length;
        const vol = m.volumeUsd ?? 0;
        const depth = Math.max(250, vol * 0.005);
        const ratio = (hedgeAmount * w) / depth;
        const bps = Math.max(20, ratio * 1500 + ratio * ratio * 3500);
        weighted += bps * w;
        weightTotal += w;
      }
      slippage = weightTotal > 0 ? weighted / weightTotal : 0;
    } else if (covered > 0 && covered < 1) {
      // Cover residual with volume proxy scaled to the leftover weight.
      let weightedRes = 0;
      let weightTotal = 0;
      for (const m of topLegs) {
        const w = m.weight && m.weight > 0 ? m.weight : 1 / topLegs.length;
        const book = m.tokenId ? books.get(m.tokenId) : undefined;
        if (book && book.asks.length > 0) continue;
        const vol = m.volumeUsd ?? 0;
        const depth = Math.max(250, vol * 0.005);
        const ratio = (hedgeAmount * w) / depth;
        const bps = Math.max(20, ratio * 1500 + ratio * ratio * 3500);
        weightedRes += bps * w;
        weightTotal += w;
      }
      const proxy = weightTotal > 0 ? weightedRes / weightTotal : 0;
      slippage = slippage + proxy * (1 - covered);
    }
    return Math.min(SLIPPAGE_BPS_CEILING, Math.max(0, slippage));
  }, [usdcAmount, topLegs, books, selected.notionalShare]);

  const order = useMemo(
    () => quoteTrancheOrder(selected, usdcAmount, basketSlippageBps),
    [selected, usdcAmount, basketSlippageBps],
  );

  const hasLiveBooks = bookStatus === "ok";
  const hasAmount = usdcAmount > 0;
  // Effective per-order cap is the tighter of the static (tier, kind) ceiling
  // and the dynamic depth cap derived from the basket's weakest leg. Junior
  // tranches in a LOW basket hit this floor quickly — intentionally, since
  // tail-risk product can't support big retail clips.
  const capacityUsdc = order.capacityUsdc;
  const overCap = hasAmount && order.overCapacity;
  // Gate on the live on-chain USDC balance. When disconnected we don't
  // flag "Insufficient" — the button's wallet-modal branch handles that
  // path without ever advancing past the connect step.
  const liveUsdc = usdc.uiAmount;
  const insufficient = connected && hasAmount && usdcAmount > liveUsdc;
  const txBusy =
    txStage === "preparing" ||
    txStage === "signing" ||
    txStage === "confirming" ||
    txStage === "persisting";
  const canSubmit =
    connected && hasAmount && !insufficient && !overCap && !txBusy;

  async function handlePrimary() {
    if (!connected) {
      setWalletModalVisible(true);
      return;
    }
    if (!canSubmit) return;
    setTxError(null);
    setTxSignature(null);
    setTxStage("preparing");
    try {
      // Tranche buys ride on the PPN rail — the backend persists the
      // (attach, detach, kind, price_per_token) metadata next to the note
      // so the position shows up as a tranche in portfolio views.
      const result = await ppnDeposit({
        wallet,
        bundleId: bundle.id,
        amountUsdc: usdcAmount,
        // Tranche maturity matches the basket resolution window. Clamp to
        // the on-chain program's 1..365 day range so we don't emit a
        // negative `maturity_days` if the basket is already past due.
        maturityDays: Math.max(1, Math.min(365, bundle.daysLeft || 30)),
        tranche: {
          kind: selected.kind,
          attach: selected.attach,
          detach: selected.detach,
          pricePerToken: selected.marketPrice,
        },
      });
      setTxStage("done");
      setTxSignature(result.signature);
      dispatch({
        type: "tranche/deposit",
        bundleId: bundle.id,
        kind: selected.kind,
        usdcAmount,
        pricePerToken: selected.marketPrice,
      });
      void usdc.refresh();
    } catch (err) {
      setTxStage("idle");
      if (err instanceof PpnError) {
        setTxError(err.message);
      } else if (err instanceof Error) {
        setTxError(
          /user rejected/i.test(err.message)
            ? "Transaction was rejected in your wallet."
            : err.message,
        );
      } else {
        setTxError(String(err));
      }
    }
  }

  const buttonLabel = !hasAmount
    ? "Enter an amount"
    : overCap
      ? `Max $${Math.round(capacityUsdc).toLocaleString()} per order`
      : insufficient
        ? "Insufficient USDC"
        : txStage === "preparing"
          ? "Preparing transaction…"
          : txStage === "signing"
            ? "Awaiting wallet signature…"
            : txStage === "confirming"
              ? "Confirming on Solana…"
              : txStage === "persisting"
                ? "Finalising…"
                : txStage === "done"
                  ? "✓ Tranche opened"
                  : `Buy ${selected.kind} tranche`;
  const buttonActive =
    hasAmount && !insufficient && !overCap && !txBusy && txStage !== "done";

  return (
    <div
      style={{
        // Panel matches the left column's card chrome exactly: same
        // border stroke, same 14px radius, same 16/18 inner padding
        // as the chart card, metric tiles, and waterfall card. The
        // forced `minHeight: 560` was overriding the grid's stretch
        // behaviour and making the right column taller than whatever
        // the left column's natural content happened to be — drop it
        // and let the grid row height be driven by the tallest column.
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        gap: 20,
        height: "100%",
        background: C.card,
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
        padding: "16px 18px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Header — left-aligned to match the rest of the panel stack.
            Small-caps kicker on top, basket id as the primary line, and
            a single meta line below showing the active tranche's range
            and ask price. All three elements share the same left edge as
            the tabs / amount input / fee breakdown / button underneath. */}
        <div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: C.textMuted,
              textTransform: "uppercase",
              fontWeight: 500,
              marginBottom: 6,
            }}
          >
            Buy {selected.kind}
          </div>
          <div
            style={{
              fontFamily: FD,
              fontSize: 19,
              fontWeight: 500,
              color: C.textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            {bundle.id}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 12,
              marginTop: 6,
              fontFamily: FS,
              fontSize: 12,
              color: C.textSecondary,
              fontWeight: 300,
            }}
          >
            <span>
              {(selected.attach * 100).toFixed(0)}–
              {(selected.detach * 100).toFixed(0)}% of payout
            </span>
            <span>
              Ask{" "}
              <span
                style={{ color: accent, fontWeight: 500 }}
              >
                ${selected.marketPrice.toFixed(4)}
              </span>
            </span>
          </div>
        </div>

        {/* Tranche selector tabs */}
        <div
          role="tablist"
          aria-label="Tranche"
          style={{
            display: "flex",
            padding: 3,
            background: C.surface,
            borderRadius: 10,
            border: `0.5px solid ${C.border}`,
          }}
        >
          {quotes.map((q) => {
            const active = q.kind === selected.kind;
            return (
              <button
                key={q.kind}
                role="tab"
                aria-selected={active}
                onClick={() => onSelectKind(q.kind)}
                style={{
                  flex: 1,
                  padding: "8px 0",
                  background: active ? trancheColor(q.kind) + "18" : "transparent",
                  color: active ? trancheColor(q.kind) : C.textSecondary,
                  border: "none",
                  borderRadius: 8,
                  fontFamily: FD,
                  fontSize: 11.5,
                  fontWeight: active ? 600 : 500,
                  letterSpacing: "0.04em",
                  cursor: "pointer",
                  textTransform: "capitalize",
                  transition: `color 0.15s ${EASE}, background 0.15s ${EASE}`,
                }}
              >
                {q.kind}
              </button>
            );
          })}
        </div>

        {/* Amount input */}
        <div
          style={{
            background: C.surface,
            border: `0.5px solid ${C.border}`,
            borderRadius: 12,
            padding: "12px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: "0.14em",
              color: C.textMuted,
              textTransform: "uppercase",
              fontWeight: 500,
            }}
          >
            <span>Amount</span>
            <span style={{ textTransform: "none", letterSpacing: "0.04em" }}>
              Wallet{" "}
              <span style={{ color: connected ? C.textSecondary : C.textMuted }}>
                {connected
                  ? usdc.loading && liveUsdc === 0
                    ? "…"
                    : `$${liveUsdc.toFixed(2)}`
                  : "connect"}
              </span>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) =>
                setAmount(e.target.value.replace(/[^0-9.]/g, ""))
              }
              placeholder="0.00"
              style={{
                flex: 1,
                minWidth: 0,
                background: "transparent",
                border: "none",
                outline: "none",
                color: C.textPrimary,
                fontFamily: FD,
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: "-0.01em",
                padding: 0,
              }}
            />
            <span
              style={{
                fontFamily: FM,
                fontSize: 11,
                color: C.textSecondary,
                letterSpacing: "0.06em",
                fontWeight: 400,
              }}
            >
              USDC
            </span>
          </div>
        </div>

        {/* Fee breakdown */}
        {hasAmount && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              padding: "12px 14px",
              background: "rgba(10, 15, 24, 0.45)",
              borderRadius: 12,
              border: `0.5px solid ${C.border}`,
            }}
          >
            <FeeRow
              label="Protocol fee"
              bps={order.protocolFeeBps}
              usd={(usdcAmount * order.protocolFeeBps) / 10_000}
            />
            <FeeRow
              label="MM premium"
              bps={order.mmSpreadBps + order.underwritingBps}
              usd={
                (usdcAmount *
                  (order.mmSpreadBps + order.underwritingBps)) /
                10_000
              }
              hint="markup over fair: delta/gamma hedge + capital-at-risk"
            />
            <FeeRow
              label="Slippage"
              bps={order.slippageBps}
              usd={(usdcAmount * order.slippageBps) / 10_000}
              hint="CLOB walk on basket hedge"
            />
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontFamily: FM,
                fontSize: 11,
                color: C.textSecondary,
                fontWeight: 500,
                borderTop: `0.5px solid ${C.border}`,
                paddingTop: 8,
                marginTop: 2,
                letterSpacing: "0.02em",
              }}
            >
              <span>You receive</span>
              <span style={{ color: accent, fontWeight: 600 }}>
                {order.tokensOut.toFixed(2)} STHS-
                {selected.kind.slice(0, 3).toUpperCase()}
              </span>
            </div>
            <div
              style={{
                fontFamily: FS,
                fontSize: 10,
                color: C.textMuted,
                letterSpacing: "0.02em",
                fontWeight: 300,
                marginTop: 2,
              }}
            >
              {bookStatus === "loading"
                ? "Quoting slippage from live Polymarket books…"
                : hasLiveBooks
                  ? `Slippage quoted live from Polymarket CLOB (${topLegs.length} legs sampled). Capacity $${Math.round(capacityUsdc).toLocaleString()} per order.`
                  : bookStatus === "error"
                    ? `CLOB feed unavailable. Slippage estimated from leg volume. Capacity $${Math.round(capacityUsdc).toLocaleString()} per order.`
                    : `Slippage estimated from leg volume. Capacity $${Math.round(capacityUsdc).toLocaleString()} per order.`}
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handlePrimary}
          disabled={!buttonActive}
          style={{
            width: "100%",
            height: 44,
            padding: "0 14px",
            borderRadius: 12,
            border: "none",
            background: buttonActive
              ? `linear-gradient(135deg, ${accent} 0%, ${accent}dd 100%)`
              : `${accent}22`,
            color: buttonActive ? "#001814" : C.textMuted,
            fontFamily: FD,
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: "0.04em",
            cursor: buttonActive ? "pointer" : "not-allowed",
            transition: `transform 0.15s ${EASE}, box-shadow 0.15s ${EASE}`,
            boxShadow: buttonActive
              ? `0 10px 24px ${accent}33, inset 0 0 0 1px ${accent}55`
              : "none",
            textTransform: "capitalize",
          }}
          onMouseEnter={(e) => {
            if (!buttonActive) return;
            (e.currentTarget as HTMLElement).style.transform =
              "translateY(-1px)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
          }}
        >
          {buttonLabel}
        </button>

        {/* Tx result strip: same shape as the basket page. Surfaces the
            on-chain signature or backend error so Victor can verify funds
            actually moved without leaving the tranche detail page. */}
        {txError && (
          <div
            style={{
              fontFamily: FM,
              fontSize: 11,
              lineHeight: 1.45,
              color: "#ff8570",
              background: "rgba(255, 90, 70, 0.08)",
              border: "0.5px solid rgba(255, 90, 70, 0.35)",
              borderRadius: 8,
              padding: "8px 12px",
              letterSpacing: "0.02em",
              fontWeight: 400,
            }}
          >
            {txError}
          </div>
        )}
        {txSignature && (
          <a
            href={explorerTxUrl(txSignature)}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              fontFamily: FM,
              fontSize: 11,
              color: accent,
              background: `${accent}14`,
              border: `0.5px solid ${accent}55`,
              borderRadius: 8,
              padding: "8px 12px",
              letterSpacing: "0.02em",
              fontWeight: 500,
              textAlign: "center",
              textDecoration: "none",
            }}
          >
            View on Solana Explorer ↗
          </a>
        )}
      </div>

      {/* How it works */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: "0.18em",
              color: C.textMuted,
              fontWeight: 500,
              textTransform: "uppercase",
            }}
          >
            How it works
          </span>
          <span style={{ flex: 1, height: 1, background: C.border }} />
        </div>
        <HowItWorksList accent={accent} sigma={stats.sigma} kind={selected.kind} />
      </div>
    </div>
  );
}

function HowItWorksList({
  accent,
  sigma: _sigma,
  kind,
}: {
  accent: string;
  sigma: number;
  kind: TrancheKind;
}) {
  void _sigma;
  const steps: Array<{ num: string; title: string; body: string }> = [
    {
      num: "01",
      title: "Buy in",
      body: `Pick a tranche, enter USDC, and confirm. You get ${kind} tokens at the quoted price, which already includes fees and live slippage from Polymarket.`,
    },
    {
      num: "02",
      title: "Wait it out",
      body: `The basket's underlying Polymarket positions resolve over its lifetime. Your tokens stay liquid throughout, so you can exit early or hold to maturity.`,
    },
    {
      num: "03",
      title: "Redeem",
      body: `At maturity, payouts flow senior first, then mezzanine, then junior. Your tokens convert back to USDC for your share of the final pool.`,
    },
  ];
  return (
    <ol
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {steps.map((step) => (
        <li
          key={step.num}
          style={{
            display: "grid",
            gridTemplateColumns: "24px 1fr",
            columnGap: 12,
            rowGap: 3,
            alignItems: "baseline",
          }}
        >
          <div
            style={{
              fontFamily: FM,
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.1em",
              color: accent,
              paddingTop: 2,
              opacity: 0.85,
            }}
          >
            {step.num}
          </div>
          <div
            style={{
              fontFamily: FD,
              fontSize: 12.5,
              fontWeight: 500,
              color: C.textPrimary,
              letterSpacing: "-0.002em",
            }}
          >
            {step.title}
          </div>
          <div />
          <div
            style={{
              fontFamily: FS,
              fontSize: 11.5,
              lineHeight: 1.55,
              color: C.textMuted,
              fontWeight: 300,
            }}
          >
            {step.body}
          </div>
        </li>
      ))}
    </ol>
  );
}

function FeeRow({
  label,
  bps,
  usd,
  hint,
}: {
  label: string;
  bps: number;
  usd: number;
  hint?: string;
}) {
  const pctText =
    bps >= 100 ? `${(bps / 100).toFixed(2)}%` : `${(bps / 100).toFixed(3)}%`;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: FS,
          fontSize: 11.5,
          color: C.textSecondary,
          fontWeight: 300,
          letterSpacing: "0.01em",
        }}
      >
        {label}
        {hint && (
          <span
            style={{
              fontFamily: FS,
              fontSize: 10,
              color: C.textMuted,
              marginLeft: 6,
              fontWeight: 300,
            }}
          >
            {hint}
          </span>
        )}
      </span>
      <span
        style={{
          fontFamily: FM,
          fontSize: 11,
          color: C.textSecondary,
          letterSpacing: "0.02em",
          fontWeight: 400,
        }}
      >
        {pctText}
        <span style={{ color: C.textMuted, marginLeft: 6 }}>
          ${usd.toFixed(2)}
        </span>
      </span>
    </div>
  );
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
          height: 240,
          background: C.card,
          border: `0.5px solid ${C.border}`,
          borderRadius: 14,
        }}
      />
    </div>
  );
}
