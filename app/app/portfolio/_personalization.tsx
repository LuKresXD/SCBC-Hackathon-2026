"use client";

/**
 * Personalization — AI portfolio composer.
 *
 * Calls POST /api/portfolio/construct with risk_pct, capital_usd, and an
 * objective. The backend fans out to Claude (via Anthropic SDK) with live
 * state for lending pool, tranche quotes, and curated Polymarket markets,
 * then returns a structured allocation plan that we render as a strategy
 * summary + metric tiles + a list of colour-coded allocation rows.
 */

import React, { useMemo, useState } from "react";
import { C, FS, FD, FM, EASE, BACKEND_URL, fmtUsd } from "../_lib/tokens";
import { MetricTile } from "../_components/charts";

type Objective = "income" | "balanced" | "speculation";
type Horizon = "short" | "medium" | "long";
type Status = "idle" | "loading" | "success" | "error";

interface AllocationTrancheDetails {
  basket_name?: string;
  tier: "senior" | "mezzanine" | "junior";
  expected_yield_pct: number;
  price_per_token: number;
}
interface AllocationLendingDetails {
  supply_apy_pct: number;
  utilization: number;
}
interface AllocationMarketDetails {
  market_id: string;
  question: string;
  side: "YES" | "NO";
  implied_prob: number;
  category?: string;
}
type AllocationDetails =
  | AllocationTrancheDetails
  | AllocationLendingDetails
  | AllocationMarketDetails;

interface Allocation {
  kind: "tranche" | "lending" | "market";
  weight: number;
  usd_amount: number;
  details: AllocationDetails;
  rationale: string;
}

interface PortfolioResponse {
  allocations: Allocation[];
  summary: string;
  expected_apy_low: number;
  expected_apy_high: number;
  risk_score: number;
  generated_at: string;
}

const OBJECTIVES: { id: Objective; label: string; sub: string }[] = [
  { id: "income",      label: "Income",      sub: "Steady yield, tight variance" },
  { id: "balanced",    label: "Balanced",    sub: "Follow the risk dial" },
  { id: "speculation", label: "Speculation", sub: "Maximise dispersion" },
];

const HORIZONS: { id: Horizon; label: string; sub: string }[] = [
  { id: "short",  label: "Short",  sub: "Under a month" },
  { id: "medium", label: "Medium", sub: "One to three months" },
  { id: "long",   label: "Long",   sub: "Three months or more" },
];

const CAPITAL_CAP = 100_000;

export function Personalization() {
  const [capital, setCapital] = useState<string>("1000");
  const [risk, setRisk] = useState<number>(50);
  const [objective, setObjective] = useState<Objective>("balanced");
  const [horizon, setHorizon] = useState<Horizon>("medium");
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<PortfolioResponse | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const capitalNum = useMemo(() => {
    const n = parseFloat(capital);
    return Number.isFinite(n) ? n : NaN;
  }, [capital]);

  const capitalValid =
    Number.isFinite(capitalNum) && capitalNum > 0 && capitalNum <= CAPITAL_CAP;

  const riskLabel =
    risk < 30 ? "Conservative" : risk < 70 ? "Balanced" : "Aggressive";
  const riskColor =
    risk < 30 ? C.tealLight : risk < 70 ? C.amber : C.coral;

  async function generate() {
    if (!capitalValid) {
      setErrMsg(`Capital must be between $1 and $${CAPITAL_CAP.toLocaleString()}`);
      setStatus("error");
      return;
    }
    setStatus("loading");
    setErrMsg(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/portfolio/construct`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          risk_pct: risk,
          capital_usd: capitalNum,
          objective,
          horizon,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          body.message ||
          (body.error === "timeout"
            ? "Claude took too long. Try again."
            : body.error === "upstream_rate_limit"
              ? "Claude is rate-limited right now. One moment."
              : `Request failed (${res.status})`);
        throw new Error(msg);
      }
      const data: PortfolioResponse = await res.json();
      setResult(data);
      setStatus("success");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : "Request failed");
      setStatus("error");
    }
  }

  function reset() {
    setStatus("idle");
    setResult(null);
    setErrMsg(null);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ---------- Form card ---------- */}
      <div
        style={{
          background:
            "linear-gradient(180deg, rgba(13, 19, 28, 0.92) 0%, rgba(5, 8, 12, 0.96) 100%)",
          border: `0.5px solid ${C.border}`,
          borderRadius: 20,
          padding: 32,
          position: "relative",
          overflow: "hidden",
          boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 60px rgba(0,0,0,0.25)",
        }}
      >
        {/* soft header wash */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 1.5,
            background:
              "linear-gradient(90deg, transparent 0%, rgba(45, 212, 191, 0.4) 20%, #2dd4bf 50%, rgba(45, 212, 191, 0.4) 80%, transparent 100%)",
            opacity: 0.55,
          }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -80,
            left: -60,
            width: 260,
            height: 260,
            background:
              "radial-gradient(circle, rgba(45, 212, 191, 0.08) 0%, transparent 65%)",
            pointerEvents: "none",
          }}
        />

        {/* Intro */}
        <div style={{ position: "relative", marginBottom: 28, maxWidth: 620 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <SparkleGlyph />
            <span
              style={{
                fontFamily: FM,
                fontSize: 10,
                letterSpacing: "0.22em",
                color: C.tealLight,
                fontWeight: 500,
              }}
            >
              PERSONALIZATION
            </span>
          </div>
          <div
            style={{
              fontSize: 24,
              fontWeight: 300,
              color: C.textPrimary,
              fontFamily: FD,
              marginBottom: 8,
              letterSpacing: "-0.02em",
              lineHeight: 1.15,
            }}
          >
            Tell us what you want, get an allocation
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, lineHeight: 1.55 }}>
            Senthos builds an allocation across the pool, tranche quotes, and curated markets from the risk profile and objective you set
          </div>
        </div>

        {/* Two-column on desktop */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.2fr)",
            gap: 28,
            position: "relative",
          }}
        >
          {/* Capital */}
          <Field label="Capital">
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 6,
                borderBottom: `1px solid ${C.border}`,
                paddingBottom: 8,
                transition: `border-color 0.15s ${EASE}`,
              }}
            >
              <span style={{ fontSize: 28, color: C.textSecondary, fontFamily: FD, fontWeight: 300 }}>
                $
              </span>
              <input
                type="number"
                value={capital}
                onChange={(e) => {
                  setCapital(e.target.value);
                  if (status === "error") setErrMsg(null);
                }}
                placeholder="1,000"
                inputMode="decimal"
                min={1}
                max={CAPITAL_CAP}
                style={{
                  background: "transparent",
                  border: "none",
                  color: C.textPrimary,
                  fontFamily: FD,
                  fontSize: 30,
                  fontWeight: 400,
                  letterSpacing: "-0.02em",
                  padding: 0,
                  width: "100%",
                  outline: "none",
                }}
              />
            </div>
            <div
              style={{
                fontSize: 10,
                color: C.textMuted,
                fontFamily: FM,
                letterSpacing: "0.12em",
                marginTop: 8,
              }}
            >
              $1 – ${CAPITAL_CAP.toLocaleString()} USD
            </div>
          </Field>

          {/* Risk */}
          <Field label={`Risk · ${riskLabel}`} labelColor={riskColor}>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={risk}
                  onChange={(e) => setRisk(parseInt(e.target.value, 10))}
                  style={{
                    width: "100%",
                    accentColor: riskColor,
                  }}
                />
              </div>
              <div
                style={{
                  width: 70,
                  textAlign: "right",
                  fontSize: 30,
                  fontFamily: FD,
                  fontWeight: 400,
                  color: riskColor,
                  letterSpacing: "-0.02em",
                  lineHeight: 1,
                }}
              >
                {risk}
                <span style={{ fontSize: 14, color: C.textMuted, marginLeft: 2 }}>/100</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                color: C.textMuted,
                fontFamily: FM,
                letterSpacing: "0.12em",
                marginTop: 8,
              }}
            >
              <span>SAFE</span>
              <span>BALANCED</span>
              <span>AGGRESSIVE</span>
            </div>
          </Field>
        </div>

        {/* Objective + Horizon — stacked full-width rows so each pill
             matches the Objective pill size. Keeps the form uniform. */}
        <div style={{ marginTop: 28 }}>
          <Field label="Objective">
            <PillGroup
              options={OBJECTIVES}
              value={objective}
              onChange={setObjective}
            />
          </Field>
        </div>
        <div style={{ marginTop: 24 }}>
          <Field label="Horizon">
            <PillGroup
              options={HORIZONS}
              value={horizon}
              onChange={setHorizon}
            />
          </Field>
        </div>

        {/* Action row */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 28, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={generate}
            disabled={status === "loading"}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              cursor: status === "loading" ? "wait" : "pointer",
              fontFamily: FD,
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: "0.02em",
              background: status === "loading" ? "rgba(45, 212, 191, 0.18)" : C.tealLight,
              color: status === "loading" ? C.tealLight : "#001814",
              boxShadow:
                status === "loading"
                  ? "none"
                  : `0 0 0 1px ${C.tealLight}, 0 10px 28px rgba(45, 212, 191, 0.20)`,
              transition: `all 0.15s ${EASE}`,
            }}
            onMouseEnter={(e) => {
              if (status === "loading") return;
              (e.currentTarget as HTMLElement).style.transform = "translateY(-1px)";
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${C.tealLight}, 0 14px 36px rgba(45, 212, 191, 0.32)`;
            }}
            onMouseLeave={(e) => {
              if (status === "loading") return;
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
              (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 1px ${C.tealLight}, 0 10px 28px rgba(45, 212, 191, 0.20)`;
            }}
          >
            {status === "loading" ? (
              <>
                <LoadingDot />
                Constructing
              </>
            ) : (
              <>Build my portfolio →</>
            )}
          </button>

          {status !== "idle" && status !== "loading" && (
            <button
              type="button"
              onClick={reset}
              style={{
                padding: "11px 16px",
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "transparent",
                color: C.textSecondary,
                cursor: "pointer",
                fontFamily: FD,
                fontSize: 12,
                letterSpacing: "0.02em",
                transition: `color 0.15s ${EASE}, border-color 0.15s ${EASE}`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = C.textPrimary;
                (e.currentTarget as HTMLElement).style.borderColor = C.borderHover;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = C.textSecondary;
                (e.currentTarget as HTMLElement).style.borderColor = C.border;
              }}
            >
              Reset
            </button>
          )}

          {errMsg && (
            <div
              style={{
                fontSize: 12,
                color: C.red,
                fontFamily: FS,
                lineHeight: 1.4,
                flex: "1 0 100%",
                paddingTop: 2,
              }}
            >
              {errMsg}
            </div>
          )}
        </div>
      </div>

      {/* ---------- Loading skeleton ---------- */}
      {status === "loading" && <LoadingSkeleton />}

      {/* ---------- Result ---------- */}
      {status === "success" && result && <ResultView result={result} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  labelColor,
}: {
  label: string;
  children: React.ReactNode;
  labelColor?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10,
          color: labelColor ?? C.textMuted,
          fontFamily: FM,
          letterSpacing: "0.18em",
          marginBottom: 14,
          fontWeight: 500,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

// Reusable 3-card pill picker. Generic in the option id so Objective and
// Horizon can share the same render path without type loss.
function PillGroup<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string; sub: string }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`, gap: 10 }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            style={{
              textAlign: "left",
              padding: "14px 16px",
              borderRadius: 10,
              border: `1px solid ${active ? `${C.tealLight}66` : "rgba(255, 255, 255, 0.08)"}`,
              background: active
                ? "rgba(45, 212, 191, 0.08)"
                : "rgba(10, 15, 24, 0.5)",
              color: active ? C.textPrimary : C.textSecondary,
              cursor: "pointer",
              transition: `background 0.15s ${EASE}, border-color 0.15s ${EASE}, color 0.15s ${EASE}`,
            }}
            onMouseEnter={(e) => {
              if (active) return;
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.14)";
              (e.currentTarget as HTMLElement).style.background = "rgba(14, 21, 30, 0.75)";
            }}
            onMouseLeave={(e) => {
              if (active) return;
              (e.currentTarget as HTMLElement).style.borderColor = "rgba(255, 255, 255, 0.08)";
              (e.currentTarget as HTMLElement).style.background = "rgba(10, 15, 24, 0.5)";
            }}
          >
            <div
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: active ? C.tealLight : C.textPrimary,
                fontFamily: FD,
                letterSpacing: "-0.005em",
                marginBottom: 4,
              }}
            >
              {o.label}
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, fontFamily: FS, lineHeight: 1.35 }}>
              {o.sub}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function SparkleGlyph() {
  // Minimal AI-sparkle glyph for the eyebrow
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z"
        fill={C.tealLight}
        opacity="0.85"
      />
      <circle cx="19" cy="5" r="1.2" fill={C.tealLight} opacity="0.7" />
      <circle cx="5" cy="19" r="0.9" fill={C.tealLight} opacity="0.55" />
    </svg>
  );
}

function LoadingDot() {
  return (
    <>
      <style>{`
        @keyframes sthsDot { 0% { transform: scale(0.8); opacity: 0.4; } 50% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(0.8); opacity: 0.4; } }
      `}</style>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: C.tealLight,
          display: "inline-block",
          animation: "sthsDot 1.1s ease-in-out infinite",
        }}
      />
    </>
  );
}

function LoadingSkeleton() {
  return (
    <>
      <style>{`
        @keyframes sthsShimmer { 0% { background-position: -300px 0; } 100% { background-position: 300px 0; } }
        .sths-shimmer {
          background: linear-gradient(90deg, rgba(45, 212, 191, 0.03) 0%, rgba(45, 212, 191, 0.09) 50%, rgba(45, 212, 191, 0.03) 100%);
          background-size: 600px 100%;
          animation: sthsShimmer 1.8s linear infinite;
        }
      `}</style>
      <div
        style={{
          background: "rgba(13, 19, 28, 0.65)",
          border: `0.5px solid ${C.border}`,
          borderRadius: 16,
          padding: "24px 28px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div className="sths-shimmer" style={{ height: 12, width: "40%", borderRadius: 4 }} />
        <div className="sths-shimmer" style={{ height: 14, width: "90%", borderRadius: 4 }} />
        <div className="sths-shimmer" style={{ height: 14, width: "70%", borderRadius: 4 }} />
        <div style={{ height: 1, background: C.border, margin: "8px 0" }} />
        {[1, 2, 3].map((i) => (
          <div key={i} className="sths-shimmer" style={{ height: 52, borderRadius: 10 }} />
        ))}
      </div>
    </>
  );
}

function ResultView({ result }: { result: PortfolioResponse }) {
  const riskColor =
    result.risk_score > 70 ? C.coral : result.risk_score > 40 ? C.amber : C.tealLight;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Strategy + metrics */}
      <div
        style={{
          background: "rgba(13, 19, 28, 0.7)",
          border: `0.5px solid ${C.border}`,
          borderRadius: 18,
          padding: "26px 28px",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -50,
            right: -50,
            width: 160,
            height: 160,
            background: "radial-gradient(circle, rgba(45, 212, 191, 0.08) 0%, transparent 65%)",
            pointerEvents: "none",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <SparkleGlyph />
          <span
            style={{
              fontFamily: FM,
              fontSize: 10,
              letterSpacing: "0.22em",
              color: C.tealLight,
              fontWeight: 500,
            }}
          >
            STRATEGY
          </span>
        </div>
        <div
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: C.textPrimary,
            fontFamily: FS,
            fontWeight: 300,
            marginBottom: 22,
            maxWidth: 820,
            position: "relative",
          }}
        >
          {result.summary}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          <MetricTile
            label="EXPECTED APY"
            value={`${result.expected_apy_low.toFixed(1)}% – ${result.expected_apy_high.toFixed(1)}%`}
          />
          <MetricTile
            label="RISK SCORE"
            value={`${result.risk_score}/100`}
            color={riskColor}
            sub={
              result.risk_score > 70
                ? "Aggressive"
                : result.risk_score > 40
                  ? "Moderate"
                  : "Conservative"
            }
          />
          <MetricTile
            label="ALLOCATIONS"
            value={`${result.allocations.length}`}
            sub="positions across primitives"
          />
        </div>
      </div>

      {/* Allocation list header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "4px 6px",
          marginTop: 4,
        }}
      >
        <div
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.22em",
            color: C.textMuted,
            fontWeight: 500,
          }}
        >
          ALLOCATIONS
        </div>
        <div
          style={{
            fontFamily: FM,
            fontSize: 10,
            letterSpacing: "0.14em",
            color: C.textMuted,
          }}
        >
          GENERATED {new Date(result.generated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {result.allocations.map((a, i) => (
          <AllocationRow key={i} a={a} />
        ))}
      </div>
    </div>
  );
}

function AllocationRow({ a }: { a: Allocation }) {
  let accent: string = C.textSecondary;
  let tag = "";
  let title = "";
  let sub = "";

  if (a.kind === "tranche") {
    const d = a.details as AllocationTrancheDetails;
    accent = d.tier === "senior" ? C.tealLight : d.tier === "mezzanine" ? C.amber : C.coral;
    tag = `TRANCHE · ${String(d.tier ?? "").toUpperCase()}`;
    title = d.basket_name || "Senthos basket";
    const yield_ = Number.isFinite(d.expected_yield_pct) ? d.expected_yield_pct.toFixed(1) : "—";
    const price = Number.isFinite(d.price_per_token) ? d.price_per_token.toFixed(4) : "—";
    sub = `Expected yield ${yield_}% · price $${price} / $1 face`;
  } else if (a.kind === "lending") {
    const d = a.details as AllocationLendingDetails;
    accent = C.blue;
    tag = "LENDING";
    title = "USDC money market";
    const apy = Number.isFinite(d.supply_apy_pct) ? d.supply_apy_pct.toFixed(2) : "—";
    const util = Number.isFinite(d.utilization) ? (d.utilization * 100).toFixed(1) : "—";
    sub = `Supply APY ${apy}% · utilization ${util}%`;
  } else if (a.kind === "market") {
    const d = a.details as AllocationMarketDetails;
    accent = d.side === "YES" ? C.tealLight : C.coral;
    tag = `MARKET · ${d.side}`;
    title = d.question || "Prediction market";
    const implied = Number.isFinite(d.implied_prob) ? (d.implied_prob * 100).toFixed(1) : "—";
    sub = `${d.category ? d.category.toUpperCase() + " · " : ""}implied ${implied}%`;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "4px minmax(0, 1fr) auto",
        gap: 18,
        background: "rgba(13, 19, 28, 0.65)",
        border: `0.5px solid ${C.border}`,
        borderRadius: 14,
        padding: "18px 22px",
        transition: `border-color 0.2s ${EASE}, background 0.2s ${EASE}`,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = `${accent}44`;
        (e.currentTarget as HTMLElement).style.background = "rgba(15, 22, 32, 0.8)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = C.border;
        (e.currentTarget as HTMLElement).style.background = "rgba(13, 19, 28, 0.65)";
      }}
    >
      <div style={{ background: accent, borderRadius: 2, alignSelf: "stretch" }} />
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 10,
            color: accent,
            fontFamily: FM,
            letterSpacing: "0.18em",
            marginBottom: 6,
            fontWeight: 500,
          }}
        >
          {tag}
        </div>
        <div
          style={{
            fontSize: 14,
            color: C.textPrimary,
            fontFamily: FD,
            fontWeight: 500,
            marginBottom: 4,
            lineHeight: 1.3,
            letterSpacing: "-0.005em",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical" as const,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.textMuted,
            fontFamily: FS,
            marginBottom: 10,
          }}
        >
          {sub}
        </div>
        <div
          style={{
            fontSize: 12.5,
            color: C.textSecondary,
            fontFamily: FS,
            lineHeight: 1.55,
          }}
        >
          {a.rationale}
        </div>
      </div>
      <div style={{ textAlign: "right", alignSelf: "start", minWidth: 96 }}>
        <div
          style={{
            fontSize: 22,
            color: accent,
            fontFamily: FD,
            fontWeight: 500,
            letterSpacing: "-0.02em",
            lineHeight: 1,
          }}
        >
          {(a.weight * 100).toFixed(1)}%
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.textMuted,
            fontFamily: FM,
            marginTop: 6,
            letterSpacing: "0.02em",
          }}
        >
          {fmtUsd(a.usd_amount, 0)}
        </div>
      </div>
    </div>
  );
}
