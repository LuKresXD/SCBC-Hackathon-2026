"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, FM, EASE, tc, fmtUsd } from "../_lib/tokens";
import { bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";
import {
  useLiveBaskets,
  matchesPickerWindow,
  type PickerWindow,
} from "../_lib/use-live-baskets";
import type { LiveBasket } from "../_lib/live-baskets";

// Hardcoded DefiLlama pool IDs for top Solana USDC single-sided vaults
// These are stable, well-audited, high-TVL pools
const DEFI_LLAMA_POOLS = [
  { id: "f4844743-d1f9-4b08-b63d-84028c13b28b", name: "Kamino",  fallbackApy: 0.044 },
  { id: "a7c53df8-5a5b-42a3-b5d0-ee3d73b9ac6e", name: "MarginFi", fallbackApy: 0.038 },
  { id: "bd5e5a1c-e70e-4e9e-a7d6-cce55f85264f", name: "Drift",   fallbackApy: 0.042 },
  { id: "c5fd5730-7706-4b3a-8f1e-0b9c4c3e1c2a", name: "Save",   fallbackApy: 0.035 },
];
const METEORA_VAULT_API = "https://merv2-api.meteora.ag/vault_info";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const STRUCTURING_FEE = 0.005; // 0.5% on basket portion only

type VaultSource = { name: string; apy: number; live: boolean };

// Dynamic split: vault grows back to principal by maturity
function calcDynamicSplit(apyDecimal: number, days: number): { vaultPct: number; basketPct: number } {
  if (apyDecimal <= 0 || days <= 0) return { vaultPct: 0.99, basketPct: 0.01 };
  const dailyRate = apyDecimal / 365;
  const growthFactor = Math.pow(1 + dailyRate, days);
  const vaultPct = 1 / growthFactor;
  return { vaultPct, basketPct: 1 - vaultPct };
}

export default function PpnPage() {
  const { state, dispatch } = useSandbox();
  const basketState = useLiveBaskets();
  const [selectedBundle, setSelectedBundle] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [renderNow, setRenderNow] = useState<number>(() => Date.now());

  // Live vault sources state
  const [vaultSources, setVaultSources] = useState<VaultSource[]>([]);
  const [bestVault, setBestVault] = useState<VaultSource | null>(null);
  const [apyLoading, setApyLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setRenderNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    async function fetchApys() {
      setApyLoading(true);
      const sources: VaultSource[] = [];

      // Try DefiLlama for each pool
      for (const pool of DEFI_LLAMA_POOLS) {
        try {
          const res = await fetch(`https://yields.llama.fi/pool/${pool.id}`);
          if (res.ok) {
            const data = await res.json();
            const apy = (data?.data?.apy ?? 0) / 100;
            if (apy > 0) {
              sources.push({ name: pool.name, apy, live: true });
              continue;
            }
          }
        } catch {}
        // Fallback to hardcoded
        sources.push({ name: pool.name, apy: pool.fallbackApy, live: false });
      }

      // Try Meteora as additional source
      try {
        const res = await fetch(METEORA_VAULT_API);
        if (res.ok) {
          const data = await res.json();
          const usdcVault = data.find((v: { token_address: string }) =>
            v.token_address?.toLowerCase() === USDC_MINT.toLowerCase()
          );
          if (usdcVault) {
            const apy = (usdcVault.average_apy ?? usdcVault.closest_apy ?? 0) / 100;
            if (apy > 0) sources.push({ name: "Meteora", apy, live: true });
          }
        }
      } catch {}
      if (!sources.find(s => s.name === "Meteora")) {
        sources.push({ name: "Meteora", apy: 0.03, live: false });
      }

      // Sort by APY descending, pick best
      sources.sort((a, b) => b.apy - a.apy);
      setVaultSources(sources);
      setBestVault(sources[0] ?? null);
      setApyLoading(false);
    }

    fetchApys();
    const interval = setInterval(fetchApys, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const [bundleTier, setBundleTier] = useState<90 | 70 | 50>(90);
  const [bundleTime, setBundleTime] = useState<PickerWindow>("all");

  const liveBaskets: LiveBasket[] =
    basketState.status === "ok" ? basketState.baskets : [];

  // Auto-select the first matching live basket whenever the filters change
  // or the selected basket disappears from the universe.
  const filteredBaskets = useMemo(() => {
    return liveBaskets
      .filter((b) => b.tier === bundleTier)
      .filter((b) => matchesPickerWindow(b.daysLeft, bundleTime))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }, [liveBaskets, bundleTier, bundleTime]);

  useEffect(() => {
    if (filteredBaskets.length === 0) {
      if (selectedBundle !== null) setSelectedBundle(null);
      return;
    }
    const stillThere = filteredBaskets.some((b) => b.id === selectedBundle);
    if (!stillThere) setSelectedBundle(filteredBaskets[0].id);
  }, [filteredBaskets, selectedBundle]);

  const APY = bestVault?.apy ?? 0.035;
  const selectedBundleObj =
    liveBaskets.find((b) => b.id === selectedBundle) ?? filteredBaskets[0] ?? null;
  const maturityDays = selectedBundleObj?.daysLeft ?? 0;

  const dep = parseFloat(amt) || 0;
  const insufficient = dep > state.usdc;  const { vaultPct, basketPct } = calcDynamicSplit(APY, maturityDays);
  const vaultAmt = dep * vaultPct;
  const basketAmt = dep * basketPct;
  const fee = basketAmt * STRUCTURING_FEE; // 0.5% on basket only, not vault
  const basketAmtAfterFee = basketAmt - fee;
  const vaultAtMaturity = vaultAmt * Math.pow(1 + APY / 365, maturityDays);
  const estimatedYield = vaultAtMaturity - vaultAmt;

  function handleDeposit() {
    if (dep <= 0 || insufficient || !selectedBundle || !selectedBundleObj) return;
    dispatch({
      type: "ppn/open",
      bundleId: selectedBundle,
      usdcAmount: dep,
      apy: APY * 100,
      maturityDays,
    });
    setConfirmed(true);
    setTimeout(() => { setAmt(""); setConfirmed(false); }, 1200);
  }

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        {/* Page header */}
        <div style={{ marginBottom: 24, position: "relative", paddingBottom: 22, borderBottom: "0.5px solid rgba(45, 212, 191, 0.1)" }}>
          <div style={{ position: "absolute", top: 0, right: 0, width: 220, height: 140, background: "radial-gradient(ellipse at top right, rgba(139, 92, 246, 0.1) 0%, transparent 70%)", pointerEvents: "none" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, position: "relative" }}>
            <span style={{ width: 18, height: 1, background: C.violet, opacity: 0.7 }} />
            <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.22em", color: C.violet, fontWeight: 500 }}>PRINCIPAL PROTECTED</span>
            <span style={{ width: 18, height: 1, background: C.violet, opacity: 0.7 }} />
          </div>
          <div style={{ fontSize: 32, fontWeight: 200, color: C.textPrimary, fontFamily: FD, marginBottom: 6, letterSpacing: "-0.02em" }}>
            Zero-loss <span style={{ fontWeight: 500, background: "linear-gradient(90deg, #a78bfa 0%, #c4b5fd 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>structured notes</span>
          </div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, maxWidth: 620, lineHeight: 1.6 }}>
            Your principal is locked in a top Solana USDC vault. The split is calculated so vault yield alone covers your full deposit by maturity. You never put principal at risk, just the basket portion.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 24 }}>
          <MetricTile label="PRINCIPAL" value="100% guaranteed" color={C.teal} sub="returned at maturity" />
          <MetricTile
            label={`BEST VAULT APY${apyLoading ? "" : " · " + (bestVault?.name ?? "")}`}
            value={apyLoading ? "Loading..." : `${(APY * 100).toFixed(2)}%`}
            color={C.green}
            sub={apyLoading ? "scanning vaults..." : `${bestVault?.live ? "live rate" : "estimated"}, auto-selected`}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 20 }}>
          <div>
            {/* Dynamic split explainer */}
            <div style={{
              background: "linear-gradient(135deg, rgba(139, 92, 246, 0.08) 0%, rgba(5, 8, 12, 0.8) 100%)",
              border: "0.5px solid rgba(139, 92, 246, 0.2)",
              borderRadius: 14,
              padding: "18px 20px",
              marginBottom: 20,
              position: "relative",
              overflow: "hidden",
            }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1.5, background: "linear-gradient(to right, transparent, rgba(139, 92, 246, 0.6), transparent)" }} />
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ width: 14, height: 1, background: C.violet, opacity: 0.6 }} />
                <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.18em", color: C.violet, fontWeight: 500 }}>HOW THE SPLIT WORKS</span>
              </div>
              <p style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, lineHeight: 1.65, marginBottom: 14 }}>
                We compare {vaultSources.length} Solana USDC vaults in real time and route to the best rate. The split is sized so vault yield alone covers your full principal by maturity. The basket is pure upside, and we take our 0.5% fee only on that part.
              </p>

              {/* Vault comparison table */}
              {vaultSources.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  {vaultSources.map((v, i) => (
                    <div key={v.name} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "7px 12px", borderRadius: 8, marginBottom: 4,
                      background: i === 0 ? "rgba(45, 212, 191, 0.08)" : "rgba(5, 8, 12, 0.4)",
                      border: `0.5px solid ${i === 0 ? "rgba(45, 212, 191, 0.25)" : "rgba(255,255,255,0.05)"}`,
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {i === 0 && <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.tealLight, boxShadow: `0 0 6px ${C.tealLight}` }} />}
                        <span style={{ fontSize: 12, color: i === 0 ? C.textPrimary : C.textSecondary, fontFamily: FD, fontWeight: i === 0 ? 600 : 400 }}>{v.name}</span>
                        {i === 0 && <span style={{ fontSize: 9, color: C.tealLight, fontFamily: FM, letterSpacing: "0.1em", padding: "1px 5px", border: `0.5px solid ${C.tealLight}40`, borderRadius: 4 }}>BEST</span>}
                      </div>
                      <span style={{ fontSize: 12, color: i === 0 ? C.tealLight : C.textSecondary, fontFamily: FM, fontWeight: i === 0 ? 600 : 400 }}>{(v.apy * 100).toFixed(2)}%</span>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: "rgba(5, 8, 12, 0.5)", borderRadius: 10, padding: "10px 14px", fontFamily: FM, fontSize: 11, color: C.textMuted, letterSpacing: "0.04em" }}>
                Vault: <span style={{ color: C.teal }}>{(vaultPct * 100).toFixed(2)}%</span> · Basket upside: <span style={{ color: C.amber }}>{(basketPct * 100).toFixed(2)}%</span> · Maturity: <span style={{ color: C.tealLight }}>{maturityDays}d</span>
              </div>
              {dep > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                    <div style={{ width: `${vaultPct * 100}%`, background: `linear-gradient(to right, ${C.teal}, #2dd4bf)`, borderRadius: "4px 0 0 4px" }} />
                    <div style={{ width: `${basketPct * 100}%`, background: `linear-gradient(to right, ${C.amber}, #fb923c)`, borderRadius: "0 4px 4px 0" }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: FM, letterSpacing: "0.04em" }}>
                    <span style={{ color: C.teal }}>{(vaultPct * 100).toFixed(2)}% vault · {fmtUsd(vaultAmt, 0)}</span>
                    <span style={{ color: C.amber }}>{(basketPct * 100).toFixed(2)}% basket · {fmtUsd(basketAmt, 0)}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Basket picker */}
            <div style={{ background: "linear-gradient(135deg, rgba(15, 21, 32, 0.7) 0%, rgba(5, 8, 12, 0.8) 100%)", border: "0.5px solid rgba(255, 255, 255, 0.06)", borderRadius: 14, padding: 20, marginBottom: 20, backdropFilter: "blur(10px)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.6 }} />
                <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, fontWeight: 500 }}>PICK A REFERENCE BASKET</span>
              </div>

              {/* Tier filter */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: C.textMuted, fontFamily: FM, letterSpacing: "0.16em", marginBottom: 8 }}>PROBABILITY TIER</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {([90, 70, 50] as const).map(t => (
                    <button key={t} onClick={() => { setBundleTier(t); setBundleTime("all"); }} style={{
                      padding: "6px 14px", borderRadius: 100, cursor: "pointer",
                      border: `0.5px solid ${bundleTier === t ? tc(t) : "rgba(255,255,255,0.08)"}`,
                      background: bundleTier === t ? `${tc(t)}15` : "transparent",
                      color: bundleTier === t ? tc(t) : C.textSecondary,
                      fontSize: 12, fontFamily: FD, fontWeight: bundleTier === t ? 500 : 400,
                      boxShadow: bundleTier === t ? `0 0 14px ${tc(t)}20` : "none",
                      transition: `all 0.2s ${EASE}`,
                    }}>{t}%</button>
                  ))}
                </div>
              </div>

              {/* Time filter */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 9, color: C.textMuted, fontFamily: FM, letterSpacing: "0.16em", marginBottom: 8 }}>RESOLUTION WINDOW</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {(["all", "week", "month", "6months", "long"] as const).map(t => {
                    const labels = { all: "All", week: "This week", month: "This month", "6months": "6 months", long: "Long term" };
                    return (
                      <button key={t} onClick={() => setBundleTime(t)} style={{
                        padding: "6px 12px", borderRadius: 100, cursor: "pointer",
                        border: `0.5px solid ${bundleTime === t ? C.tealLight : "rgba(255,255,255,0.08)"}`,
                        background: bundleTime === t ? "rgba(45, 212, 191, 0.1)" : "transparent",
                        color: bundleTime === t ? C.tealLight : C.textSecondary,
                        fontSize: 11, fontFamily: FD, fontWeight: bundleTime === t ? 500 : 400,
                        transition: `all 0.2s ${EASE}`,
                      }}>{labels[t]}</button>
                    );
                  })}
                </div>
              </div>

              {/* Live basket grid — mirrors the exact same synthetic baskets
                  surfaced on /app/basket so the PPN reference universe and
                  the tranching universe stay consistent. */}
              {basketState.status === "loading" && (
                <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: FS, padding: "20px 0" }}>
                  Loading live baskets…
                </div>
              )}
              {basketState.status === "error" && (
                <div style={{ textAlign: "center", color: C.red, fontSize: 12, fontFamily: FS, padding: "20px 0" }}>
                  Couldn't load live baskets: {basketState.error}
                </div>
              )}
              {basketState.status === "ok" && filteredBaskets.length === 0 && (
                <div style={{ textAlign: "center", color: C.textMuted, fontSize: 13, fontFamily: FS, padding: "20px 0" }}>
                  No live baskets match these filters
                </div>
              )}
              {basketState.status === "ok" && filteredBaskets.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
                  {filteredBaskets.map((b) => {
                    const active = selectedBundle === b.id;
                    const topLeg = [...b.markets].sort(
                      (x, y) => y.volumeUsd - x.volumeUsd,
                    )[0];
                    // Border styles are specified as long-hand on every
                    // side — mixing `border` (shorthand) with `borderLeft`
                    // triggers a React re-render warning because the two
                    // properties compete for the same DOM slot when
                    // `active` flips. Using only long-hand keeps the
                    // `borderLeft` tier accent stable while the other
                    // three sides toggle on selection.
                    const sideBorder = `0.5px solid ${active ? tc(b.tier) + "60" : "rgba(255, 255, 255, 0.06)"}`;
                    return (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBundle(b.id)}
                        style={{
                          background: active ? `${tc(b.tier)}10` : "rgba(10, 15, 24, 0.6)",
                          borderTop: sideBorder,
                          borderRight: sideBorder,
                          borderBottom: sideBorder,
                          borderLeft: `3px solid ${tc(b.tier)}`,
                          borderRadius: 10,
                          padding: "10px 14px",
                          cursor: "pointer",
                          transition: `all 0.2s ${EASE}`,
                          boxShadow: active ? `0 0 16px ${tc(b.tier)}18` : "none",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>
                            {b.id}
                          </div>
                          <div style={{ fontSize: 10, color: tc(b.tier), fontFamily: FM, fontWeight: 600 }}>
                            {b.daysLeft}d
                          </div>
                        </div>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, marginTop: 3, letterSpacing: "0.04em" }}>
                          {b.totalLegs} legs · NAV {(b.nav * 100).toFixed(1)}% · resolves {b.date}
                        </div>
                        {topLeg && (
                          <div
                            style={{
                              fontSize: 10,
                              color: C.textSecondary,
                              fontFamily: FS,
                              marginTop: 6,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={topLeg.question}
                          >
                            • {topLeg.question}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Existing vaults */}
            {state.ppnVaults.length > 0 && (
              <div style={{ background: "linear-gradient(135deg, rgba(15, 21, 32, 0.7) 0%, rgba(5, 8, 12, 0.8) 100%)", border: "0.5px solid rgba(255, 255, 255, 0.06)", borderRadius: 14, padding: 20, backdropFilter: "blur(10px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.6 }} />
                  <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, fontWeight: 500 }}>YOUR VAULTS</span>
                </div>
                {state.ppnVaults.map((v) => {
                  // Prefer live basket metadata (fresh NAV/date); fall back
                  // to the seeded BUNDLES for legacy vault ids that no
                  // longer exist in the live universe.
                  const liveBasket = liveBaskets.find((b) => b.id === v.bundleId);
                  const b = liveBasket ?? bundleById(v.bundleId);
                  const elapsed = Math.max(0, (renderNow - v.createdAt) / 86_400_000);
                  const accrued = v.principal * (v.apy / 100 / 365) * Math.min(elapsed, v.maturityDays);
                  return (
                    <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: `0.5px solid rgba(255, 255, 255, 0.05)` }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 3, height: 28, borderRadius: 2, background: C.violet, boxShadow: `0 0 6px ${C.violet}66` }} />
                        <div>
                          <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD, fontWeight: 500 }}>{b?.id ?? v.bundleId}</div>
                          <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FM, marginTop: 2, letterSpacing: "0.04em" }}>
                            {Math.max(0, v.maturityDays - Math.floor(elapsed))}d left · {v.apy.toFixed(2)}% APY
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(v.principal, 2)}</div>
                        <div style={{ fontSize: 11, color: C.green, fontFamily: FS, marginTop: 2 }}>+{fmtUsd(accrued, 4)} accrued</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right panel - deposit form */}
          <div style={{
            background: "linear-gradient(135deg, rgba(15, 21, 32, 0.9) 0%, rgba(5, 8, 12, 0.95) 100%)",
            border: "0.5px solid rgba(139, 92, 246, 0.15)",
            borderRadius: 16,
            padding: 22,
            position: "relative",
            overflow: "hidden",
            backdropFilter: "blur(12px)",
            alignSelf: "start",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: C.violet, opacity: 0.7 }} />
            <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, background: `radial-gradient(circle, ${C.violet}18 0%, transparent 65%)`, pointerEvents: "none" }} />

            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 6, position: "relative" }}>New PPN</div>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, marginBottom: 16, letterSpacing: "0.04em" }}>
              DEMO BALANCE · <span style={{ color: C.teal }}>${state.usdc.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> USDC
            </div>

            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 6 }}>DEPOSIT USDC</div>
            <input
              type="number"
              placeholder="0"
              value={amt}
              onChange={(e) => { setAmt(e.target.value); setConfirmed(false); }}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 20,
                fontFamily: FD,
                fontWeight: 600,
                background: C.surface,
                border: `0.5px solid ${insufficient ? C.red : "rgba(255, 255, 255, 0.08)"}`,
                borderRadius: 10,
                color: C.textPrimary,
                marginBottom: insufficient ? 6 : 14,
                outline: "none",
              }}
            />
            {insufficient && <div style={{ fontSize: 11, color: C.red, fontFamily: FS, marginBottom: 10 }}>Insufficient balance</div>}

            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>MATURITY</span>
              <span style={{ color: C.tealLight, fontFamily: FM }}>{maturityDays}d · auto from basket</span>
            </div>

            {/* Live split breakdown */}
            <div style={{ background: C.surface, borderRadius: 10, padding: "14px", marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>BREAKDOWN · {maturityDays}d @ {(APY * 100).toFixed(2)}% via {bestVault?.name ?? "vault"}</div>
              {[
                ["Vault (protected)", dep > 0 ? fmtUsd(vaultAmt, 0) : "-", C.teal, "no fee"],
                ["Basket (upside)", dep > 0 ? fmtUsd(basketAmtAfterFee, 2) : "-", C.amber, "after 0.5% fee"],
                ["Structuring fee", dep > 0 ? fmtUsd(fee, 2) : "-", C.textMuted, "0.5% of basket"],
                ["Yield by maturity", dep > 0 ? `+${fmtUsd(estimatedYield, 2)}` : "-", C.green, "est."],
                ["Minimum return", dep > 0 ? fmtUsd(dep, 0) : "-", C.textPrimary, "guaranteed"],
              ].map(([k, v, c, tag]) => (
                <div key={k as string} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, fontFamily: FS, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ color: C.textSecondary }}>{k as string}</span>
                    <span style={{ fontSize: 9, color: c as string, fontFamily: FM, padding: "1px 5px", borderRadius: 4, border: `0.5px solid ${c as string}40`, letterSpacing: "0.06em" }}>{tag as string}</span>
                  </div>
                  <span style={{ color: c as string, fontFamily: FD, fontWeight: 600 }}>{v as string}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleDeposit}
              disabled={insufficient || dep <= 0 || !selectedBundle}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: confirmed
                  ? C.green
                  : insufficient || dep <= 0 || !selectedBundle
                    ? "rgba(255,255,255,0.06)"
                    : C.violet,
                color: insufficient || dep <= 0 || !selectedBundle ? C.textMuted : "#fff",
                fontSize: 14, fontWeight: 700, fontFamily: FD,
                cursor: insufficient || dep <= 0 || !selectedBundle ? "not-allowed" : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {confirmed
                ? "✓ PPN opened"
                : !selectedBundle
                  ? "Pick a basket first"
                  : insufficient
                    ? "Insufficient USDC"
                    : "Open PPN"}
            </button>
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, textAlign: "center", marginTop: 10 }}>
              Split auto-calculated · principal guaranteed at maturity
            </div>
          </div>
        </div>
      </PageFrame>
    </>
  );
}