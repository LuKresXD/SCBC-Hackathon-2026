"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { ConnectWalletCard } from "../../_components/ConnectWalletCard";
import { MetricTile } from "../../_components/charts";
import { C, FS, FD, FM, EASE, tc } from "../../_lib/tokens";
import { bundleById, type Bundle } from "../../_lib/bundles";
import {
  buildLiveBaskets,
  fetchLiveMarkets,
  isLiveBasket,
  type LiveBasket,
  type LiveMarket,
  type WindowKey,
} from "../../_lib/live-baskets";

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
  const [state, setState] = useState<
    { status: "loading" } | { status: "done"; data: ResolvedBasket }
  >({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      // Seed lookup is instant; if it hits, use it.
      const seed = bundleById(id);
      if (seed) {
        if (!cancelled) setState({ status: "done", data: { kind: "seed", basket: seed } });
        return;
      }

      // Otherwise, this is a live synthetic basket (e.g. STHS-90-M).
      try {
        const markets = await fetchLiveMarkets(5000);
        const slots = buildLiveBaskets(markets);
        const live = slots.filter(isLiveBasket).find((b) => b.id === id);
        if (cancelled) return;
        if (live) {
          setState({ status: "done", data: { kind: "live", basket: live } });
        } else {
          setState({ status: "done", data: { kind: "missing" } });
        }
      } catch {
        if (!cancelled) setState({ status: "done", data: { kind: "missing" } });
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === "loading") {
    return (
      <>
        <Header />
        <PageFrame>
          <LoadingSkeleton />
        </PageFrame>
      </>
    );
  }

  const resolved = state.data;

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
              {bundle.resolved}/{bundle.totalLegs} legs resolved · {bundle.daysLeft}d remaining · resolves {bundle.date}
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                background: C.card,
                border: `0.5px solid ${C.border}`,
                borderRadius: 14,
                padding: "18px 20px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 14,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    color: C.textMuted,
                    fontFamily: FM,
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                  }}
                >
                  NAV · 30 day
                </span>
                <span
                  style={{
                    fontFamily: FM,
                    fontSize: 11,
                    color: C.textSecondary,
                    letterSpacing: "0.04em",
                  }}
                >
                  ${bundle.nav.toFixed(3)}
                </span>
              </div>
              <DetailChart data={bundle.history} color={color} />
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
              <MetricTile
                label="BREAKEVEN"
                value={`${(bundle.nav * 100).toFixed(0)}%`}
                sub="implied probability"
              />
            </div>

            {liveMarkets.length > 0 && (
              <ConstituentTable markets={liveMarkets} tierColor={color} />
            )}
          </div>

          <ConnectWalletCard
            title={`Deposit into ${bundle.id}`}
            subtitle="Connect a Solana wallet to buy STHS at live NAV. USDC is deposited into the traxis_vault program for this bundle."
            accent={color}
          />
        </div>
      </PageFrame>
    </>
  );
}

/* ---------- Top constituents ---------- */

// How many constituents to surface on the detail page.
const TOP_CONSTITUENTS = 3;

function ConstituentTable({
  markets,
  tierColor,
}: {
  markets: LiveMarket[];
  tierColor: string;
}) {
  const top = useMemo(
    () =>
      [...markets]
        .sort((a, b) => b.volumeUsd - a.volumeUsd)
        .slice(0, TOP_CONSTITUENTS),
    [markets],
  );

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
          Top {top.length} of {markets.length} constituents
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
          gridTemplateColumns: "28px minmax(200px, 1fr) 90px 110px 110px 32px",
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
        <div>Question</div>
        <div style={{ textAlign: "right" }}>Yes %</div>
        <div style={{ textAlign: "right" }}>24h volume</div>
        <div style={{ textAlign: "right" }}>Resolves</div>
        <div />
      </div>
      {top.map((m, i) => (
        <ConstituentRow
          key={m.id}
          index={i + 1}
          market={m}
          tierColor={tierColor}
          isLast={i === top.length - 1}
        />
      ))}
    </div>
  );
}

/* ---------- Responsive detail chart ---------- */

function DetailChart({ data, color }: { data: number[]; color: string }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 700, h: 160 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = Math.max(120, Math.floor(e.contentRect.width));
        setSize((prev) => (prev.w === w ? prev : { w, h: prev.h }));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (data.length === 0) {
    return <div ref={wrapRef} style={{ width: "100%", height: size.h }} />;
  }

  const padL = 6;
  const padR = 48; // room for end-of-line value
  const padT = 8;
  const padB = 18;
  const W = size.w;
  const H = size.h;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 0.0001;
  const plotW = Math.max(1, W - padL - padR);
  const plotH = Math.max(1, H - padT - padB);
  const pts = data.map((v, i) => ({
    x: padL + (i / Math.max(1, data.length - 1)) * plotW,
    y: padT + (1 - (v - min) / range) * plotH,
  }));

  // Smooth cubic path
  let path = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    path += ` Q ${p0.x} ${p0.y}, ${cx} ${(p0.y + p1.y) / 2} T ${p1.x} ${p1.y}`;
  }
  const areaPath = `${path} L ${pts[pts.length - 1].x} ${padT + plotH} L ${pts[0].x} ${padT + plotH} Z`;

  const last = pts[pts.length - 1];
  const lastVal = data[data.length - 1];
  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((t) => padT + t * plotH);
  const gridLabels = [max, (max + min) / 2, min];
  const labelYs = [padT, padT + plotH / 2, padT + plotH];

  return (
    <div ref={wrapRef} style={{ width: "100%" }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id={`detail-fill-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* gridlines */}
        {gridYs.map((y, i) => (
          <line
            key={i}
            x1={padL}
            x2={W - padR}
            y1={y}
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />
        ))}
        {/* y-axis labels (max / mid / min) */}
        {gridLabels.map((v, i) => (
          <text
            key={i}
            x={W - padR + 6}
            y={labelYs[i] + 3}
            fill={C.textMuted}
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            fontSize={10}
            letterSpacing="0.04em"
          >
            {(v * 100).toFixed(1)}%
          </text>
        ))}
        {/* area fill */}
        <path
          d={areaPath}
          fill={`url(#detail-fill-${color.replace("#", "")})`}
          stroke="none"
        />
        {/* line */}
        <path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* current-value marker */}
        <circle cx={last.x} cy={last.y} r={4} fill={color} />
        <circle cx={last.x} cy={last.y} r={8} fill={color} opacity={0.18} />
        <text
          x={last.x + 8}
          y={last.y - 8}
          fill={color}
          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          fontSize={11}
          fontWeight={500}
        >
          {(lastVal * 100).toFixed(1)}%
        </text>
      </svg>
    </div>
  );
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
  const href = `https://polymarket.com/market/${market.conditionId || market.id}`;
  const days = Math.max(0, Math.round(market.daysToResolution));

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "grid",
        gridTemplateColumns: "28px minmax(200px, 1fr) 90px 110px 110px 32px",
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
          fontWeight: 500,
          color: tierColor,
          letterSpacing: "0.01em",
        }}
      >
        {(market.yesProbability * 100).toFixed(1)}%
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
