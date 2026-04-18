/**
 * High-level Traxis onchain client used by the API routes.
 *
 * Responsibilities:
 *   - Build user-signed transactions (deposit, redeem) that Phantom signs.
 *   - Execute authority-signed instructions (initialize_vault, resolve_leg,
 *     finalize_vault, admin_withdraw_fees).
 *   - Read-only queries against vault state and token balances.
 *
 * The deposit/redeem transaction builders also pre-add an
 * `createAssociatedTokenAccountIdempotent` instruction for the user's TRAX
 * ATA, so the frontend can submit the returned tx as-is without extra setup.
 */
import { BN } from "@coral-xyz/anchor";
import {
  PublicKey,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  TransactionMessage,
  ComputeBudgetProgram,
} from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
  getAccount,
} from "@solana/spl-token";
import {
  bundleIdToSeed,
  deriveMeteoraAdapter,
  deriveMeteoraPool,
  derivePpnNote,
  deriveTraxMint,
  deriveUsdcVault,
  deriveVaultPda,
  getConfig,
  getConnection,
  getPpnProgram,
  getProvider,
  getVaultProgram,
} from "./anchor";

// ---------- Types ----------

export interface BuildDepositTxResult {
  /** Base64-encoded serialized VersionedTransaction the frontend forwards to Phantom. */
  transactionBase64: string;
  expectedTokens: string; // u64 as decimal string to survive JSON
  feeUsdc: string;
  issuePriceBps: number;
  vaultPda: string;
  traxMint: string;
  feeRecipientAta: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}

export interface BuildRedeemTxResult {
  transactionBase64: string;
  expectedUsdc: string;
  vaultPda: string;
  traxMint: string;
  recentBlockhash: string;
  lastValidBlockHeight: number;
}

export interface LegInitView {
  marketId: Uint8Array | number[];
  weightBps: number;
}

export interface InitializeVaultResult {
  signature: string;
  vaultPda: string;
  traxMint: string;
  usdcVault: string;
}

export interface VaultStateView {
  bundleSeedHex: string;
  authority: string;
  traxMint: string;
  usdcMint: string;
  usdcVault: string;
  feeRecipient: string;
  issuePriceBps: number;
  feeBps: number;
  riskTier: number;
  resolutionDate: number;
  legCount: number;
  legs: Array<{
    marketIdHex: string;
    weightBps: number;
    status: "unresolved" | "won" | "lost";
  }>;
  totalTokensMinted: string;
  totalUsdcDeposited: string;
  totalFeesCollected: string;
  finalPayoutPerToken: string;
  state: "active" | "finalized" | "closed";
}

// ---------- Helpers ----------

function toHex(bytes: Uint8Array | number[]): string {
  const arr = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeLegStatus(s: any): "unresolved" | "won" | "lost" {
  if (s?.unresolved !== undefined) return "unresolved";
  if (s?.won !== undefined) return "won";
  if (s?.lost !== undefined) return "lost";
  return "unresolved";
}

function normalizeVaultState(s: any): "active" | "finalized" | "closed" {
  if (s?.active !== undefined) return "active";
  if (s?.finalized !== undefined) return "finalized";
  if (s?.closed !== undefined) return "closed";
  return "active";
}

// ---------- User-signed transaction builders ----------

/**
 * Build a deposit transaction for the user to sign in their wallet.
 * The returned tx includes (idempotent) ATA creation for the user's TRAX ATA,
 * so the frontend can submit it as-is.
 */
export async function buildDepositTx(
  userPubkey: PublicKey,
  bundleId: string,
  amountUsdc: bigint,
): Promise<BuildDepositTxResult> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const conn = getConnection();

  const [vaultPda] = deriveVaultPda(bundleId);
  const [traxMint] = deriveTraxMint(bundleId);
  const [usdcVault] = deriveUsdcVault(bundleId);

  // Fetch vault for issue price + fee bps.
  const vaultAcct = (await (program.account as any).vault.fetch(vaultPda)) as any;
  const issuePriceBps: number = vaultAcct.issuePriceBps;
  const feeBps: number = vaultAcct.feeBps;

  const feeUsdc = (amountUsdc * BigInt(feeBps)) / 10_000n;
  const netUsdc = amountUsdc - feeUsdc;
  const expectedTokens = (netUsdc * 10_000n) / BigInt(issuePriceBps);

  const userUsdcAta = getAssociatedTokenAddressSync(cfg.usdcMint, userPubkey);
  const userTraxAta = getAssociatedTokenAddressSync(traxMint, userPubkey);
  const feeRecipientAta = getAssociatedTokenAddressSync(
    cfg.usdcMint,
    cfg.feeRecipient,
  );

  // Ensure user's TRAX ATA exists (idempotent).
  const ensureAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    userPubkey,
    userTraxAta,
    userPubkey,
    traxMint,
  );

  const depositIx: TransactionInstruction = await program.methods
    .deposit(new BN(amountUsdc.toString()))
    .accounts({
      user: userPubkey,
      vault: vaultPda,
      traxMint,
      usdcVault,
      userUsdcAta,
      userTraxAta,
      feeRecipientAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  // Slight priority fee bump to help during demos on congested RPC.
  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1_000,
  });
  const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 250_000,
  });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: userPubkey,
    recentBlockhash: blockhash,
    instructions: [cuLimitIx, priorityIx, ensureAtaIx, depositIx],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  const transactionBase64 = Buffer.from(tx.serialize()).toString("base64");

  return {
    transactionBase64,
    expectedTokens: expectedTokens.toString(),
    feeUsdc: feeUsdc.toString(),
    issuePriceBps,
    vaultPda: vaultPda.toBase58(),
    traxMint: traxMint.toBase58(),
    feeRecipientAta: feeRecipientAta.toBase58(),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  };
}

export async function buildRedeemTx(
  userPubkey: PublicKey,
  bundleId: string,
  amountTokens: bigint,
): Promise<BuildRedeemTxResult> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const conn = getConnection();

  const [vaultPda] = deriveVaultPda(bundleId);
  const [traxMint] = deriveTraxMint(bundleId);
  const [usdcVault] = deriveUsdcVault(bundleId);

  const vaultAcct = (await (program.account as any).vault.fetch(vaultPda)) as any;
  const finalPayoutPerToken: bigint = BigInt(
    (vaultAcct.finalPayoutPerToken as BN).toString(),
  );
  const expectedUsdc = (amountTokens * finalPayoutPerToken) / 1_000_000n;

  const userUsdcAta = getAssociatedTokenAddressSync(cfg.usdcMint, userPubkey);
  const userTraxAta = getAssociatedTokenAddressSync(traxMint, userPubkey);

  const ensureUsdcAtaIx = createAssociatedTokenAccountIdempotentInstruction(
    userPubkey,
    userUsdcAta,
    userPubkey,
    cfg.usdcMint,
  );

  const redeemIx = await program.methods
    .redeem(new BN(amountTokens.toString()))
    .accounts({
      user: userPubkey,
      vault: vaultPda,
      traxMint,
      usdcVault,
      userTraxAta,
      userUsdcAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .instruction();

  const priorityIx = ComputeBudgetProgram.setComputeUnitPrice({
    microLamports: 1_000,
  });
  const cuLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
    units: 250_000,
  });

  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash("confirmed");
  const msg = new TransactionMessage({
    payerKey: userPubkey,
    recentBlockhash: blockhash,
    instructions: [cuLimitIx, priorityIx, ensureUsdcAtaIx, redeemIx],
  }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  const transactionBase64 = Buffer.from(tx.serialize()).toString("base64");

  return {
    transactionBase64,
    expectedUsdc: expectedUsdc.toString(),
    vaultPda: vaultPda.toBase58(),
    traxMint: traxMint.toBase58(),
    recentBlockhash: blockhash,
    lastValidBlockHeight,
  };
}

// ---------- Authority-signed calls ----------

export interface InitializeVaultArgs {
  bundleId: string;
  issuePriceBps: number;
  feeBps: number;
  riskTier: 50 | 70 | 90;
  resolutionDate: Date;
  legs: LegInitView[];
}

export async function initializeVault(
  args: InitializeVaultArgs,
): Promise<InitializeVaultResult> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const bundleSeed = bundleIdToSeed(args.bundleId);

  const [vaultPda] = deriveVaultPda(args.bundleId);
  const [traxMint] = deriveTraxMint(args.bundleId);
  const [usdcVault] = deriveUsdcVault(args.bundleId);

  // Step 1/2: create the Vault PDA and store leg metadata. The Rust program
  // splits this from token creation so each instruction's try_accounts stays
  // under BPF's 4 KB stack budget.
  await program.methods
    .initializeVault({
      bundleSeed: Array.from(bundleSeed),
      issuePriceBps: args.issuePriceBps,
      feeBps: args.feeBps,
      riskTier: args.riskTier,
      resolutionDate: new BN(Math.floor(args.resolutionDate.getTime() / 1000)),
      legs: args.legs.map((l) => ({
        marketId:
          l.marketId instanceof Uint8Array
            ? Array.from(l.marketId)
            : Array.from(l.marketId),
        weightBps: l.weightBps,
      })),
    })
    .accounts({
      authority: cfg.authorityKeypair.publicKey,
      vault: vaultPda,
      feeRecipient: cfg.feeRecipient,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  // Step 2/2: create the TRAX mint and the PDA-owned USDC vault token account.
  // Populates vault.trax_mint, vault.usdc_mint, vault.usdc_vault.
  const signature = await program.methods
    .initializeVaultTokens()
    .accounts({
      authority: cfg.authorityKeypair.publicKey,
      vault: vaultPda,
      traxMint,
      usdcMint: cfg.usdcMint,
      usdcVault,
      systemProgram: SystemProgram.programId,
      tokenProgram: TOKEN_PROGRAM_ID,
      rent: SYSVAR_RENT_PUBKEY,
    })
    .rpc();

  return {
    signature,
    vaultPda: vaultPda.toBase58(),
    traxMint: traxMint.toBase58(),
    usdcVault: usdcVault.toBase58(),
  };
}

export async function resolveLeg(
  bundleId: string,
  legIndex: number,
  outcome: "won" | "lost",
): Promise<string> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const [vaultPda] = deriveVaultPda(bundleId);
  const outcomeByte = outcome === "won" ? 1 : 2;

  return await program.methods
    .resolveLeg(legIndex, outcomeByte)
    .accounts({
      authority: cfg.authorityKeypair.publicKey,
      vault: vaultPda,
    })
    .rpc();
}

export async function finalizeVault(bundleId: string): Promise<string> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const [vaultPda] = deriveVaultPda(bundleId);
  const [usdcVault] = deriveUsdcVault(bundleId);

  return await program.methods
    .finalizeVault()
    .accounts({
      authority: cfg.authorityKeypair.publicKey,
      vault: vaultPda,
      usdcVault,
    })
    .rpc();
}

export async function adminWithdrawFees(bundleId: string): Promise<string> {
  const cfg = getConfig();
  const program = getVaultProgram();
  const [vaultPda] = deriveVaultPda(bundleId);
  const [usdcVault] = deriveUsdcVault(bundleId);
  const feeRecipientAta = getAssociatedTokenAddressSync(
    cfg.usdcMint,
    cfg.feeRecipient,
  );

  return await program.methods
    .adminWithdrawFees()
    .accounts({
      authority: cfg.authorityKeypair.publicKey,
      vault: vaultPda,
      usdcVault,
      feeRecipientAta,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .rpc();
}

// ---------- Read-only queries ----------

export async function getVaultState(bundleId: string): Promise<VaultStateView | null> {
  const program = getVaultProgram();
  const [vaultPda] = deriveVaultPda(bundleId);
  try {
    const v = (await (program.account as any).vault.fetch(vaultPda)) as any;
    return {
      bundleSeedHex: toHex(v.bundleSeed),
      authority: v.authority.toBase58(),
      traxMint: v.traxMint.toBase58(),
      usdcMint: v.usdcMint.toBase58(),
      usdcVault: v.usdcVault.toBase58(),
      feeRecipient: v.feeRecipient.toBase58(),
      issuePriceBps: v.issuePriceBps,
      feeBps: v.feeBps,
      riskTier: v.riskTier,
      resolutionDate: (v.resolutionDate as BN).toNumber(),
      legCount: v.legCount,
      legs: (v.legs as any[])
        .slice(0, v.legCount)
        .map((l) => ({
          marketIdHex: toHex(l.marketId),
          weightBps: l.weightBps,
          status: normalizeLegStatus(l.status),
        })),
      totalTokensMinted: (v.totalTokensMinted as BN).toString(),
      totalUsdcDeposited: (v.totalUsdcDeposited as BN).toString(),
      totalFeesCollected: (v.totalFeesCollected as BN).toString(),
      finalPayoutPerToken: (v.finalPayoutPerToken as BN).toString(),
      state: normalizeVaultState(v.state),
    };
  } catch (err) {
    return null;
  }
}

export async function getTokenBalance(
  wallet: PublicKey,
  mint: PublicKey,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, wallet);
  try {
    const acct = await getAccount(getConnection(), ata);
    return acct.amount;
  } catch {
    return 0n;
  }
}

export async function confirmTransaction(signature: string): Promise<boolean> {
  const conn = getConnection();
  const status = await conn.getSignatureStatus(signature, {
    searchTransactionHistory: true,
  });
  return (
    status.value?.confirmationStatus === "confirmed" ||
    status.value?.confirmationStatus === "finalized"
  );
}
