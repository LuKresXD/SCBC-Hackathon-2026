"use client";

import React, { useEffect, useState } from "react";
import { Header, PageFrame } from "../_components/Header";
import { ConnectWalletCard } from "../_components/ConnectWalletCard";
import { MetricTile } from "../_components/charts";
import { C, FS, FD, fmtUsd, BACKEND_URL } from "../_lib/tokens";

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
  const [pool, setPool] = useState<PoolSnap | null>(null);

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

  return (
    <>
      <Header />
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

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          <ConnectWalletCard
            title="Borrow against basket"
            subtitle={`Post STHS tokens as collateral to borrow USDC at ${pool ? pool.borrow_rate_apy.toFixed(2) : "—"}% APY. Connect a Solana wallet to open a loan against your on-chain basket position.`}
            accent={C.coral}
          />
          <ConnectWalletCard
            title="Lend USDC"
            subtitle={`Supply USDC to the pool and earn ${pool ? pool.supply_rate_apy.toFixed(2) : "—"}% APY while utilization is positive. Connect a Solana wallet to supply.`}
            accent={C.teal}
          />
        </div>
      </PageFrame>
    </>
  );
}
