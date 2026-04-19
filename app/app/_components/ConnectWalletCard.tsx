"use client";

import React, { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { C, FS, FD, FM } from "../_lib/tokens";

const ConnectButton = dynamic(
  async () => (await import("./ConnectButton")).ConnectButton,
  { ssr: false },
);

/**
 * Wallet-aware action card used on basket/tranche/ppn/lending detail pages.
 *
 * Disconnected: prompts the user to connect via ConnectButton.
 * Connected: shows truncated pubkey, live SOL balance, a devnet airdrop
 * button for playing around, and a disabled deposit CTA that explains the
 * program the real instruction will hit once the Anchor client is wired up.
 */
export function ConnectWalletCard({
  title,
  subtitle,
  accent,
  programId,
}: {
  title: string;
  subtitle: string;
  accent?: string;
  programId?: string;
}) {
  const c = accent ?? C.tealLight;
  const { publicKey, connected } = useWallet();
  const { connection } = useConnection();
  const [balance, setBalance] = useState<number | null>(null);
  const [airdropping, setAirdropping] = useState(false);
  const [airdropMsg, setAirdropMsg] = useState<string | null>(null);

  const refreshBalance = useCallback(async () => {
    if (!publicKey) return;
    try {
      const lamports = await connection.getBalance(publicKey, "confirmed");
      setBalance(lamports / LAMPORTS_PER_SOL);
    } catch {
      setBalance(null);
    }
  }, [connection, publicKey]);

  useEffect(() => {
    if (!publicKey) { setBalance(null); return; }
    refreshBalance();
    const iv = setInterval(refreshBalance, 10000);
    return () => clearInterval(iv);
  }, [publicKey, refreshBalance]);

  async function handleAirdrop() {
    if (!publicKey) return;
    setAirdropping(true);
    setAirdropMsg(null);
    try {
      const sig = await connection.requestAirdrop(publicKey, 1 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig, "confirmed");
      setAirdropMsg("✓ +1 SOL airdropped");
      refreshBalance();
    } catch (e) {
      setAirdropMsg(`Airdrop failed: ${(e as Error).message.split("\n")[0]}`);
    } finally {
      setAirdropping(false);
      setTimeout(() => setAirdropMsg(null), 4000);
    }
  }

  return (
    <div
      style={{
        background: C.card,
        borderTop: `0.5px solid ${C.border}`,
        borderRight: `0.5px solid ${C.border}`,
        borderBottom: `0.5px solid ${C.border}`,
        borderLeft: `0.5px solid ${C.border}`,
        borderRadius: 14,
        padding: 20,
      }}
    >
      <div
        style={{
          fontSize: 10,
          color: c,
          fontFamily: FM,
          letterSpacing: "0.18em",
          fontWeight: 600,
          marginBottom: 14,
          textAlign: "center",
        }}
      >
        {connected ? "WALLET CONNECTED" : "WALLET REQUIRED"}
      </div>
      <div
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: C.textPrimary,
          fontFamily: FD,
          marginBottom: 8,
          letterSpacing: "-0.005em",
          textAlign: "center",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 12,
          color: C.textSecondary,
          fontFamily: FS,
          lineHeight: 1.55,
          marginBottom: 18,
          textAlign: "center",
        }}
      >
        {subtitle}
      </div>

      {!connected ? (
        <ConnectButton variant="block" />
      ) : (
        <>
          <div
            style={{
              background: C.surface,
              borderRadius: 10,
              padding: "10px 12px",
              marginBottom: 12,
              fontSize: 12,
              fontFamily: FM,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <span style={{ color: C.textSecondary }}>Wallet</span>
              <span style={{ color: C.textPrimary }}>
                {publicKey!.toBase58().slice(0, 4)}…{publicKey!.toBase58().slice(-4)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: C.textSecondary }}>Balance</span>
              <span style={{ color: c }}>
                {balance == null ? "—" : `${balance.toFixed(4)} SOL`}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAirdrop}
            disabled={airdropping}
            style={{
              width: "100%",
              padding: "10px 0",
              borderRadius: 10,
              border: `0.5px solid ${C.border}`,
              background: "transparent",
              color: airdropping ? C.textMuted : C.textSecondary,
              fontSize: 12,
              fontWeight: 500,
              fontFamily: FD,
              cursor: airdropping ? "not-allowed" : "pointer",
              letterSpacing: "0.02em",
              marginBottom: 10,
            }}
          >
            {airdropping ? "Requesting…" : "Request 1 SOL on devnet"}
          </button>
          {airdropMsg && (
            <div
              style={{
                fontSize: 11,
                color: airdropMsg.startsWith("✓") ? C.green : C.red,
                fontFamily: FS,
                textAlign: "center",
                marginBottom: 10,
              }}
            >
              {airdropMsg}
            </div>
          )}

          <button
            type="button"
            disabled
            title="Anchor client deposit flow ships in the next phase"
            style={{
              width: "100%",
              padding: "12px 0",
              borderRadius: 10,
              border: "none",
              background: `linear-gradient(135deg, ${c}33 0%, ${c}55 100%)`,
              color: C.textMuted,
              fontSize: 13,
              fontWeight: 600,
              fontFamily: FD,
              cursor: "not-allowed",
              letterSpacing: "0.04em",
            }}
          >
            Deposit — anchor client coming soon
          </button>

          <div
            style={{
              fontSize: 10,
              color: C.textMuted,
              fontFamily: FS,
              marginTop: 10,
              lineHeight: 1.5,
              textAlign: "center",
            }}
          >
            Target program:{" "}
            <span style={{ color: c, fontFamily: FM }}>
              {programId ?? "traxis_vault / traxis_ppn"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
