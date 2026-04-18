"use client";

import React, { useEffect, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, tc, fmtUsd, BACKEND_URL } from "../_lib/tokens";
import { bundleById } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

type PoolSnap = {
  total_deposits: number;
  total_borrows: number;
  utilization: number;
  borrow_rate_apy: number;
  supply_rate_apy: number;
  ltv_table: { basket: Record<string, number>; tranche: Record<string, number> };
  reserve_factor: number;
};

export default function LendingPage() {
  const { state, dispatch } = useSandbox();
  const [pool, setPool] = useState<PoolSnap | null>(null);

  // Borrow side
  const [collateral, setCollateral] = useState<string>(
    state.basketPositions[0]?.bundleId || "",
  );
  const [borrowAmt, setBorrowAmt] = useState("");
  // Lend side
  const [lendAmt, setLendAmt] = useState("");

  useEffect(() => {
    fetch(`${BACKEND_URL}/api/lending`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setPool)
      .catch(() => setPool({
        total_deposits: 50000,
        total_borrows: 0,
        utilization: 0,
        borrow_rate_apy: 2,
        supply_rate_apy: 0,
        ltv_table: { basket: { "90": 0.85, "70": 0.6, "50": 0.4 }, tranche: { senior: 0.88, mezzanine: 0.6, junior: 0.3 } },
        reserve_factor: 0.1,
      }));
  }, []);

  const basketCollateral = state.basketPositions
    .map((p) => {
      const b = bundleById(p.bundleId);
      return b ? { bundleId: p.bundleId, b, qty: p.qty, value: p.qty * b.nav } : null;
    })
    .filter(Boolean) as Array<{ bundleId: string; b: ReturnType<typeof bundleById>; qty: number; value: number }>;

  const selected = basketCollateral.find((c) => c.bundleId === collateral);
  const ltv = selected && pool ? pool.ltv_table.basket[String(selected.b!.tier)] : 0.85;
  const maxBorrow = selected ? selected.value * ltv : 0;
  const borrowVal = parseFloat(borrowAmt) || 0;
  const borrowValid = selected && borrowVal > 0 && borrowVal <= maxBorrow;

  const lendVal = parseFloat(lendAmt) || 0;
  const lendValid = lendVal > 0 && lendVal <= state.usdc;

  async function handleBorrow() {
    if (!selected || !borrowValid || !pool) return;
    dispatch({
      type: "lending/borrow",
      collateralKind: "basket",
      bundleId: selected.bundleId,
      collateralQty: selected.qty,
      borrowedUsdc: borrowVal,
      rateApy: pool.borrow_rate_apy,
    });
    await fetch(`${BACKEND_URL}/api/lending/borrow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: borrowVal }),
    }).then((r) => r.json()).then(setPool).catch(() => {});
    setBorrowAmt("");
  }

  async function handleLend() {
    if (!lendValid || !pool) return;
    dispatch({ type: "lending/deposit", amount: lendVal, apy: pool.supply_rate_apy });
    await fetch(`${BACKEND_URL}/api/lending/lend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: lendVal }),
    }).then((r) => r.json()).then(setPool).catch(() => {});
    setLendAmt("");
  }

  async function handleRepay(loanId: string, amount: number) {
    dispatch({ type: "lending/repay", loanId, repaidUsdc: amount });
    await fetch(`${BACKEND_URL}/api/lending/repay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount }),
    }).then((r) => r.json()).then(setPool).catch(() => {});
  }

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Lending / Repo</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Post basket or tranche tokens as collateral to borrow USDC · loans self-liquidate at resolution
          </div>
        </div>

        {pool && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
            <MetricTile label="POOL DEPOSITS" value={fmtUsd(pool.total_deposits)} sub="USDC supplied" />
            <MetricTile label="POOL BORROWS" value={fmtUsd(pool.total_borrows)} sub="USDC outstanding" />
            <MetricTile label="UTILIZATION" value={`${(pool.utilization * 100).toFixed(1)}%`} color={C.amber} sub="borrows / deposits" />
            <MetricTile label="BORROW APY" value={`${pool.borrow_rate_apy.toFixed(2)}%`} color={C.coral} sub={`supply ${pool.supply_rate_apy.toFixed(2)}% APY`} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
          {/* Borrow side */}
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 16 }}>Borrow against basket</div>
            {basketCollateral.length === 0 ? (
              <div style={{ color: C.textMuted, fontSize: 13, fontFamily: FS, padding: "16px 0" }}>
                You need basket positions to borrow against. Visit Baskets to deposit first.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 6 }}>COLLATERAL</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {basketCollateral.map((c) => (
                    <div
                      key={c.bundleId}
                      onClick={() => setCollateral(c.bundleId)}
                      style={{
                        padding: "10px 12px",
                        background: collateral === c.bundleId ? C.cardHover : C.surface,
                        border: `0.5px solid ${collateral === c.bundleId ? tc(c.b!.tier) : C.border}`,
                        borderLeft: `3px solid ${tc(c.b!.tier)}`,
                        borderRadius: 8,
                        cursor: "pointer",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>{c.bundleId}</div>
                        <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>{c.qty.toFixed(2)} tokens</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 12, color: C.textPrimary, fontFamily: FD }}>{fmtUsd(c.value, 2)}</div>
                        <div style={{ fontSize: 10, color: C.green, fontFamily: FS }}>max {fmtUsd(c.value * (pool?.ltv_table.basket[String(c.b!.tier)] ?? 0.85), 0)}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <input
                  type="number"
                  placeholder="USDC to borrow"
                  value={borrowAmt}
                  onChange={(e) => setBorrowAmt(e.target.value)}
                  style={{ width: "100%", padding: "12px 14px", fontSize: 14, fontFamily: FD, background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.textPrimary, marginBottom: 12 }}
                />
                <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginBottom: 12 }}>
                  LTV {(ltv * 100).toFixed(0)}% · max {fmtUsd(maxBorrow)}
                </div>
                <button
                  onClick={handleBorrow}
                  disabled={!borrowValid}
                  style={{
                    width: "100%",
                    padding: "12px 0",
                    borderRadius: 10,
                    border: "none",
                    background: !borrowValid ? C.border : C.coral,
                    color: !borrowValid ? C.textMuted : "#fff",
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: FD,
                    cursor: !borrowValid ? "not-allowed" : "pointer",
                  }}
                >
                  Borrow USDC
                </button>
              </>
            )}
          </div>

          {/* Lend side */}
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD, marginBottom: 16 }}>Lend USDC</div>
            <div style={{ fontSize: 12, color: C.textSecondary, fontFamily: FS, marginBottom: 14, lineHeight: 1.5 }}>
              Supply USDC to the pool. You earn interest every second the utilization is above zero.
            </div>
            <input
              type="number"
              placeholder="USDC to lend"
              value={lendAmt}
              onChange={(e) => setLendAmt(e.target.value)}
              style={{ width: "100%", padding: "12px 14px", fontSize: 14, fontFamily: FD, background: C.surface, border: `0.5px solid ${C.border}`, borderRadius: 10, color: C.textPrimary, marginBottom: 12 }}
            />
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginBottom: 12 }}>
              Wallet: ${state.usdc.toLocaleString()}
            </div>
            <button
              onClick={handleLend}
              disabled={!lendValid}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: !lendValid ? C.border : C.teal,
                color: !lendValid ? C.textMuted : "#001814",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FD,
                cursor: !lendValid ? "not-allowed" : "pointer",
              }}
            >
              Supply to pool
            </button>
            {state.lend && (
              <div style={{ marginTop: 14, padding: "10px 12px", background: C.surface, borderRadius: 8, border: `0.5px solid ${C.border}`, fontSize: 12, fontFamily: FS }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: C.textSecondary }}>Your supply</span>
                  <span style={{ color: C.teal }}>{fmtUsd(state.lend.amount, 2)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {state.loans.length > 0 && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 14 }}>OUTSTANDING LOANS</div>
            {state.loans.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `0.5px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: 13, color: C.textPrimary, fontFamily: FD, fontWeight: 500 }}>
                    {l.bundleId} {l.trancheKind && `· ${l.trancheKind}`}
                  </div>
                  <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginTop: 2 }}>
                    {l.rateApy.toFixed(2)}% APY · posted {l.collateralQty.toFixed(2)} tokens
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ fontSize: 13, color: C.coral, fontFamily: FD }}>{fmtUsd(l.borrowedUsdc, 2)}</div>
                  <button
                    onClick={() => handleRepay(l.id, l.borrowedUsdc)}
                    disabled={state.usdc < l.borrowedUsdc}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 8,
                      border: `0.5px solid ${state.usdc < l.borrowedUsdc ? C.border : C.teal}`,
                      background: "transparent",
                      color: state.usdc < l.borrowedUsdc ? C.textMuted : C.teal,
                      fontSize: 12,
                      fontFamily: FS,
                      cursor: state.usdc < l.borrowedUsdc ? "not-allowed" : "pointer",
                    }}
                  >
                    Repay
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageFrame>
    </>
  );
}
