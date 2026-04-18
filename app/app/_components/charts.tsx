"use client";
/**
 * Shared chart + card primitives used by every product page.
 *
 * All of these were previously inlined in the monolithic `app/app/page.tsx`;
 * they're now isolated so multiple pages can import them without duplicating
 * canvas rendering logic.
 */

import React, { useEffect, useRef } from "react";
import { C, FS, FD, EASE, lightenColor, tc } from "../_lib/tokens";

export function Sparkline({
  data,
  color,
  height = 48,
  width = 120,
}: {
  data: number[];
  color: string;
  height?: number;
  width?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    const dpr = window.devicePixelRatio || 1;
    c.width = width * dpr;
    c.height = height * dpr;
    c.style.width = width + "px";
    c.style.height = height + "px";
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 0.01;
    const pad = 3;
    const pts = data.map((v, i) => ({
      x: pad + (i / (data.length - 1)) * (width - pad * 2),
      y: pad + (1 - (v - min) / range) * (height - pad * 2),
    }));
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      const m = { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 };
      ctx.quadraticCurveTo(pts[i - 1].x, pts[i - 1].y, m.x, m.y);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(pts[pts.length - 1].x, height);
    ctx.lineTo(pts[0].x, height);
    ctx.closePath();
    ctx.fillStyle = color + "18";
    ctx.fill();
  }, [data, color, height, width]);
  return <canvas ref={ref} style={{ display: "block", width: "100%", height: height + "px" }} />;
}

export function PulseGauge({
  prob,
  color,
  size = 56,
}: {
  prob: number;
  color: string;
  size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + "px";
    c.style.height = size + "px";
    const ctx = c.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.border;
    ctx.lineCap = "round";
    ctx.stroke();
    const endAngle = Math.PI * 0.75 + (prob / 100) * Math.PI * 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, endAngle);
    ctx.lineWidth = 4;
    ctx.strokeStyle = color;
    ctx.lineCap = "round";
    ctx.stroke();
  }, [prob, color, size]);
  return <canvas ref={ref} />;
}

// ---------- SVG donut ----------

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number) {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}
function arcPath(
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  startAngle: number,
  endAngle: number,
) {
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  const start = polarToCartesian(cx, cy, rOuter, startAngle);
  const end = polarToCartesian(cx, cy, rOuter, endAngle);
  const startIn = polarToCartesian(cx, cy, rInner, endAngle);
  const endIn = polarToCartesian(cx, cy, rInner, startAngle);
  return `M ${start.x} ${start.y} A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${end.x} ${end.y} L ${startIn.x} ${startIn.y} A ${rInner} ${rInner} 0 ${largeArc} 0 ${endIn.x} ${endIn.y} Z`;
}

export function SvgDonut({
  data,
  size,
  activeId,
  onHover,
  isEmpty,
}: {
  data: { id: string; value: number; color: string }[];
  size: number;
  activeId: string | null;
  onHover: (id: string | null) => void;
  isEmpty?: boolean;
}) {
  const PAD = 32;
  const TOTAL = size + PAD * 2;
  const cx = TOTAL / 2;
  const cy = TOTAL / 2;
  const baseR = size * 0.355;
  const thickness = size * 0.11;
  const gap = 0.024;

  if (isEmpty || data.length === 0) {
    return (
      <svg width={TOTAL} height={TOTAL} style={{ display: "block" }}>
        <circle cx={cx} cy={cy} r={baseR + thickness / 2} fill="none" stroke={C.border} strokeWidth={thickness} opacity={0.35} />
        <circle cx={cx} cy={cy} r={baseR - 1} fill={C.surface} stroke={C.border} strokeWidth={0.5} />
      </svg>
    );
  }

  const total = data.reduce((s, d) => s + d.value, 0);
  // Build slices immutably: each slice's start is the cumulative span of all
  // preceding slices. React 19's purity rules reject any mutable accumulator
  // during render, so we use `reduce` to thread the offset through.
  type Slice = { id: string; value: number; color: string; start: number; end: number };
  const slices: Slice[] = data.reduce<Slice[]>((acc, d) => {
    const start = acc.length ? acc[acc.length - 1].end : -Math.PI / 2;
    const span = (d.value / total) * Math.PI * 2;
    acc.push({ ...d, start, end: start + span });
    return acc;
  }, []);

  return (
    <svg
      width={TOTAL}
      height={TOTAL}
      style={{ display: "block" }}
      onMouseLeave={() => onHover(null)}
    >
      <defs>
        {slices.map((s) => (
          <linearGradient key={`grad-${s.id}`} id={`grad-${s.id}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={lightenColor(s.color, 0.25)} />
            <stop offset="100%" stopColor={s.color} />
          </linearGradient>
        ))}
        <radialGradient id="innerFrost" cx="50%" cy="0%" r="100%">
          <stop offset="0%" stopColor="#1a2536" stopOpacity="1" />
          <stop offset="70%" stopColor={C.card} stopOpacity="1" />
          <stop offset="100%" stopColor="#0c131c" stopOpacity="1" />
        </radialGradient>
      </defs>
      {slices.map((s) => {
        const isActive = activeId === s.id;
        const isNone = activeId === null;
        const midAngle = (s.start + s.end) / 2;
        const offsetDist = isActive ? 6 : 0;
        const ox = Math.cos(midAngle) * offsetDist;
        const oy = Math.sin(midAngle) * offsetDist;
        const outerR = baseR + thickness + (isActive ? 8 : 0);
        const innerR = baseR - (isActive ? 1 : 0);
        const adjStart = s.start + gap / 2;
        const adjEnd = s.end - gap / 2;
        return (
          <g
            key={s.id}
            transform={`translate(${ox} ${oy})`}
            style={{
              opacity: isNone ? 1 : isActive ? 1 : 0.18,
              transition: `opacity 0.35s ${EASE}, transform 0.4s ${EASE}`,
              cursor: "pointer",
            }}
            onMouseEnter={() => onHover(s.id)}
          >
            <path d={arcPath(cx, cy, outerR, innerR, adjStart, adjEnd)} fill={`url(#grad-${s.id})`} style={{ transition: `d 0.4s ${EASE}` }} />
            <path d={arcPath(cx, cy, outerR, outerR - 2, adjStart, adjEnd)} fill={lightenColor(s.color, 0.45)} opacity="0.5" />
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={baseR - 1} fill="url(#innerFrost)" />
      <circle cx={cx} cy={cy} r={baseR - 1} fill="none" stroke={C.border} strokeWidth="0.5" opacity="0.6" />
    </svg>
  );
}

// ---------- Cards ----------

export function BundleCard({
  bundle,
  onClick,
}: {
  bundle: { id: string; tier: number; nav: number; change: number; history: number[]; date: string; daysLeft: number; resolved: number; totalLegs: number };
  onClick: () => void;
}) {
  const [hov, setHov] = React.useState(false);
  const color = tc(bundle.tier);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov ? C.cardHover : C.card,
        border: `0.5px solid ${hov ? C.borderHover : C.border}`,
        borderRadius: 14,
        padding: "18px 20px 14px",
        cursor: "pointer",
        transition: `all 0.2s ${EASE}`,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color, opacity: 0.8 }} />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 4 }}>{bundle.id}</div>
          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS }}>
            {bundle.resolved}/{bundle.totalLegs} resolved · {bundle.daysLeft}d left
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 24, fontWeight: 700, color, fontFamily: FD, lineHeight: 1 }}>{(bundle.nav * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: C.textSecondary, fontFamily: FS, marginTop: 2 }}>${bundle.nav.toFixed(3)}</div>
        </div>
      </div>
      <div style={{ marginBottom: 10, height: 44 }}>
        <Sparkline data={bundle.history} color={color} height={44} width={300} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: FS }}>
        <span style={{ color: bundle.change >= 0 ? C.green : C.red }}>
          {bundle.change >= 0 ? "+" : ""}
          {bundle.change.toFixed(1)}% today
        </span>
        <span style={{ color: C.textMuted }}>Resolves {bundle.date}</span>
      </div>
    </div>
  );
}

export function MetricTile({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.07em", marginBottom: 10 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 500,
          color: color ?? C.textPrimary,
          fontFamily: FS,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function Pill({
  children,
  active,
  onClick,
  color,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "7px 16px",
        borderRadius: 8,
        border: `0.5px solid ${active ? color || C.teal : C.border}`,
        background: active ? (color || C.teal) + "18" : "transparent",
        color: active ? color || C.teal : C.textSecondary,
        fontSize: 12,
        fontFamily: FS,
        cursor: "pointer",
        transition: `all 0.2s ${EASE}`,
        fontWeight: active ? 500 : 400,
      }}
    >
      {children}
    </button>
  );
}
