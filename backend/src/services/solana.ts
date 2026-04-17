/**
 * Solana Integration Service
 * Stubs for on-chain operations. Victor: fill these in with actual Anchor/web3.js calls.
 *
 * Required env vars (add to .env when ready):
 * - SOLANA_RPC_URL (default: https://api.devnet.solana.com)
 * - PROGRAM_ID (the deployed Anchor program ID)
 * - MINT_AUTHORITY_KEYPAIR (path to keypair file or base58 string)
 */

// === Types ===

export interface MintResult {
  success: boolean;
  tx_signature: string;
  tokens_minted: number;
  mint_address: string;
  error?: string;
}

export interface BurnResult {
  success: boolean;
  tx_signature: string;
  tokens_burned: number;
  error?: string;
}

export interface TokenBalance {
  wallet_address: string;
  mint_address: string;
  balance: number;
}

export interface VaultDeposit {
  success: boolean;
  tx_signature: string;
  vault_address: string;
  amount_usdc: number;
  error?: string;
}

// === Stubs ===

/**
 * Mint LK tokens to a wallet after a deposit.
 * Called by deposit route after recording the position in DB.
 *
 * Victor: Use the SPL Token program to mint tokens.
 * The mint address should be derived from the bundle name (e.g., LK-90-0430).
 */
export async function mintTokens(
  walletAddress: string,
  bundleName: string,
  amount: number
): Promise<MintResult> {
  // TODO: Implement with @solana/web3.js and @coral-xyz/anchor
  console.log(`[solana-stub] mintTokens: ${amount} ${bundleName} tokens to ${walletAddress}`);
  return {
    success: true,
    tx_signature: `stub_mint_${Date.now().toString(36)}`,
    tokens_minted: amount,
    mint_address: `stub_mint_address_${bundleName}`,
  };
}

/**
 * Burn LK tokens from a wallet during redemption.
 * Called by redeem route after verifying the bundle is resolved.
 */
export async function burnTokens(
  walletAddress: string,
  bundleName: string,
  amount: number
): Promise<BurnResult> {
  console.log(`[solana-stub] burnTokens: ${amount} ${bundleName} tokens from ${walletAddress}`);
  return {
    success: true,
    tx_signature: `stub_burn_${Date.now().toString(36)}`,
    tokens_burned: amount,
  };
}

/**
 * Get the on-chain token balance for a wallet + mint.
 */
export async function getTokenBalance(
  walletAddress: string,
  mintAddress: string
): Promise<TokenBalance> {
  console.log(`[solana-stub] getTokenBalance: ${walletAddress} for mint ${mintAddress}`);
  return {
    wallet_address: walletAddress,
    mint_address: mintAddress,
    balance: 0,
  };
}

/**
 * Deposit USDC into a Meteora yield vault (for PPN mode).
 * Called when creating a Principal Protected Note.
 */
export async function depositToVault(
  walletAddress: string,
  amountUsdc: number,
  vaultAddress: string
): Promise<VaultDeposit> {
  console.log(`[solana-stub] depositToVault: ${amountUsdc} USDC from ${walletAddress} to ${vaultAddress}`);
  return {
    success: true,
    tx_signature: `stub_vault_${Date.now().toString(36)}`,
    vault_address: vaultAddress,
    amount_usdc: amountUsdc,
  };
}

/**
 * Create a new SPL token mint for a bundle.
 * Should be called once when a new bundle is created.
 * Returns the mint address.
 */
export async function createBundleMint(bundleName: string): Promise<string> {
  console.log(`[solana-stub] createBundleMint: ${bundleName}`);
  return `stub_mint_${bundleName}_${Date.now().toString(36)}`;
}

/**
 * Check if a Solana transaction is confirmed.
 */
export async function confirmTransaction(signature: string): Promise<boolean> {
  console.log(`[solana-stub] confirmTransaction: ${signature}`);
  return true;
}
