"use client";
/**
 * Wallet bridge.
 *
 * The app is wrapped in `@solana/wallet-adapter-react`'s `WalletProvider`
 * (see `/app/_providers/WalletProviders.tsx`), but our product clients
 * (`deposit-client.ts`, `ppn-client.ts`) expect a lean `WalletSigner`
 * interface with:
 *   - `publicKey` (with a `.toBase58()` method)
 *   - `signAndSendBase64Tx(base64)` → `signature`
 *   - `waitForConfirmation(sig)` → `boolean`
 *
 * This module converts between the two. It also exposes a `useUsdcBalance`
 * hook that polls the connected wallet's Circle-devnet USDC balance
 * directly from the RPC (no `@solana/spl-token` dependency — we derive the
 * ATA manually).
 *
 * All exports are client-only. Importing this file from a server component
 * is a bug; the underlying adapter hooks throw if called outside a
 * `<WalletProvider>`.
 */

import {
  useWallet as useAdapterWallet,
  useConnection,
} from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WalletSigner as DepositSigner } from "./deposit-client";

// ---------- SPL constants (no @solana/spl-token dep) ----------

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);

/** Circle devnet USDC. Override with NEXT_PUBLIC_USDC_MINT at build time. */
const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT ??
    "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
);

function findAta(mint: PublicKey, owner: PublicKey): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}

// ---------- WalletSigner adapter ----------

export interface WalletSigner extends DepositSigner {
  /** True while the adapter reports an active connection. */
  connected: boolean;
}

/**
 * Convert the adapter-react `useWallet()` result into the `WalletSigner`
 * shape that `deposit-client` / `ppn-client` accept.
 *
 * The returned object is memoised per (publicKey, connection, connected) so
 * callers can safely stuff it into `useEffect` deps.
 */
export function useWalletSigner(): WalletSigner {
  const { publicKey, sendTransaction, connected } = useAdapterWallet();
  const { connection } = useConnection();

  return useMemo<WalletSigner>(() => {
    const pkObj = publicKey ? { toBase58: () => publicKey.toBase58() } : null;

    return {
      connected,
      publicKey: pkObj,
      async signAndSendBase64Tx(txBase64: string): Promise<string> {
        if (!publicKey) throw new Error("No wallet connected.");
        const bytes = Uint8Array.from(atob(txBase64), (c) => c.charCodeAt(0));
        let tx: Transaction | VersionedTransaction;
        try {
          tx = VersionedTransaction.deserialize(bytes);
        } catch {
          tx = Transaction.from(bytes);
        }
        // adapter's sendTransaction signs AND submits and returns the sig.
        const sig = await sendTransaction(tx, connection);
        return sig;
      },
      async waitForConfirmation(
        signature: string,
        timeoutMs: number = 60_000,
      ): Promise<boolean> {
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          const s = await connection.getSignatureStatus(signature, {
            searchTransactionHistory: true,
          });
          const val = s.value;
          if (val) {
            if (val.err) {
              throw new Error(
                `Transaction failed: ${JSON.stringify(val.err)}`,
              );
            }
            const c = val.confirmationStatus;
            if (c === "confirmed" || c === "finalized") return true;
          }
          await new Promise((r) => setTimeout(r, 1500));
        }
        return false;
      },
    };
  }, [publicKey, sendTransaction, connection, connected]);
}

// ---------- Balance hook ----------

export interface UsdcBalance {
  /** UI units (number). `0` when disconnected or ATA absent. */
  uiAmount: number;
  /** True while the current poll is in flight. */
  loading: boolean;
  /** Last error message (if any) from a poll. */
  error: string | null;
  /** Force a re-fetch immediately. Call this after a tx confirms. */
  refresh: () => Promise<void>;
}

const BALANCE_POLL_MS = 12_000;

/**
 * Live on-chain USDC balance for the currently connected adapter wallet.
 *
 * Semantics:
 *   - While disconnected: `uiAmount: 0`, polling disabled.
 *   - Connected but ATA doesn't exist (user has never received USDC):
 *     `uiAmount: 0` without logging an error.
 *   - Otherwise: polls every {@link BALANCE_POLL_MS} ms.
 */
export function useUsdcBalance(): UsdcBalance {
  const { publicKey, connected } = useAdapterWallet();
  const { connection } = useConnection();
  const [uiAmount, setUiAmount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track the most recent publicKey / connection pair so a slow in-flight
  // poll can't stomp fresher state when the user switches wallets mid-poll.
  const genRef = useRef(0);

  const refresh = useCallback(async () => {
    const gen = ++genRef.current;
    if (!publicKey) {
      setUiAmount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ata = findAta(USDC_MINT, publicKey);
      const bal = await connection.getTokenAccountBalance(ata, "confirmed");
      if (gen !== genRef.current) return;
      setUiAmount(bal.value.uiAmount ?? 0);
    } catch (err: unknown) {
      if (gen !== genRef.current) return;
      // ATA not existing is the common "never received USDC" case — treat
      // as 0 rather than surfacing an error that will rattle the UI.
      const msg = err instanceof Error ? err.message : String(err);
      if (
        /could not find account/i.test(msg) ||
        /Account not found/i.test(msg) ||
        /Invalid param: could not find account/i.test(msg)
      ) {
        setUiAmount(0);
      } else {
        setError(msg);
      }
    } finally {
      if (gen === genRef.current) setLoading(false);
    }
  }, [publicKey, connection]);

  useEffect(() => {
    if (!connected || !publicKey) {
      setUiAmount(0);
      return;
    }
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, BALANCE_POLL_MS);
    return () => clearInterval(id);
  }, [connected, publicKey, refresh]);

  return { uiAmount, loading, error, refresh };
}

// ---------- Explorer links ----------

const SOLANA_CLUSTER =
  process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet";

export function explorerTxUrl(signature: string): string {
  const cluster =
    SOLANA_CLUSTER === "mainnet-beta" ? "" : `?cluster=${SOLANA_CLUSTER}`;
  return `https://explorer.solana.com/tx/${signature}${cluster}`;
}
