"use client";

import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { LedgerWalletAdapter } from "@solana/wallet-adapter-wallets";
import { clusterApiUrl } from "@solana/web3.js";

// Wallet adapter base styles + our override theme.
import "@solana/wallet-adapter-react-ui/styles.css";
import "./wallet-theme.css";

/**
 * Root wallet / RPC provider.
 *
 * Devnet by default; override with NEXT_PUBLIC_SOLANA_RPC_URL if you need a
 * different endpoint (e.g. a Helius mainnet-beta URL).
 */
export function WalletProviders({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_SOLANA_RPC_URL
    ?? clusterApiUrl(WalletAdapterNetwork.Devnet);

  // Modern Solana wallets (Phantom, Solflare, Backpack, Glow, Magic Eden,
  // Exodus, Trust, Coinbase, Nightly, etc.) all announce themselves via
  // the Solana Wallet Standard. WalletProvider picks those up automatically
  // and their readyState is correctly set to `Installed` if the browser
  // extension is present. Explicit adapters for those wallets would
  // double-list them and stay stuck at `NotDetected`, which is the bug
  // we were seeing in the modal.
  //
  // We only register adapters that do NOT speak Wallet Standard:
  //   - Ledger (hardware wallet, loadable on-demand)
  const wallets = useMemo(() => [new LedgerWalletAdapter()], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
