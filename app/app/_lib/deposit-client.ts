/**
 * Non-custodial deposit client.
 *
 * Calls the backend's `/api/deposit/prepare` endpoint to get an unsigned
 * transaction, hands it to Phantom to sign + submit, waits for the RPC to
 * confirm the signature, and finally calls `/api/deposit/confirm` so the
 * backend can persist the position + transaction rows.
 *
 * The backend builds the full Solana transaction (USDC transfer to vault
 * USDC-PDA + invoke of the traxis_vault::deposit instruction) so the
 * frontend doesn't need to know anything about PDA derivation or the
 * Anchor IDL. It's literally: prepare → sign → send → confirm.
 */

import { BACKEND_URL } from "./tokens";

/**
 * The UI keys bundles by human name (`STHS-*` or `LK-*`), but the backend's
 * deposit routes validate `bundle_id` as a UUID. We fetch `/api/bundles`
 * once, build a name → UUID map, and cache it for the session.
 *
 * We also normalize the post-rebrand `STHS-*` names to the DB's pre-rebrand
 * `LK-*` names — the drift Luka called out in commit `aaafc79`'s caveats
 * block. Once the DB is migrated this normalization becomes a no-op.
 *
 * For the hackathon: the Constellations grid shows 9 synthetic STHS-* baskets
 * built client-side from live Polymarket data, but only 2 LK-* bundles are
 * actually initialized on-chain. When a user clicks Buy on a synthetic basket
 * with no matching LK-* row, we transparently route to the closest-tier
 * initialized bundle so a real on-chain deposit still happens. The card
 * keeps its own identity in the UI — only the underlying vault target is
 * remapped for the purpose of executing the transaction.
 */

function normalizeName(name: string): string {
  return name.replace(/^STHS-/, "LK-");
}

type BundleSummary = {
  id: string;
  name: string;
  vault_pda: string | null;
  onchain_tx_signature: string | null;
};

let _bundleMap: Promise<Map<string, BundleSummary>> | null = null;

function loadBundleMap(force: boolean = false): Promise<Map<string, BundleSummary>> {
  if (force) _bundleMap = null;
  if (_bundleMap) return _bundleMap;
  _bundleMap = (async () => {
    const res = await fetch(`${BACKEND_URL}/api/bundles`);
    if (!res.ok) {
      _bundleMap = null;
      throw new DepositError(`Failed to load /api/bundles (HTTP ${res.status})`, res.status);
    }
    const rows = (await res.json()) as BundleSummary[];
    const map = new Map<string, BundleSummary>();
    for (const row of rows) {
      map.set(row.name, row);
    }
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

/**
 * Fallback: pick the best initialized bundle to route a synthetic-basket
 * deposit to. Prefers a bundle whose tier matches the click; otherwise
 * falls back to any initialized bundle (vault_pda != null).
 */
function pickFallbackBundle(
  map: Map<string, BundleSummary>,
  uiBundleId: string,
): BundleSummary | null {
  const initialized = Array.from(map.values()).filter((b) => b.vault_pda);
  if (initialized.length === 0) return null;
  const tier = tierFromName(uiBundleId);
  if (tier !== null) {
    const tierMatch = initialized.find((b) => {
      const t = tierFromName(b.name);
      return t === tier;
    });
    if (tierMatch) return tierMatch;
  }
  // No tier match — return the first initialized bundle as a last resort
  // so Buy still executes a real on-chain tx.
  return initialized[0];
}

async function resolveBundleUuid(uiBundleId: string): Promise<string> {
  // Direct UUID passthrough (live baskets would do this once they carry one).
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uiBundleId)) {
    return uiBundleId;
  }
  const dbName = normalizeName(uiBundleId);
  const map = await loadBundleMap();
  const exact = map.get(dbName);
  if (exact) return exact.id;

  const fallback = pickFallbackBundle(map, uiBundleId);
  if (fallback) {
    // Only log in browser, not during SSR.
    if (typeof window !== "undefined") {
      console.warn(
        `[deposit-client] Basket "${uiBundleId}" not in backend; routing deposit to initialized bundle "${fallback.name}" (${fallback.id}).`,
      );
    }
    return fallback.id;
  }

  throw new DepositError(
    `Bundle "${dbName}" not found on backend and no initialized fallback is available. The backend currently has ${map.size} bundle(s): ${Array.from(map.keys()).join(", ") || "(none)"}`,
    404,
  );
}

export interface DepositPrepareResponse {
  kind: "prepared";
  bundle_id: string;
  wallet_address: string;
  amount_usdc: number;
  fee_usdc: number;
  net_usdc: number;
  issue_price: number;
  /** STHS tokens the user will receive (UI units). */
  tokens_minted: number;
  expected_tokens: number;
  /** Base64-encoded serialized Solana transaction, unsigned. */
  transaction_base64: string;
  vault_pda: string;
  trax_mint: string;
  recent_blockhash: string;
  last_valid_block_height: number;
}

export interface DepositConfirmResponse {
  transaction_id: string;
  bundle_id: string;
  tokens_minted: number;
  issue_price: number;
  fee_usdc: number;
  net_usdc: number;
}

export interface RedeemPrepareResponse {
  kind: "prepared";
  bundle_id: string;
  wallet_address: string;
  /** Total STHS tokens (UI units) that will be burned and paid out. */
  total_tokens: number;
  /** USDC the user will receive (UI units). */
  expected_usdc: number;
  /** Base64-encoded serialized Solana transaction, unsigned. */
  transaction_base64: string;
  vault_pda: string;
  trax_mint: string;
  recent_blockhash: string;
  last_valid_block_height: number;
}

export interface RedeemConfirmResponse {
  wallet_address: string;
  bundle_id: string;
  total_tokens: number;
  payout_usdc: number;
  transaction_id?: string;
}

export class DepositError extends Error {
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
    throw new DepositError(msg, res.status, payload);
  }
  return payload as T;
}

/**
 * Ask the backend to build the deposit transaction. Does NOT write anything
 * to the DB yet — that happens in {@link confirmDeposit} after the chain
 * confirms the signature.
 */
export async function prepareDeposit(args: {
  bundleId: string;
  walletAddress: string;
  amountUsdc: number;
}): Promise<DepositPrepareResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  // Persist the synthetic-id -> UUID mapping so the portfolio page can
  // render positions under the friendly name the user actually clicked
  // rather than the backend's internal bundle name.
  if (uuid !== args.bundleId) {
    try {
      const { cacheBundleDisplayName } = await import("./portfolio-client");
      cacheBundleDisplayName(args.walletAddress, uuid, args.bundleId);
    } catch {
      // Non-fatal: cache failures shouldn't block deposits.
    }
  }
  return postJson<DepositPrepareResponse>("/api/deposit/prepare", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    amount_usdc: args.amountUsdc,
  });
}

/**
 * Persist the deposit to the backend once we have a confirmed signature.
 * The backend re-verifies the signature against the chain before writing.
 */
export async function confirmDeposit(args: {
  bundleId: string;
  walletAddress: string;
  amountUsdc: number;
  signature: string;
  tokensMinted: number;
  issuePrice: number;
  feeUsdc: number;
}): Promise<DepositConfirmResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  return postJson<DepositConfirmResponse>("/api/deposit/confirm", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    amount_usdc: args.amountUsdc,
    signature: args.signature,
    tokens_minted: args.tokensMinted,
    issue_price: args.issuePrice,
    fee_usdc: args.feeUsdc,
  });
}

// ---------------------------------------------------------------------------
// Redeem (sell) flow
// ---------------------------------------------------------------------------
//
// Redeem only works once the vault is finalized — i.e. all legs have resolved
// and the authority has called `finalize_vault`. Until then the backend
// returns 400 with a human-readable reason.
//
// The redeem endpoint does NOT take an amount — it always redeems the full
// position for the given wallet + bundle. If partial redemption becomes a
// requirement later we'll need a new on-chain instruction (the current
// Anchor `redeem` takes an `amount_tokens`, so the backend just needs
// extending — but right now the route always passes the full balance).
//
// Typical UI flow:
//
//     const prep = await prepareRedeem({bundleId, walletAddress});
//     const sig  = await wallet.signAndSendBase64Tx(prep.transaction_base64);
//     await wallet.waitForConfirmation(sig);
//     await confirmRedeem({bundleId, walletAddress, signature: sig, expectedUsdc: prep.expected_usdc});
//
// Or just call {@link redeemFromBundle} which does all four steps for you.

/**
 * Ask the backend to build the redeem transaction. Requires the vault to
 * already be finalized on-chain (all legs resolved + `finalize_vault` called).
 */
export async function prepareRedeem(args: {
  bundleId: string;
  walletAddress: string;
  amountTokens?: number;
}): Promise<RedeemPrepareResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  return postJson<RedeemPrepareResponse>("/api/deposit/redeem/prepare", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    ...(args.amountTokens != null ? { amount_tokens: args.amountTokens } : {}),
  });
}

/**
 * Persist the redeem once we have a confirmed signature. The backend sets
 * the user's positions to 0 tokens and inserts a redemption transaction row.
 */
export async function confirmRedeem(args: {
  bundleId: string;
  walletAddress: string;
  signature: string;
  expectedUsdc: number;
  tokensRedeemed?: number;
}): Promise<RedeemConfirmResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  return postJson<RedeemConfirmResponse>("/api/deposit/redeem/confirm", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    signature: args.signature,
    expected_usdc: args.expectedUsdc,
    ...(args.tokensRedeemed != null ? { tokens_redeemed: args.tokensRedeemed } : {}),
  });
}

/**
 * Signature of the minimal wallet API we need for the end-to-end helpers.
 * Accepts the object returned by `useWallet()` — no direct dependency on
 * `wallet.tsx` so this file stays server-safe.
 */
export interface WalletSigner {
  publicKey: { toBase58(): string } | null;
  signAndSendBase64Tx: (txBase64: string) => Promise<string>;
  waitForConfirmation: (signature: string, timeoutMs?: number) => Promise<boolean>;
}

/**
 * End-to-end deposit: prepare → sign → confirm on-chain → persist.
 * Returns the confirmed signature so the caller can link to Explorer.
 */
export async function depositIntoBundle(args: {
  wallet: WalletSigner;
  bundleId: string;
  amountUsdc: number;
  /** Live NAV at deposit time — recorded as the virtual position's cost basis. */
  navAtDeposit?: number;
  confirmationTimeoutMs?: number;
}): Promise<{
  signature: string;
  prepare: DepositPrepareResponse;
  confirm: DepositConfirmResponse;
}> {
  const { wallet, bundleId, amountUsdc } = args;
  if (!wallet.publicKey) throw new DepositError("No wallet connected.", 0);

  const prep = await prepareDeposit({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    amountUsdc,
  });

  const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);

  const ok = await wallet.waitForConfirmation(sig, args.confirmationTimeoutMs ?? 60_000);
  if (!ok) throw new DepositError("Timed out waiting for deposit confirmation.", 0);

  const confirm = await confirmDeposit({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    amountUsdc,
    signature: sig,
    tokensMinted: prep.tokens_minted,
    issuePrice: prep.issue_price,
    feeUsdc: prep.fee_usdc,
  });

  // Record a virtual position with the UI-level bundle id the user clicked
  // and the NAV observed at deposit time. The portfolio groups by UI bundle
  // id so multiple windows of the same tier stay separate in the UI even
  // though they share one on-chain vault; using navAtDeposit as the cost
  // basis keeps PnL flat at zero on the instant of deposit.
  try {
    const { recordVirtualPosition } = await import("./virtual-positions");
    recordVirtualPosition({
      wallet: wallet.publicKey.toBase58(),
      uuid: prep.bundle_id,
      uiBundleId: bundleId,
      tokens: prep.tokens_minted,
      depositedUsdc: amountUsdc,
      navAtDeposit: args.navAtDeposit ?? prep.issue_price,
      signature: sig,
      createdAt: Date.now(),
    });
  } catch {
    // Non-fatal: the virtual ledger is a UX nicety, not a source of truth.
  }

  return { signature: sig, prepare: prep, confirm };
}

/**
 * End-to-end redeem: prepare → sign → confirm on-chain → persist.
 * Returns the confirmed signature so the caller can link to Explorer.
 */
export async function redeemFromBundle(args: {
  wallet: WalletSigner;
  bundleId: string;
  amountTokens?: number;
  confirmationTimeoutMs?: number;
}): Promise<{
  signature: string;
  prepare: RedeemPrepareResponse;
  confirm: RedeemConfirmResponse;
}> {
  const { wallet, bundleId } = args;
  if (!wallet.publicKey) throw new DepositError("No wallet connected.", 0);

  const prep = await prepareRedeem({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    amountTokens: args.amountTokens,
  });

  const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);

  const ok = await wallet.waitForConfirmation(sig, args.confirmationTimeoutMs ?? 60_000);
  if (!ok) throw new DepositError("Timed out waiting for redeem confirmation.", 0);

  const confirm = await confirmRedeem({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    signature: sig,
    expectedUsdc: prep.expected_usdc,
    tokensRedeemed: args.amountTokens,
  });

  return { signature: sig, prepare: prep, confirm };
}
