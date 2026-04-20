/**
 * PPN (Principal-Protected Note) client.
 *
 * Mirrors the shape of `deposit-client.ts`: the backend is the source of truth
 * for PDAs / IDLs / account ordering — this module just:
 *   1. POSTs `/api/ppn/onchain/prepare` to get an unsigned tx + a pending
 *      Supabase vault row.
 *   2. Hands the base64 tx to the wallet to sign + submit.
 *   3. Waits for confirmation and POSTs `/api/ppn/onchain/confirm` so the
 *      backend links the signature to the vault row.
 *
 * Redeem is symmetric: `/api/ppn/onchain/redeem/prepare` → wallet → confirm.
 *
 * The normalizeName() trick from `deposit-client` isn't needed here because
 * the PPN endpoints take `bundle_id` as the bundle UUID directly, which the
 * deposit client already resolves via `/api/bundles`. We reuse that cache
 * through `resolveBundleUuidForPpn` to keep UI code symmetric between vault
 * and PPN flows.
 */

import { BACKEND_URL } from "./tokens";

// ---------- Shared helpers (duplicated small footprint rather than ----------
//             cross-importing so this module stays server-safe + tree-shakable)

function normalizeName(name: string): string {
  return name.replace(/^STHS-/, "LK-");
}

type BundleSummary = {
  id: string;
  name: string;
  vault_pda: string | null;
  trax_mint: string | null;
  onchain_tx_signature: string | null;
};

let _bundleMap: Promise<Map<string, BundleSummary>> | null = null;

function loadBundleMap(force = false): Promise<Map<string, BundleSummary>> {
  if (force) _bundleMap = null;
  if (_bundleMap) return _bundleMap;
  _bundleMap = (async () => {
    const res = await fetch(`${BACKEND_URL}/api/bundles`);
    if (!res.ok) {
      _bundleMap = null;
      throw new PpnError(
        `Failed to load /api/bundles (HTTP ${res.status})`,
        res.status,
      );
    }
    const rows = (await res.json()) as BundleSummary[];
    const map = new Map<string, BundleSummary>();
    for (const row of rows) map.set(row.name, row);
    return map;
  })();
  return _bundleMap;
}

/**
 * Parse tier number out of a UI basket id. `STHS-HIGH-*` / `LK-90-*` → 90,
 * `STHS-MID-*` / `LK-70-*` → 70, `STHS-LOW-*` / `LK-50-*` → 50.
 */
function tierFromName(name: string): 90 | 70 | 50 | null {
  const upper = name.toUpperCase();
  if (/\b(HIGH|-90-)/.test(upper)) return 90;
  if (/\b(MID|-70-)/.test(upper)) return 70;
  if (/\b(LOW|-50-)/.test(upper)) return 50;
  return null;
}

function pickFallbackBundle(
  map: Map<string, BundleSummary>,
  uiBundleId: string,
): BundleSummary | null {
  const initialized = Array.from(map.values()).filter((b) => b.vault_pda);
  if (initialized.length === 0) return null;
  const tier = tierFromName(uiBundleId);
  if (tier !== null) {
    const tierMatch = initialized.find((b) => tierFromName(b.name) === tier);
    if (tierMatch) return tierMatch;
  }
  return initialized[0];
}

async function resolveBundleUuidForPpn(uiBundleId: string): Promise<string> {
  // If the caller already passed a UUID, use it directly.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uiBundleId)) {
    return uiBundleId;
  }
  const dbName = normalizeName(uiBundleId);
  const map = await loadBundleMap();
  const exact = map.get(dbName);
  if (exact) return exact.id;

  const fallback = pickFallbackBundle(map, uiBundleId);
  if (fallback) {
    if (typeof window !== "undefined") {
      console.warn(
        `[ppn-client] Basket "${uiBundleId}" not in backend; routing PPN to initialized bundle "${fallback.name}" (${fallback.id}).`,
      );
    }
    return fallback.id;
  }

  throw new PpnError(
    `Bundle "${dbName}" not found. Known bundles: ${Array.from(map.keys()).join(", ") || "(none)"}`,
    404,
  );
}

export class PpnError extends Error {
  status: number;
  payload: unknown;
  constructor(message: string, status: number, payload?: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let payload: unknown = undefined;
  try {
    payload = text ? JSON.parse(text) : undefined;
  } catch {
    payload = text;
  }
  if (!res.ok) {
    const msg =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : null) ?? `HTTP ${res.status}`;
    throw new PpnError(msg, res.status, payload);
  }
  return payload as T;
}

// ---------- Response shapes ----------

export interface PpnPrepareResponse {
  kind: "prepared";
  vault_id: string;
  bundle_id: string;
  wallet_address: string;
  amount_usdc: number;
  estimated_apy: number;
  maturity_date: string;
  maturity_ts: number;
  note_pda: string;
  note_seed_hex: string;
  adapter_pda: string;
  adapter_pool: string;
  trax_mint: string;
  trax_vault: string;
  /** Base64-encoded unsigned Solana transaction. */
  transaction_base64: string;
  recent_blockhash: string;
  last_valid_block_height: number;
}

export interface PpnConfirmResponse {
  vault_id: string;
  bundle_id: string;
  wallet_address: string;
  principal_usdc: number;
  signature: string;
  transaction_id: string | null;
}

export interface PpnRedeemPrepareResponse {
  kind: "prepared";
  vault_id: string;
  bundle_id: string;
  wallet_address: string;
  principal_usdc: number;
  note_pda: string;
  transaction_base64: string;
  recent_blockhash: string;
  last_valid_block_height: number;
}

export interface PpnRedeemConfirmResponse {
  vault_id: string;
  bundle_id: string;
  wallet_address: string;
  principal_returned: number;
  signature: string;
  transaction_id: string | null;
}

// ---------- Two-step primitives ----------

export interface TrancheOverlay {
  /** Tranche kind selects which payoff slice the note represents. */
  kind: "senior" | "mezzanine" | "junior";
  /**
   * Fraction of basket payout where this tranche starts earning, 0–1.
   * Matches ppn_vaults.tranche_attach in Supabase.
   */
  attach: number;
  /**
   * Fraction of basket payout where this tranche tops out, 0–1.
   * Must be strictly greater than `attach`.
   */
  detach: number;
  /** Issue price per $1 face, captured at the moment of purchase. */
  pricePerToken: number;
}

export async function preparePpnDeposit(args: {
  bundleId: string;
  walletAddress: string;
  amountUsdc: number;
  maturityDays?: number;
  /** Optional tranche overlay — passed through to /ppn/onchain/prepare. */
  tranche?: TrancheOverlay;
}): Promise<PpnPrepareResponse> {
  const uuid = await resolveBundleUuidForPpn(args.bundleId);
  const body: Record<string, unknown> = {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    amount_usdc: args.amountUsdc,
    maturity_days: args.maturityDays ?? 30,
  };
  if (args.tranche) {
    body.tranche_kind = args.tranche.kind;
    body.tranche_attach = args.tranche.attach;
    body.tranche_detach = args.tranche.detach;
    body.price_per_token = args.tranche.pricePerToken;
  }
  return postJson<PpnPrepareResponse>("/api/ppn/onchain/prepare", body);
}

export async function confirmPpnDeposit(args: {
  vaultId: string;
  signature: string;
}): Promise<PpnConfirmResponse> {
  return postJson<PpnConfirmResponse>("/api/ppn/onchain/confirm", {
    vault_id: args.vaultId,
    signature: args.signature,
  });
}

export async function preparePpnRedeem(
  args:
    | { vaultId: string }
    | { bundleId: string; walletAddress: string },
): Promise<PpnRedeemPrepareResponse> {
  const body: Record<string, unknown> = {};
  if ("vaultId" in args) {
    body.vault_id = args.vaultId;
  } else {
    body.bundle_id = await resolveBundleUuidForPpn(args.bundleId);
    body.wallet_address = args.walletAddress;
  }
  return postJson<PpnRedeemPrepareResponse>("/api/ppn/onchain/redeem/prepare", body);
}

export async function confirmPpnRedeem(args: {
  vaultId: string;
  signature: string;
}): Promise<PpnRedeemConfirmResponse> {
  return postJson<PpnRedeemConfirmResponse>("/api/ppn/onchain/redeem/confirm", {
    vault_id: args.vaultId,
    signature: args.signature,
  });
}

// ---------- Portfolio passthrough ----------

export interface PpnPortfolioEntry {
  vault_id: string;
  bundle_id: string;
  bundle_name: string;
  bundle_status: string;
  principal_usdc: number;
  yield_deployed_usdc: number;
  accrued_yield: number;
  projected_total_yield: number;
  estimated_apy: number;
  status: "active" | "matured" | "withdrawn";
  days_elapsed: number;
  days_remaining: number;
  maturity_date: string;
  created_at: string;
  total_value: number;
  /** Tranche overlay — null when this note is a plain PPN deposit. */
  tranche_kind?: "senior" | "mezzanine" | "junior" | null;
  tranche_attach?: number | null;
  tranche_detach?: number | null;
}

export interface PpnPortfolio {
  wallet_address: string;
  vaults: PpnPortfolioEntry[];
  summary: {
    total_vaults: number;
    total_principal: number;
    total_accrued_yield: number;
    total_value: number;
    principal_protected: boolean;
  };
}

export async function fetchPpnPortfolio(walletAddress: string): Promise<PpnPortfolio> {
  const res = await fetch(
    `${BACKEND_URL}/api/ppn/portfolio/${encodeURIComponent(walletAddress)}`,
  );
  if (!res.ok) {
    throw new PpnError(`Failed to load PPN portfolio (HTTP ${res.status})`, res.status);
  }
  return (await res.json()) as PpnPortfolio;
}

// ---------- End-to-end wrappers ----------

/**
 * Minimal wallet surface required for the end-to-end helpers. Mirrors
 * `DepositClient#WalletSigner` so the UI can pass the `useWallet()` result
 * to either client without a wrapper.
 */
export interface WalletSigner {
  publicKey: { toBase58(): string } | null;
  signAndSendBase64Tx: (txBase64: string) => Promise<string>;
  waitForConfirmation: (signature: string, timeoutMs?: number) => Promise<boolean>;
}

/**
 * End-to-end PPN deposit: prepare → sign → confirm on-chain → persist.
 */
export async function ppnDeposit(args: {
  wallet: WalletSigner;
  bundleId: string;
  amountUsdc: number;
  maturityDays?: number;
  confirmationTimeoutMs?: number;
  /** Optional tranche overlay — tranche buys flow through this same rail. */
  tranche?: TrancheOverlay;
}): Promise<{
  signature: string;
  prepare: PpnPrepareResponse;
  confirm: PpnConfirmResponse;
}> {
  const { wallet, bundleId, amountUsdc } = args;
  if (!wallet.publicKey) throw new PpnError("No wallet connected.", 0);

  const prep = await preparePpnDeposit({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    amountUsdc,
    maturityDays: args.maturityDays,
    tranche: args.tranche,
  });

  const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);
  const ok = await wallet.waitForConfirmation(sig, args.confirmationTimeoutMs ?? 60_000);
  if (!ok) throw new PpnError("Timed out waiting for PPN deposit confirmation.", 0);

  const confirm = await confirmPpnDeposit({ vaultId: prep.vault_id, signature: sig });
  return { signature: sig, prepare: prep, confirm };
}

/**
 * End-to-end PPN redeem at maturity: prepare → sign → confirm → persist.
 * Accepts either a pre-resolved vault_id, or the (bundleId, walletAddress)
 * pair if the UI only knows the bundle. The backend looks up the active note.
 */
export async function ppnRedeem(args: {
  wallet: WalletSigner;
  /** If known: the exact vault_id to redeem. */
  vaultId?: string;
  /** Otherwise the client will look up the active note for this bundle. */
  bundleId?: string;
  confirmationTimeoutMs?: number;
}): Promise<{
  signature: string;
  prepare: PpnRedeemPrepareResponse;
  confirm: PpnRedeemConfirmResponse;
}> {
  const { wallet } = args;
  if (!wallet.publicKey) throw new PpnError("No wallet connected.", 0);

  const prep = args.vaultId
    ? await preparePpnRedeem({ vaultId: args.vaultId })
    : await preparePpnRedeem({
        bundleId: args.bundleId!,
        walletAddress: wallet.publicKey.toBase58(),
      });

  const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);
  const ok = await wallet.waitForConfirmation(sig, args.confirmationTimeoutMs ?? 60_000);
  if (!ok) throw new PpnError("Timed out waiting for PPN redeem confirmation.", 0);

  const confirm = await confirmPpnRedeem({ vaultId: prep.vault_id, signature: sig });
  return { signature: sig, prepare: prep, confirm };
}
