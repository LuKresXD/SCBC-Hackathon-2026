"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Header, PageFrame } from "../_components/Header";
import { BundleCard, Pill } from "../_components/charts";
import { C, FS, FD, tc, tl } from "../_lib/tokens";
import { BUNDLES } from "../_lib/bundles";
import { useSandbox } from "../_lib/demo-state";

type TimeFilter = "week" | "month" | "long";
type SortOption = "change_desc" | "change_asc" | "nav_desc" | "nav_asc" | "days_asc";

export default function BasketsPage() {
  const router = useRouter();
  const { dispatch } = useSandbox();
  const [tier, setTier] = useState<90 | 70 | 50>(90);
  const [time, setTime] = useState<TimeFilter>("week");
  const [sort, setSort] = useState<SortOption>("change_desc");

  const timeMap: Record<TimeFilter, string> = { week: "This week", month: "This month", long: "Long term" };
  const sortMap: Record<SortOption, string> = {
    change_desc: "Top gainers",
    change_asc: "Top losers",
    nav_desc: "Highest prob",
    nav_asc: "Lowest prob",
    days_asc: "Expiring soon",
  };

  const filtered = BUNDLES.filter((b) => b.tier === tier && tl(b.daysLeft) === timeMap[time]).sort((a, b) => {
    if (sort === "change_desc") return b.change - a.change;
    if (sort === "change_asc") return a.change - b.change;
    if (sort === "nav_desc") return b.nav - a.nav;
    if (sort === "nav_asc") return a.nav - b.nav;
    return a.daysLeft - b.daysLeft;
  });

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, color: C.textPrimary, fontFamily: FD, marginBottom: 4, letterSpacing: "-0.01em" }}>Native Baskets</div>
          <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
            Tokenized indexes of uncorrelated prediction markets · one token = pro-rata share of basket payout
          </div>
        </div>
        <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: "18px 20px", marginBottom: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 8 }}>PROBABILITY TIER</div>
              <div style={{ display: "flex", gap: 8 }}>
                {([90, 70, 50] as const).map((t) => (
                  <Pill key={t} active={tier === t} onClick={() => setTier(t)} color={tc(t)}>
                    {t}%
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 8 }}>RESOLUTION WINDOW</div>
              <div style={{ display: "flex", gap: 8 }}>
                {(["week", "month", "long"] as TimeFilter[]).map((t) => (
                  <Pill key={t} active={time === t} onClick={() => setTime(t)}>
                    {timeMap[t]}
                  </Pill>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 8 }}>SORT BY</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {(Object.keys(sortMap) as SortOption[]).map((s) => (
                  <Pill key={s} active={sort === s} onClick={() => setSort(s)}>
                    {sortMap[s]}
                  </Pill>
                ))}
              </div>
            </div>
          </div>
        </div>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", color: C.textMuted, padding: "60px 0", fontSize: 14, fontFamily: FS }}>No baskets match these filters</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: 14 }}>
            {filtered.map((b) => (
              <BundleCard key={b.id} bundle={b} onClick={() => router.push(`/app/basket/${b.id}`)} />
            ))}
          </div>
        )}
      </PageFrame>
    </>
  );
}
