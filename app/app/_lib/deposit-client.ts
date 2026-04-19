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

async function resolveBundleUuid(uiBundleId: string): Promise<string> {
  const dbName = normalizeName(uiBundleId);
  const map = await loadBundleMap();
  const match = map.get(dbName);
  if (!match) {
    throw new DepositError(
      `Bundle "${dbName}" not found on backend. The backend currently has ${map.size} bundle(s): ${Array.from(map.keys()).join(", ") || "(none)"}`,
      404,
    );
  }
  return match.id;
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
}): Promise<RedeemPrepareResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  return postJson<RedeemPrepareResponse>("/api/deposit/redeem/prepare", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
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
}): Promise<RedeemConfirmResponse> {
  const uuid = await resolveBundleUuid(args.bundleId);
  return postJson<RedeemConfirmResponse>("/api/deposit/redeem/confirm", {
    bundle_id: uuid,
    wallet_address: args.walletAddress,
    signature: args.signature,
    expected_usdc: args.expectedUsdc,
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

  return { signature: sig, prepare: prep, confirm };
}

/**
 * End-to-end redeem: prepare → sign → confirm on-chain → persist.
 * Returns the confirmed signature so the caller can link to Explorer.
 */
export async function redeemFromBundle(args: {
  wallet: WalletSigner;
  bundleId: string;
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
  });

  const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);

  const ok = await wallet.waitForConfirmation(sig, args.confirmationTimeoutMs ?? 60_000);
  if (!ok) throw new DepositError("Timed out waiting for redeem confirmation.", 0);

  const confirm = await confirmRedeem({
    bundleId,
    walletAddress: wallet.publicKey.toBase58(),
    signature: sig,
    expectedUsdc: prep.expected_usdc,
  });

  return { signature: sig, prepare: prep, confirm };
}
