"use client";
/**
 * Portfolio client — reads on-chain token balances for every initialized
 * bundle so the UI can display "you hold N STHS tokens of bundle X" straight
 * from the chain rather than from sandbox state.
 *
 * The list of bundles (and their mint addresses) still comes from the backend
 * `/api/bundles` endpoint — that's where the UUID → trax_mint mapping lives
 * and it's authoritative. But the balances themselves are fetched directly
 * from the Solana RPC using the user's wallet.
 */

import { useEffect, useMemo, useState } from "react";
import { PublicKey } from "@solana/web3.js";
import { BACKEND_URL } from "./tokens";
import { useWallet } from "@solana/wallet-adapter-react";
import { fetchTokenBalance } from "./wallet";

// ---------- Bundle list (with on-chain addresses) ----------

export interface BundleOnchainRow {
  id: string;
  name: string;
  risk_tier: 90 | 70 | 50;
  status: "active" | "resolved" | "cancelled";
  issue_price: number;
  nav: number;
  num_legs: number;
  resolved_legs: number;
  vault_pda: string | null;
  trax_mint: string | null;
  onchain_tx_signature: string | null;
}

let _bundleList: Promise<BundleOnchainRow[]> | null = null;

/**
 * Fetch /api/bundles (cached for the session). Pass `force=true` to
 * invalidate, e.g. after an admin init-onchain call runs.
 */
export function listBundlesOnchain(
  force: boolean = false,
): Promise<BundleOnchainRow[]> {
  if (force) _bundleList = null;
  if (_bundleList) return _bundleList;
  _bundleList = (async () => {
    const res = await fetch(`${BACKEND_URL}/api/bundles`);
    if (!res.ok) {
      _bundleList = null;
      throw new Error(`Failed to load /api/bundles (HTTP ${res.status})`);
    }
    return (await res.json()) as BundleOnchainRow[];
  })();
  return _bundleList;
}

// ---------- STHS balance hook ----------

export interface StshBalanceEntry {
  bundleId: string;
  /** UI bundle name, e.g. "LK-90-0430". */
  bundleName: string;
  /** STHS mint address, or null if this bundle has not been initialized on-chain yet. */
  traxMint: string | null;
  /** UI units of STHS held by the user. Always 0 if traxMint is null. */
  uiAmount: number;
  /** Raw base units (6-decimals). */
  amountRaw: bigint;
  /** Notional value at the bundle's current NAV. */
  valueAtNavUsd: number;
  nav: number;
  status: BundleOnchainRow["status"];
}

const BALANCE_POLL_MS = 15_000;

/**
 * Live on-chain STHS balances for the connected wallet, across every bundle
 * the backend knows about.
 *
 * - Returns `null` entries when the wallet is disconnected.
 * - Bundles without an initialized `trax_mint` are included with `uiAmount: 0`
 *   so the UI can still render them; they just won't have any holdings.
 * - Polls every 15 seconds. Call `refresh()` to force an immediate re-fetch
 *   (e.g. right after a deposit or redeem confirms).
 */
export function useStshBalances(): {
  loading: boolean;
  error: string | null;
  balances: StshBalanceEntry[];
  /** Convenience: total USD value across all bundles (at current NAV). */
  totalValueUsd: number;
  refresh: () => Promise<void>;
} {
  const { publicKey, connected } = useWallet();
  const [bundles, setBundles] = useState<BundleOnchainRow[] | null>(null);
  const [balances, setBalances] = useState<StshBalanceEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  // Load the bundle list once (cached).
  useEffect(() => {
    let cancelled = false;
    listBundlesOnchain()
      .then((rows) => {
        if (!cancelled) setBundles(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const owner = publicKey;

  // Re-fetch every bundle's balance whenever owner / bundles / refreshToken change.
  useEffect(() => {
    if (!bundles) return;
    if (!connected || !owner) {
      // Not connected → show zero rows.
      setBalances(
        bundles.map((b) => ({
          bundleId: b.id,
          bundleName: b.name,
          traxMint: b.trax_mint,
          uiAmount: 0,
          amountRaw: 0n,
          valueAtNavUsd: 0,
          nav: b.nav,
          status: b.status,
        })),
      );
      return;
    }

    let cancelled = false;
    const fetchAll = async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          bundles.map(async (b) => {
            if (!b.trax_mint) {
              return {
                bundleId: b.id,
                bundleName: b.name,
                traxMint: null,
                uiAmount: 0,
                amountRaw: 0n,
                valueAtNavUsd: 0,
                nav: b.nav,
                status: b.status,
              } satisfies StshBalanceEntry;
            }
            const bal = await fetchTokenBalance(new PublicKey(b.trax_mint), owner);
            return {
              bundleId: b.id,
              bundleName: b.name,
              traxMint: b.trax_mint,
              uiAmount: bal.uiAmount,
              amountRaw: bal.amountRaw,
              valueAtNavUsd: bal.uiAmount * b.nav,
              nav: b.nav,
              status: b.status,
            } satisfies StshBalanceEntry;
          }),
        );
        if (!cancelled) setBalances(results);
      } catch (err: unknown) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void fetchAll();
    const id = setInterval(() => void fetchAll(), BALANCE_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bundles, owner, connected, refreshToken]);

  const refresh = useMemo(
    () =>
      async (): Promise<void> => {
        // Invalidate the module-level cache and bump the local token so the
        // inner effect re-runs.
        await listBundlesOnchain(true).then((rows) => setBundles(rows));
        setRefreshToken((n) => n + 1);
      },
    [],
  );

  const totalValueUsd = balances.reduce((s, b) => s + b.valueAtNavUsd, 0);

  return { loading, error, balances, totalValueUsd, refresh };
}

// ---------- Transaction history passthrough ----------

export interface TransactionRow {
  id: string;
  bundle_id: string;
  bundle_name?: string;
  wallet_address: string;
  type: "deposit" | "redemption" | "transfer";
  amount_usdc: number;
  tokens: number;
  fee_usdc: number;
  tx_signature?: string;
  onchain_tx_signature?: string;
  created_at: string;
}

/**
 * Fetch the server-side transaction history for a wallet. The backend reads
 * from Supabase; every row with `onchain_tx_signature` is a real on-chain
 * tx (the deposit flow always writes this for post-4df9b40 deposits).
 */
export async function fetchTransactionHistory(
  walletAddress: string,
): Promise<TransactionRow[]> {
  const res = await fetch(
    `${BACKEND_URL}/api/deposit/transactions/${encodeURIComponent(walletAddress)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch transaction history (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { transactions?: TransactionRow[] } | TransactionRow[];
  return Array.isArray(data) ? data : (data.transactions ?? []);
}

// ---------- Basket portfolio (backend hydrate) ----------

/** Shape expected by demo-state's `basket/hydrate` action. */
export interface BasketPositionHydrate {
  bundleId: string;
  qty: number;
  avgCost: number;
  tier?: 90 | 70 | 50;
  navHint?: number;
  displayName?: string;
  maturityAt?: number;
  status?: string;
}

interface BackendPositionRow {
  position_id: string;
  bundle_id: string;
  bundle_name: string;
  bundle_status: string;
  risk_tier: number;
  resolution_date: string | null;
  tokens_held: number;
  entry_price: number;
  deposited_usdc: number;
  current_nav: number;
  current_value: number;
  unrealized_pnl: number;
  pnl_percent: number;
  created_at: string;
}

function normalizeTier(raw: number): 90 | 70 | 50 | undefined {
  if (raw === 90 || raw === 70 || raw === 50) return raw;
  return undefined;
}

/**
 * Fetch the wallet's basket positions from the backend
 * (`/api/deposit/portfolio/:wallet`) and map each row into the `BasketPosition`
 * shape the demo-state reducer expects. The portfolio page dispatches the
 * result as `{ type: "basket/hydrate", positions }` so the in-memory state
 * reflects the latest Supabase truth whenever the wallet reconnects.
 *
 * - `qty` is tokens_held (STHS) — not USDC.
 * - `avgCost` is entry_price (USDC per token) — the deposit-time NAV.
 * - `navHint` is the backend's current NAV for display; real pricing still
 *   comes from the live feed when the portfolio row is rendered.
 */
export async function fetchBasketPortfolio(
  walletAddress: string,
): Promise<BasketPositionHydrate[]> {
  const res = await fetch(
    `${BACKEND_URL}/api/deposit/portfolio/${encodeURIComponent(walletAddress)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch basket portfolio (HTTP ${res.status})`);
  }
  const data = (await res.json()) as { positions?: BackendPositionRow[] };
  const rows = data.positions ?? [];
  return rows
    // Ignore fully-redeemed rows — they'd render as phantom 0-token cards.
    .filter((p) => p.tokens_held > 1e-9)
    .map<BasketPositionHydrate>((p) => ({
      bundleId: p.bundle_id,
      qty: p.tokens_held,
      avgCost: p.entry_price,
      tier: normalizeTier(p.risk_tier),
      navHint: p.current_nav,
      displayName: p.bundle_name,
      maturityAt: p.resolution_date ? Date.parse(p.resolution_date) : undefined,
      status: p.bundle_status,
    }));
}
