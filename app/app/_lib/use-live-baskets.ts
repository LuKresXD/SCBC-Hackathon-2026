"use client";

import { useEffect, useState } from "react";
import {
  buildLiveBaskets,
  fetchLiveMarkets,
  isLiveBasket,
  type LiveBasket,
} from "./live-baskets";

export type LiveBasketState =
  | { status: "loading" }
  | { status: "ok"; baskets: LiveBasket[]; at: number }
  | { status: "error"; error: string };

/**
 * Module-level live-basket cache.
 *
 * A 20k-market pull is not cheap (Gamma paginates 500/page, so ~40 round
 * trips). Before this cache every page that mounted — /app/basket, the
 * detail view, /app/tranche, /app/ppn — kicked off its own independent
 * fetch + `buildLiveBaskets` pass, tripling the network + CPU cost per
 * tab.
 *
 * Now the whole `useLiveBaskets` population lives behind a single shared
 * state machine:
 *   • At most one network fetch is in flight at any time (subsequent
 *     `ensureLoad()` calls return the in-flight promise).
 *   • Results live for `CACHE_TTL_MS` before a new fetch is kicked off.
 *   • Every React subscriber gets the same published state via a small
 *     pub/sub loop.
 */
const CACHE_TTL_MS = 60_000;

type Listener = (s: LiveBasketState) => void;

let cacheState: LiveBasketState = { status: "loading" };
let lastOkAt = 0;
let inflight: Promise<void> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<Listener>();

function publish(next: LiveBasketState): void {
  cacheState = next;
  for (const l of listeners) l(next);
}

async function runFetch(): Promise<void> {
  try {
    const markets = await fetchLiveMarkets();
    const slots = buildLiveBaskets(markets);
    const baskets = slots.filter(isLiveBasket);
    lastOkAt = Date.now();
    publish({ status: "ok", baskets, at: lastOkAt });
  } catch (err) {
    // Keep the last successful state visible if we already have one;
    // only publish an error when there's nothing to show.
    if (cacheState.status !== "ok") {
      publish({
        status: "error",
        error: err instanceof Error ? err.message : "Failed to load live markets",
      });
    }
  }
}

function ensureLoad(): Promise<void> {
  if (inflight) return inflight;
  const fresh = cacheState.status === "ok" && Date.now() - lastOkAt < CACHE_TTL_MS;
  if (fresh) return Promise.resolve();
  inflight = runFetch().finally(() => {
    inflight = null;
  });
  return inflight;
}

function ensurePollTimer(): void {
  if (pollTimer) return;
  pollTimer = setInterval(() => {
    // Don't overlap fetches — ensureLoad will dedupe.
    void ensureLoad();
  }, CACHE_TTL_MS);
}

/**
 * Subscribe to the shared cache. Every component that calls this gets the
 * same result without triggering a new fetch; the first caller on a fresh
 * cache kicks off the network request.
 */
export function useLiveBaskets(): LiveBasketState {
  const [state, setState] = useState<LiveBasketState>(cacheState);

  useEffect(() => {
    listeners.add(setState);
    setState(cacheState);
    ensurePollTimer();
    void ensureLoad();
    return () => {
      listeners.delete(setState);
    };
  }, []);

  return state;
}

/**
 * Resolution-window filter used by the tranches + PPN basket pickers.
 * Mirrors the canonical windows from live-baskets.ts: week ≤ 7d,
 * month 8-30d, 6-months 31-180d, long > 180d.
 */
export type PickerWindow = "all" | "week" | "month" | "6months" | "long";

export function matchesPickerWindow(daysLeft: number, win: PickerWindow): boolean {
  if (win === "all") return true;
  if (win === "week") return daysLeft <= 7;
  if (win === "month") return daysLeft > 7 && daysLeft <= 30;
  if (win === "6months") return daysLeft > 30 && daysLeft <= 180;
  return daysLeft > 180;
}

/** Clean display for wild tranche APYs — capped so UI stays readable. */
export function formatYieldPct(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  if (pct >= 999) return "999%+";
  if (pct <= -999) return "-999%";
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}
