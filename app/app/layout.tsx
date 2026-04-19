import React from "react";
import { SandboxProvider } from "./_lib/demo-state";
import { WalletProvider } from "./_lib/wallet";

/**
 * Authenticated-app shell layout.
 *
 * Wraps every page under /app in:
 *   - SandboxProvider — in-memory demo state (cash, positions, etc.)
 *   - WalletProvider  — Solana wallet integration for Phantom, Solflare, and
 *                       Backpack (devnet, real signatures, non-custodial)
 *
 * The root <html>/<body> stays at `../layout.tsx`; this one only renders
 * children and sets up the two providers.
 */
export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <WalletProvider>
      <SandboxProvider>{children}</SandboxProvider>
    </WalletProvider>
  );
}
