"use client";

import React, { useEffect, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, FM, EASE, tc, fmtUsd } from "../_lib/tokens";
import { BUNDLES, bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

// USDC mint address on Solana mainnet
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const METEORA_VAULT_API = "https://merv2-api.meteora.ag/vault_info";

// Dynamic split calculation:
// We want vault_portion * (1 + daily_rate)^days = principal
// So vault_portion = principal / (1 + daily_rate)^days
// basket_portion = principal - vault_portion
// This guarantees 100% principal return even if basket goes to zero.
function calcDynamicSplit(apyDecimal: number, days: number): { vaultPct: number; basketPct: number } {
  if (apyDecimal <= 0 || days <= 0) return { vaultPct: 0.99, basketPct: 0.01 };
  const dailyRate = apyDecimal / 365;
  const growthFactor = Math.pow(1 + dailyRate, days);
  const vaultPct = 1 / growthFactor;
  const basketPct = 1 - vaultPct;
  return { vaultPct, basketPct };
}

export default function PpnPage() {
  const { state, dispatch } = useSandbox();
  const [selectedBundle, setSelectedBundle] = useState<string>(BUNDLES[0].id);
  const [amt, setAmt] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [renderNow, setRenderNow] = useState<number>(() => Date.now());

  // Live Meteora APY state
  const [vaultApy, setVaultApy] = useState<number | null>(null);
  const [apyLoading, setApyLoading] = useState(true);
  const [apyError, setApyError] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setRenderNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fetch live Meteora USDC vault APY
  useEffect(() => {
    async function fetchApy() {
      try {
        setApyLoading(true);
        setApyError(false);
        const res = await fetch(METEORA_VAULT_API);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        // Find USDC vault by token address
        const usdcVault = data.find((v: { token_address: string }) =>
          v.token_address?.toLowerCase() === USDC_MINT.toLowerCase()
        );
        if (usdcVault) {
          // API returns APY as a percentage (e.g. 8.4 not 0.084), convert to decimal
          const rawApy = usdcVault.average_apy ?? usdcVault.closest_apy ?? 8.4;
          setVaultApy(rawApy / 100);
        } else {
          setVaultApy(0.084);
        }
      } catch {
        setApyError(true);
        setVaultApy(0.084); // fallback to 8.4%
      } finally {
        setApyLoading(false);
      }
    }
    fetchApy();
    // Refresh every 5 minutes
    const interval = setInterval(fetchApy, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const APY = vaultApy ?? 0.084;
  const selectedBundleObj = BUNDLES.find(b => b.id === selectedBundle) ?? BUNDLES[0];
  const maturityDays = selectedBundleObj.daysLeft;

  const dep = parseFloat(amt) || 0;
  const insufficient = dep > state.usdc;  const { vaultPct, basketPct } = calcDynamicSplit(APY, maturityDays);
  const vaultAmt = dep * vaultPct;
  const basketAmt = dep * basketPct;

  // What the vault grows to by maturity (should equal dep)
  const vaultAtMaturity = vaultAmt * Math.pow(1 + APY / 365, maturityDays);
  // Estimated yield earned on vault portion
  const estimatedYield = vaultAtMaturity - vaultAmt;

  function handleDeposit() {
    if (dep <= 0 || insufficient) return;
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
            Your principal is locked in Meteora's highest-yield USDC vault. The split is calculated so that vault yield alone returns 100% of your deposit by maturity. Only yield is at risk — never principal.
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          <MetricTile label="PRINCIPAL" value="100% guaranteed" color={C.teal} sub="returned at maturity" />
          <MetricTile
            label="VAULT APY (LIVE)"
            value={apyLoading ? "Loading..." : `${(APY * 100).toFixed(2)}%`}
            color={apyError ? C.amber : C.green}
            sub={apyError ? "fallback rate" : "Meteora USDC vault · 24h avg"}
          />
          <MetricTile label="UPSIDE" value="Basket payout" color={C.amber} sub="yield deployed into predictions" />
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
              <p style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS, lineHeight: 1.65, marginBottom: 12 }}>
                The vault/basket split is calculated dynamically. Given the current Meteora USDC APY of <span style={{ color: C.green, fontFamily: FM, fontWeight: 500 }}>{(APY * 100).toFixed(2)}%</span> and your chosen maturity of <span style={{ color: C.tealLight, fontFamily: FM, fontWeight: 500 }}>{maturityDays} days</span>, we calculate exactly how much needs to go into the vault so that daily compounding returns your full principal by maturity.
              </p>
              <div style={{ background: "rgba(5, 8, 12, 0.5)", borderRadius: 10, padding: "12px 16px", fontFamily: FM, fontSize: 11, color: C.textMuted, letterSpacing: "0.04em" }}>
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
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.6 }} />
                <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, fontWeight: 500 }}>PICK A REFERENCE BASKET</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 10 }}>
                {BUNDLES.map((b) => (
                  <div
                    key={b.id}
                    onClick={() => setSelectedBundle(b.id)}
                    style={{
                      background: selectedBundle === b.id ? `${tc(b.tier)}10` : "rgba(10, 15, 24, 0.6)",
                      border: `0.5px solid ${selectedBundle === b.id ? tc(b.tier) + "60" : "rgba(255, 255, 255, 0.06)"}`,
                      borderLeft: `3px solid ${tc(b.tier)}`,
                      borderRadius: 10,
                      padding: "10px 14px",
                      cursor: "pointer",
                      transition: `all 0.2s ${EASE}`,
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{b.id}</div>
                    <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, marginTop: 3, letterSpacing: "0.04em" }}>
                      {b.tier}% tier · NAV {(b.nav * 100).toFixed(1)}% · {b.daysLeft}d left
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Existing vaults */}
            {state.ppnVaults.length > 0 && (
              <div style={{ background: "linear-gradient(135deg, rgba(15, 21, 32, 0.7) 0%, rgba(5, 8, 12, 0.8) 100%)", border: "0.5px solid rgba(255, 255, 255, 0.06)", borderRadius: 14, padding: 20, backdropFilter: "blur(10px)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ width: 14, height: 1, background: C.textMuted, opacity: 0.6 }} />
                  <span style={{ fontFamily: FM, fontSize: 10, letterSpacing: "0.18em", color: C.textMuted, fontWeight: 500 }}>YOUR VAULTS</span>
                </div>
                {state.ppnVaults.map((v) => {
                  const b = bundleById(v.bundleId);
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
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FM, letterSpacing: "0.14em", marginBottom: 10 }}>DYNAMIC SPLIT · {maturityDays}d @ {(APY * 100).toFixed(2)}% APY</div>
              {[
                ["Vault (protected)", dep > 0 ? fmtUsd(vaultAmt, 0) : "-", C.teal, `${(vaultPct * 100).toFixed(1)}%`],
                ["Basket (upside)", dep > 0 ? fmtUsd(basketAmt, 0) : "-", C.amber, `${(basketPct * 100).toFixed(1)}%`],
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
              disabled={insufficient || dep <= 0}
              style={{
                width: "100%", padding: "12px 0", borderRadius: 10, border: "none",
                background: confirmed ? C.green : (insufficient || dep <= 0) ? "rgba(255,255,255,0.06)" : C.violet,
                color: (insufficient || dep <= 0) ? C.textMuted : "#fff",
                fontSize: 14, fontWeight: 700, fontFamily: FD,
                cursor: (insufficient || dep <= 0) ? "not-allowed" : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {confirmed ? "✓ PPN opened" : insufficient ? "Insufficient USDC" : "Open PPN"}
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