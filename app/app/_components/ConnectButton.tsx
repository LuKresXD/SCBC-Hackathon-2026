"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import type { Wallet } from "@solana/wallet-adapter-react";
import { C, FM, FD, FS } from "../_lib/tokens";

/**
 * Drop-in replacement for WalletMultiButton.
 *
 * Difference from the default:
 *   - Non-installed wallets go in a separate "Install" section that does not
 *     hijack the click into a URL redirect. Installed wallets always connect.
 *   - `select()` is followed by an explicit `connect()` call so detection
 *     races at mount time don't leave the user stuck.
 *
 * Variants:
 *   - `variant="header"`  compact button for top nav
 *   - `variant="block"`   full-width button for inline cards
 */
export function ConnectButton({
  variant = "header",
}: {
  variant?: "header" | "block";
}) {
  const {
    wallets,
    publicKey,
    connected,
    connecting,
    disconnecting,
    disconnect,
    select,
    connect,
    wallet: activeWallet,
  } = useWallet();

  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the post-connect menu if the user clicks outside.
  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const isReady = (w: Wallet | null | undefined) =>
    !!w &&
    (w.readyState === WalletReadyState.Installed ||
      w.readyState === WalletReadyState.Loadable);

  // Treat these as non-fatal — they're all expected handshake states that
  // either auto-resolve on the next render or are user-driven (rejection).
  const SILENT_ERROR_RE = /NotSelected|NotReady|Already|rejected|User rejected|Unsupported/i;

  // Once the user picks a wallet (via `select`), autoConnect inside
  // WalletProvider should kick in, but we also call `connect()` explicitly
  // in case the wallet was only just registered (detection race at mount).
  const handlePick = useCallback(
    async (w: Wallet) => {
      setError(null);
      // Only kick off a real connect for wallets that are in a ready state.
      if (!isReady(w)) {
        if (w.adapter.url) {
          window.open(w.adapter.url, "_blank", "noopener,noreferrer");
        } else {
          setError(`${w.adapter.name} is not installed.`);
        }
        return;
      }
      try {
        select(w.adapter.name);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      setOpen(false);
      // Give React a tick to propagate the selected wallet before we
      // attempt the handshake. The useEffect below ALSO attempts connect,
      // so this is best-effort only.
      setTimeout(async () => {
        try {
          await connect();
        } catch (e) {
          const msg = (e as Error).message;
          if (!SILENT_ERROR_RE.test(msg)) {
            setError(msg);
          }
        }
      }, 50);
    },
    [select, connect],
  );

  // If a wallet is selected but not connected, finish the handshake — but
  // only when the adapter is actually ready. Trying to connect a
  // NotDetected wallet throws WalletNotReadyError on every render.
  useEffect(() => {
    if (activeWallet && !connected && !connecting && isReady(activeWallet)) {
      connect().catch((e) => {
        const msg = (e as Error).message;
        if (!SILENT_ERROR_RE.test(msg)) {
          setError(msg);
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWallet?.adapter.name, activeWallet?.readyState]);

  const { installed, loadable, notDetected } = useMemo(() => {
    const installed: Wallet[] = [];
    const loadable: Wallet[] = [];
    const notDetected: Wallet[] = [];
    for (const w of wallets) {
      switch (w.readyState) {
        case WalletReadyState.Installed:
          installed.push(w);
          break;
        case WalletReadyState.Loadable:
          loadable.push(w);
          break;
        default:
          notDetected.push(w);
      }
    }
    // Sort each bucket alphabetically for stable rendering.
    const byName = (a: Wallet, b: Wallet) => a.adapter.name.localeCompare(b.adapter.name);
    return {
      installed: installed.sort(byName),
      loadable:  loadable.sort(byName),
      notDetected: notDetected.sort(byName),
    };
  }, [wallets]);

  const label = connecting
    ? "Connecting…"
    : disconnecting
      ? "Disconnecting…"
      : connected && publicKey
        ? `${publicKey.toBase58().slice(0, 4)}…${publicKey.toBase58().slice(-4)}`
        : "Connect Wallet";

  const baseBtn: React.CSSProperties = variant === "header"
    ? {
        height: 32,
        padding: "0 14px",
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: "0.02em",
      }
    : {
        width: "100%",
        height: 40,
        padding: "0 16px",
        borderRadius: 10,
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.02em",
      };

  return (
    <div style={{ position: "relative", display: "inline-block" }} ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (connected) setMenuOpen((m) => !m);
          else setOpen(true);
        }}
        style={{
          ...baseBtn,
          fontFamily: FD,
          background: "transparent",
          color: C.textPrimary,
          borderTop: `0.5px solid ${C.border}`,
          borderRight: `0.5px solid ${C.border}`,
          borderBottom: `0.5px solid ${C.border}`,
          borderLeft: `0.5px solid ${C.border}`,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          transition: "background 0.15s, border-color 0.15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = C.surface;
          (e.currentTarget as HTMLElement).style.borderColor = C.borderHover;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
          (e.currentTarget as HTMLElement).style.borderColor = C.border;
        }}
      >
        {connected && activeWallet && (
          <img
            src={activeWallet.adapter.icon}
            alt=""
            width={14}
            height={14}
            style={{ borderRadius: 3, display: "block" }}
          />
        )}
        <span style={{ fontFamily: connected ? FM : FD }}>{label}</span>
      </button>

      {/* Post-connect dropdown: copy address / disconnect */}
      {connected && menuOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 200,
            background: C.card,
            borderTop: `0.5px solid ${C.border}`,
            borderRight: `0.5px solid ${C.border}`,
            borderBottom: `0.5px solid ${C.border}`,
            borderLeft: `0.5px solid ${C.border}`,
            borderRadius: 10,
            padding: 4,
            boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
            zIndex: 200,
          }}
        >
          <button
            type="button"
            onClick={() => {
              if (publicKey) navigator.clipboard.writeText(publicKey.toBase58());
              setMenuOpen(false);
            }}
            style={menuItemStyle}
          >
            Copy address
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(true);
              setMenuOpen(false);
            }}
            style={menuItemStyle}
          >
            Change wallet
          </button>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setMenuOpen(false);
            }}
            style={{ ...menuItemStyle, color: C.coral }}
          >
            Disconnect
          </button>
        </div>
      )}

      {/* Wallet-picker modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.72)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "calc(100% - 40px)",
              maxWidth: 380,
              background: C.card,
              borderTop: `0.5px solid ${C.border}`,
              borderRight: `0.5px solid ${C.border}`,
              borderBottom: `0.5px solid ${C.border}`,
              borderLeft: `0.5px solid ${C.border}`,
              borderRadius: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
              overflow: "hidden",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "18px 20px 10px", position: "relative" }}>
              <div style={{
                fontFamily: FM, fontSize: 10, letterSpacing: "0.18em",
                color: C.tealLight, fontWeight: 600, marginBottom: 8,
              }}>
                SOLANA · DEVNET
              </div>
              <div style={{
                fontFamily: FD, fontSize: 16, fontWeight: 600,
                color: C.textPrimary, letterSpacing: "-0.005em",
              }}>
                Connect a wallet
              </div>
              <div style={{
                fontFamily: FS, fontSize: 12, color: C.textSecondary,
                marginTop: 4, lineHeight: 1.5,
              }}>
                Installed wallets connect instantly. Hardware wallets will prompt on your device.
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  position: "absolute", top: 14, right: 14,
                  width: 26, height: 26, borderRadius: 6,
                  background: "transparent",
                  borderTop: `0.5px solid ${C.border}`,
                  borderRight: `0.5px solid ${C.border}`,
                  borderBottom: `0.5px solid ${C.border}`,
                  borderLeft: `0.5px solid ${C.border}`,
                  color: C.textSecondary,
                  fontSize: 14, cursor: "pointer",
                  lineHeight: "24px",
                }}
              >
                ×
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "0 14px 14px" }}>
              {installed.length > 0 && (
                <WalletSection title="Detected" wallets={installed} onPick={handlePick} />
              )}
              {loadable.length > 0 && (
                <WalletSection title="Hardware / loadable" wallets={loadable} onPick={handlePick} />
              )}
              {notDetected.length > 0 && (
                <WalletSection
                  title="Install to use"
                  wallets={notDetected}
                  onPick={(w) => {
                    if (w.adapter.url) window.open(w.adapter.url, "_blank", "noopener,noreferrer");
                  }}
                  badge="INSTALL"
                  muted
                />
              )}
              {installed.length === 0 && loadable.length === 0 && (
                <div style={{
                  padding: "18px 6px",
                  fontSize: 12, color: C.textSecondary, fontFamily: FS,
                  lineHeight: 1.6, textAlign: "center",
                }}>
                  No Solana wallets detected in this browser. Install Phantom, Solflare, or Backpack to continue.
                </div>
              )}
              {error && (
                <div style={{
                  marginTop: 10, padding: "10px 12px",
                  background: C.redBg,
                  borderTop: `0.5px solid ${C.red}55`,
                  borderRight: `0.5px solid ${C.red}55`,
                  borderBottom: `0.5px solid ${C.red}55`,
                  borderLeft: `0.5px solid ${C.red}55`,
                  borderRadius: 8,
                  color: C.red, fontFamily: FS, fontSize: 11,
                }}>
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "8px 10px",
  background: "transparent",
  border: "none",
  color: C.textSecondary,
  fontFamily: FD,
  fontSize: 12,
  textAlign: "left",
  cursor: "pointer",
  borderRadius: 6,
};

function WalletSection({
  title,
  wallets,
  onPick,
  badge,
  muted,
}: {
  title: string;
  wallets: Wallet[];
  onPick: (w: Wallet) => void;
  badge?: string;
  muted?: boolean;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        fontFamily: FM, fontSize: 10, letterSpacing: "0.14em",
        color: C.textMuted, fontWeight: 500,
        padding: "0 4px 8px", textTransform: "uppercase",
      }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {wallets.map((w) => (
          <button
            key={w.adapter.name}
            type="button"
            onClick={() => onPick(w)}
            style={{
              height: 52,
              padding: "0 14px",
              borderRadius: 10,
              background: C.surface,
              borderTop: `0.5px solid transparent`,
              borderRight: `0.5px solid transparent`,
              borderBottom: `0.5px solid transparent`,
              borderLeft: `0.5px solid transparent`,
              color: muted ? C.textSecondary : C.textPrimary,
              fontFamily: FD, fontSize: 14, fontWeight: 500,
              cursor: "pointer",
              display: "flex", alignItems: "center", gap: 12,
              transition: "background 0.15s, border-color 0.15s",
              textAlign: "left",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = C.cardHover;
              (e.currentTarget as HTMLElement).style.borderTopColor = C.borderHover;
              (e.currentTarget as HTMLElement).style.borderRightColor = C.borderHover;
              (e.currentTarget as HTMLElement).style.borderBottomColor = C.borderHover;
              (e.currentTarget as HTMLElement).style.borderLeftColor = C.borderHover;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = C.surface;
              (e.currentTarget as HTMLElement).style.borderTopColor = "transparent";
              (e.currentTarget as HTMLElement).style.borderRightColor = "transparent";
              (e.currentTarget as HTMLElement).style.borderBottomColor = "transparent";
              (e.currentTarget as HTMLElement).style.borderLeftColor = "transparent";
            }}
          >
            <img
              src={w.adapter.icon}
              alt=""
              width={24}
              height={24}
              style={{ borderRadius: 6, display: "block", flexShrink: 0 }}
            />
            <span style={{ flex: 1 }}>{w.adapter.name}</span>
            {badge && (
              <span style={{
                fontFamily: FM, fontSize: 10, letterSpacing: "0.08em",
                color: C.textMuted, fontWeight: 500,
              }}>
                {badge}
              </span>
            )}
            {!badge && (
              <span style={{
                fontFamily: FM, fontSize: 10, letterSpacing: "0.06em",
                color: C.tealLight, textTransform: "uppercase",
                padding: "2px 8px",
                borderTop: `0.5px solid ${C.border}`,
                borderRight: `0.5px solid ${C.border}`,
                borderBottom: `0.5px solid ${C.border}`,
                borderLeft: `0.5px solid ${C.border}`,
                borderRadius: 100,
                background: "rgba(45, 212, 191, 0.08)",
              }}>
                DETECTED
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
