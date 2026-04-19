"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Header, PageFrame } from "../../_components/Header";
import { Sparkline, MetricTile } from "../../_components/charts";
import { C, FS, FD, EASE, tc, fmtUsd } from "../../_lib/tokens";
import { bundleById } from "../../_lib/bundles";
import { useSandbox } from "../../_lib/demo-state";
import { useWallet, explorerTxUrl } from "../../_lib/wallet";
import {
  prepareDeposit,
  confirmDeposit,
  DepositError,
} from "../../_lib/deposit-client";

type FlowStage =
  | "idle"
  | "preparing"
  | "signing"
  | "confirming"
  | "persisting"
  | "done"
  | "error";

export default function BasketDetail() {
  const params = useParams<{ id: string }>();
  const { state, dispatch } = useSandbox();
  const bundle = bundleById(params.id);
  const [amt, setAmt] = useState("");
  const [stage, setStage] = useState<FlowStage>("idle");
  const [signature, setSignature] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const wallet = useWallet();

  if (!bundle) {
    return (
      <>
        <Header onResetClick={() => dispatch({ type: "reset" })} />
        <PageFrame>
          <div style={{ padding: 48, textAlign: "center", color: C.textMuted, fontFamily: FS }}>
            Basket not found. <Link href="/app/basket" style={{ color: C.teal }}>Back to all baskets</Link>
          </div>
        </PageFrame>
      </>
    );
  }

  const color = tc(bundle.tier);
  const dep = parseFloat(amt) || 0;
  const tokensOut = dep > 0 ? ((dep * 0.995) / bundle.nav).toFixed(2) : "-";
  const insufficient = dep > state.usdc; // sandbox check; real on-chain check happens at Phantom-sign time
  const walletConnected = wallet.status === "connected" && wallet.publicKey !== null;
  const busy = stage !== "idle" && stage !== "done" && stage !== "error";

  async function handleOnchainDeposit() {
    if (dep <= 0) return;
    if (!walletConnected || !wallet.publicKey) {
      await wallet.connect();
      return;
    }
    setErrorMsg(null);
    setSignature(null);

    try {
      // 1. ask backend to build the tx
      setStage("preparing");
      const prep = await prepareDeposit({
        bundleId: bundle!.id,
        walletAddress: wallet.publicKey.toBase58(),
        amountUsdc: dep,
      });

      // 2. hand to Phantom for signing + submission
      setStage("signing");
      const sig = await wallet.signAndSendBase64Tx(prep.transaction_base64);
      setSignature(sig);

      // 3. wait for on-chain confirmation
      setStage("confirming");
      const ok = await wallet.waitForConfirmation(sig, 60_000);
      if (!ok) throw new Error("Timed out waiting for confirmation");

      // 4. tell backend to persist the position now that it's on-chain
      setStage("persisting");
      await confirmDeposit({
        bundleId: bundle!.id,
        walletAddress: wallet.publicKey.toBase58(),
        amountUsdc: dep,
        signature: sig,
        tokensMinted: prep.tokens_minted,
        issuePrice: prep.issue_price,
        feeUsdc: prep.fee_usdc,
      });

      // 5. also mirror into the sandbox state so the Portfolio view reflects it
      dispatch({ type: "basket/deposit", bundleId: bundle!.id, usdcAmount: dep });

      setStage("done");
      setTimeout(() => {
        setAmt("");
        setStage("idle");
        setSignature(null);
      }, 5000);
    } catch (err: unknown) {
      const msg =
        err instanceof DepositError
          ? err.message
          : err instanceof Error
            ? err.message
            : String(err);
      setErrorMsg(msg);
      setStage("error");
    }
  }

  function resetFlow() {
    setStage("idle");
    setErrorMsg(null);
    setSignature(null);
  }

  const buttonLabel = (() => {
    if (!walletConnected) return dep > 0 ? "Connect Phantom to deposit" : "Connect Phantom";
    if (stage === "preparing") return "Preparing transaction…";
    if (stage === "signing") return "Sign in Phantom…";
    if (stage === "confirming") return "Confirming on-chain…";
    if (stage === "persisting") return "Finalizing…";
    if (stage === "done") return "✓ Settled on devnet";
    if (stage === "error") return "Retry";
    if (dep <= 0) return "Deposit";
    return `Deposit ${fmtUsd(dep, 0)} USDC`;
  })();

  const buttonDisabled =
    busy ||
    (walletConnected && dep <= 0) ||
    (walletConnected && stage !== "error" && stage !== "done" && stage !== "idle");

  const buttonBg = (() => {
    if (stage === "done") return C.green;
    if (stage === "error") return C.redBg;
    if (!walletConnected) return C.card;
    if (buttonDisabled || dep <= 0) return C.border;
    return C.teal;
  })();

  const buttonColor =
    stage === "done"
      ? "#000"
      : stage === "error"
        ? C.red
        : !walletConnected || dep <= 0
          ? C.textMuted
          : "#000";

  return (
    <>
      <Header onResetClick={() => dispatch({ type: "reset" })} />
      <PageFrame>
        <Link href="/app/basket" style={{ fontSize: 13, color: C.textSecondary, textDecoration: "none", fontFamily: FS, display: "inline-flex", gap: 8, marginBottom: 20 }}>
          <span>←</span> Back to Baskets
        </Link>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.textPrimary, fontFamily: FD, letterSpacing: "-0.01em", marginBottom: 6 }}>{bundle.id}</div>
            <div style={{ fontSize: 13, color: C.textSecondary, fontFamily: FS }}>
              {bundle.resolved}/{bundle.totalLegs} legs resolved · {bundle.daysLeft}d remaining · resolves {bundle.date}
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 44, fontWeight: 700, color, fontFamily: FD, lineHeight: 1, letterSpacing: "-0.02em" }}>{(bundle.nav * 100).toFixed(1)}%</div>
            <div style={{ fontSize: 13, fontFamily: FS, marginTop: 4 }}>
              <span style={{ color: C.textSecondary }}>${bundle.nav.toFixed(3)} · </span>
              <span style={{ color: bundle.change >= 0 ? C.green : C.red }}>
                {bundle.change >= 0 ? "+" : ""}
                {bundle.change.toFixed(1)}% today
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, letterSpacing: "0.08em", marginBottom: 16 }}>NAV · 30 DAY</div>
              <Sparkline data={bundle.history} color={color} height={140} width={700} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <MetricTile label="ISSUE PRICE" value={`$${bundle.issue.toFixed(2)}`} sub="per STHS token" />
              <MetricTile label="MAX PAYOUT" value="$1.00" color={C.green} sub="if all legs resolve YES" />
              <MetricTile label="BREAKEVEN" value={`${(bundle.nav * 100).toFixed(0)}%`} sub="implied probability" />
            </div>
          </div>

          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 20 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.textPrimary, fontFamily: FD }}>Deposit USDC</div>
              <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, letterSpacing: "0.06em" }}>DEVNET · ON-CHAIN</div>
            </div>
            <input
              type="number"
              placeholder="0"
              value={amt}
              onChange={(e) => setAmt(e.target.value)}
              disabled={busy}
              style={{
                width: "100%",
                padding: "12px 14px",
                fontSize: 16,
                fontFamily: FD,
                background: C.surface,
                border: `0.5px solid ${C.border}`,
                borderRadius: 10,
                color: C.textPrimary,
                marginBottom: 14,
                opacity: busy ? 0.6 : 1,
              }}
            />
            <div style={{ fontSize: 11, color: C.textMuted, fontFamily: FS, marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
              <span>Sandbox: ${state.usdc.toLocaleString()}</span>
              {walletConnected && wallet.publicKey && (
                <span title={wallet.publicKey.toBase58()}>
                  {wallet.publicKey.toBase58().slice(0, 4)}…{wallet.publicKey.toBase58().slice(-4)}
                </span>
              )}
            </div>
            <div style={{ background: C.surface, borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 12, fontFamily: FS }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>STHS tokens</span>
                <span style={{ color: C.textPrimary }}>{tokensOut}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                <span style={{ color: C.textSecondary }}>Fee (0.5%)</span>
                <span style={{ color: C.textMuted }}>{dep > 0 ? fmtUsd(dep * 0.005, 2) : "-"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: C.textSecondary }}>Max payout</span>
                <span style={{ color: C.green }}>{dep > 0 ? fmtUsd(parseFloat(tokensOut) * 1.0, 2) : "-"}</span>
              </div>
            </div>
            <button
              onClick={stage === "error" ? resetFlow : handleOnchainDeposit}
              disabled={buttonDisabled && stage !== "error"}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 10,
                border: "none",
                background: buttonBg,
                color: buttonColor,
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FD,
                cursor:
                  stage === "error"
                    ? "pointer"
                    : buttonDisabled
                      ? "not-allowed"
                      : "pointer",
                transition: `all 0.2s ${EASE}`,
              }}
            >
              {buttonLabel}
            </button>

            {/* Status line + explorer link */}
            {signature && stage !== "error" && (
              <div style={{ marginTop: 10, textAlign: "center", fontSize: 11, fontFamily: FS }}>
                <a
                  href={explorerTxUrl(signature)}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: C.teal, textDecoration: "none" }}
                >
                  View on Solana Explorer ↗
                </a>
              </div>
            )}
            {stage === "error" && errorMsg && (
              <div style={{ marginTop: 10, fontSize: 11, fontFamily: FS, color: C.red, lineHeight: 1.5 }}>
                {errorMsg}
              </div>
            )}
            {insufficient && !busy && stage === "idle" && dep > 0 && walletConnected && (
              <div style={{ marginTop: 8, fontSize: 10, fontFamily: FS, color: C.amber }}>
                Note: sandbox balance is low, but real USDC will come from your Phantom wallet on devnet.
              </div>
            )}
            <div style={{ fontSize: 10, color: C.textMuted, fontFamily: FS, textAlign: "center", marginTop: 10 }}>
              Transactions settle on Solana devnet via Phantom.
            </div>
          </div>
        </div>
      </PageFrame>
    </>
  );
}
