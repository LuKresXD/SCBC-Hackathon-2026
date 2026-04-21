import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import {
  getBundleById,
  createPosition,
  createTransaction,
  getPositionsByWallet,
  getPositionsByWalletAndBundle,
  getTransactionsByWallet,
  updatePositionTokens,
  getLegsByBundleId,
} from '../db/queries';
import { getIssuePriceForBundle, getLiveNAV } from '../services/pricing';
import { calculateNAV, isFullyResolved } from '../services/nav';
import { config } from '../config';
import { supabase } from '../db/supabase';
import {
  buildDepositTx,
  buildRedeemTx,
  confirmTransaction,
  getVaultState,
} from '../services/solana';
import { DepositRequest, DepositResponse } from '../types';
import { validate, depositSchema, redeemSchema } from '../utils/validation';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/deposit  and  /api/deposit/prepare
//
// Non-custodial prepare step: builds a Solana transaction the caller's wallet
// will sign in Phantom. Does NOT write to the DB — that happens when the
// frontend calls /api/deposit/confirm with the confirmed signature.
//
// The legacy POST /api/deposit continues to accept the same body and returns
// a DepositResponse augmented with `transaction_base64` and `expected_tokens`.
// ---------------------------------------------------------------------------

async function prepareDepositHandler(req: Request, res: Response) {
  try {
    const { bundle_id, wallet_address, amount_usdc } = req.body as DepositRequest;

    const bundle = await getBundleById(bundle_id);
    if (!bundle) return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    if (bundle.status !== 'active')
      return res.status(400).json({ error: `Bundle is not active (status: ${bundle.status})` });

    // Derive issue price (used only for the client-side display — the on-chain
    // math uses the vault's stored issue_price_bps, not this value).
    const issuePrice = await getIssuePriceForBundle(bundle_id);
    if (!issuePrice || issuePrice <= 0) {
      return res.status(500).json({ error: 'Unable to determine issue price' });
    }

    // Convert amount_usdc (UI number) → 6-dec base units for on-chain.
    const amountBaseUnits = BigInt(Math.round(amount_usdc * 1_000_000));

    let built;
    try {
      built = await buildDepositTx(
        new PublicKey(wallet_address),
        bundle_id,
        amountBaseUnits,
      );
    } catch (err: any) {
      // Common case: onchain vault hasn't been initialized yet for this bundle.
      if (String(err).includes('Account does not exist') || String(err).includes('not found')) {
        return res.status(409).json({
          error: 'Onchain vault has not been initialized for this bundle. Run /api/admin/bundles/:id/init-onchain first.',
        });
      }
      throw err;
    }

    // Client-friendly preview numbers.
    const feeUsdcUi = Number(built.feeUsdc) / 1_000_000;
    const netUsdcUi = amount_usdc - feeUsdcUi;
    const tokensMintedUi = Number(built.expectedTokens) / 1_000_000;

    res.status(200).json({
      kind: 'prepared',
      bundle_id,
      wallet_address,
      amount_usdc,
      fee_usdc: feeUsdcUi,
      net_usdc: netUsdcUi,
      issue_price: issuePrice,
      tokens_minted: tokensMintedUi, // legacy key for compatibility
      expected_tokens: tokensMintedUi,
      transaction_base64: built.transactionBase64,
      vault_pda: built.vaultPda,
      trax_mint: built.traxMint,
      recent_blockhash: built.recentBlockhash,
      last_valid_block_height: built.lastValidBlockHeight,
    });
  } catch (err) {
    console.error('POST /api/deposit/prepare error:', err);
    res.status(500).json({ error: 'Failed to prepare deposit' });
  }
}

router.post('/prepare', validate(depositSchema), prepareDepositHandler);
router.post('/', validate(depositSchema), prepareDepositHandler);

// ---------------------------------------------------------------------------
// POST /api/deposit/confirm
//
// Called after the user's wallet signs + submits the transaction and the RPC
// confirms. Verifies the signature landed on-chain and writes the DB rows
// (position + transaction) with the real tx_signature.
//
// Body: { bundle_id, wallet_address, amount_usdc, signature, tokens_minted,
//         issue_price, fee_usdc }
// Frontend should pass `tokens_minted` / `fee_usdc` from the prepare response
// so we don't double-compute.
// ---------------------------------------------------------------------------
router.post('/confirm', async (req: Request, res: Response) => {
  try {
    const {
      bundle_id,
      wallet_address,
      amount_usdc,
      signature,
      tokens_minted,
      issue_price,
      fee_usdc,
    } = req.body as {
      bundle_id: string;
      wallet_address: string;
      amount_usdc: number;
      signature: string;
      tokens_minted: number;
      issue_price: number;
      fee_usdc: number;
    };

    if (!signature) return res.status(400).json({ error: 'signature required' });

    const confirmed = await confirmTransaction(signature);
    if (!confirmed) {
      return res.status(400).json({ error: 'Transaction has not confirmed yet' });
    }

    const position = await createPosition({
      bundle_id,
      wallet_address,
      tokens_held: tokens_minted,
      entry_price: issue_price,
      deposited_usdc: amount_usdc,
    });
    if (!position) return res.status(500).json({ error: 'Failed to create position' });

    const transaction = await createTransaction({
      bundle_id,
      wallet_address,
      type: 'deposit',
      amount_usdc,
      tokens: tokens_minted,
      fee_usdc,
      tx_signature: signature,
    });
    if (!transaction) return res.status(500).json({ error: 'Failed to create transaction' });

    // Mirror signature onto the new onchain column if the migration is applied.
    await supabase
      .from('transactions')
      .update({ onchain_tx_signature: signature })
      .eq('id', transaction.id);

    const result: DepositResponse = {
      transaction_id: transaction.id,
      bundle_id,
      tokens_minted,
      issue_price,
      fee_usdc,
      net_usdc: amount_usdc - fee_usdc,
    };
    res.status(201).json(result);
  } catch (err) {
    console.error('POST /api/deposit/confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm deposit' });
  }
});

// ---------------------------------------------------------------------------
// Redeem — same two-step pattern.
// ---------------------------------------------------------------------------

router.post('/redeem/prepare', validate(redeemSchema), async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address, amount_tokens: amountTokensOverride } = req.body as {
      bundle_id: string;
      wallet_address: string;
      amount_tokens?: number;
    };
    const bundle = await getBundleById(bundle_id);
    if (!bundle) return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });

    // Prefer on-chain finalization check if available; fall back to DB status.
    const onchain = await getVaultState(bundle_id);
    if (onchain && onchain.state !== 'finalized') {
      return res.status(400).json({
        error: `Onchain vault is not finalized (state: ${onchain.state}). All legs must resolve first.`,
      });
    }
    if (!onchain && bundle.status !== 'resolved') {
      return res.status(400).json({
        error: `Bundle is not resolved (status: ${bundle.status}).`,
      });
    }

    const positions = await getPositionsByWalletAndBundle(wallet_address, bundle_id);
    if (positions.length === 0) {
      return res.status(404).json({
        error: `No positions found for wallet ${wallet_address} in bundle ${bundle_id}`,
      });
    }
    const totalTokens = positions.reduce((s, p) => s + p.tokens_held, 0);
    if (totalTokens <= 0) return res.status(400).json({ error: 'No tokens to redeem' });

    const redeemTokens =
      amountTokensOverride != null && amountTokensOverride > 0 && amountTokensOverride <= totalTokens
        ? amountTokensOverride
        : totalTokens;

    const amountBaseUnits = BigInt(Math.round(redeemTokens * 1_000_000));
    const built = await buildRedeemTx(
      new PublicKey(wallet_address),
      bundle_id,
      amountBaseUnits,
    );

    const expectedUsdcUi = Number(built.expectedUsdc) / 1_000_000;

    res.status(200).json({
      kind: 'prepared',
      bundle_id,
      wallet_address,
      total_tokens: redeemTokens,
      expected_usdc: expectedUsdcUi,
      transaction_base64: built.transactionBase64,
      vault_pda: built.vaultPda,
      trax_mint: built.traxMint,
      recent_blockhash: built.recentBlockhash,
      last_valid_block_height: built.lastValidBlockHeight,
    });
  } catch (err) {
    console.error('POST /api/deposit/redeem/prepare error:', err);
    res.status(500).json({ error: 'Failed to prepare redeem' });
  }
});

router.post('/redeem/confirm', async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address, signature, expected_usdc, tokens_redeemed } = req.body as {
      bundle_id: string;
      wallet_address: string;
      signature: string;
      expected_usdc: number;
      tokens_redeemed?: number;
    };

    const confirmed = await confirmTransaction(signature);
    if (!confirmed) return res.status(400).json({ error: 'Transaction has not confirmed yet' });

    const positions = await getPositionsByWalletAndBundle(wallet_address, bundle_id);
    const totalTokens = positions.reduce((s, p) => s + p.tokens_held, 0);

    const toDeduct =
      tokens_redeemed != null && tokens_redeemed > 0 && tokens_redeemed <= totalTokens
        ? tokens_redeemed
        : totalTokens;

    // Deduct tokens from positions (most-recent first, as returned by the query).
    let remaining = toDeduct;
    for (const p of positions) {
      if (remaining <= 0) break;
      const deduct = Math.min(p.tokens_held, remaining);
      await updatePositionTokens(p.id, p.tokens_held - deduct);
      remaining -= deduct;
    }

    const tx = await createTransaction({
      bundle_id,
      wallet_address,
      type: 'redemption',
      amount_usdc: expected_usdc,
      tokens: toDeduct,
      fee_usdc: 0,
      tx_signature: signature,
    });

    if (tx) {
      await supabase
        .from('transactions')
        .update({ onchain_tx_signature: signature })
        .eq('id', tx.id);
    }

    res.status(200).json({
      wallet_address,
      bundle_id,
      total_tokens: toDeduct,
      payout_usdc: expected_usdc,
      transaction_id: tx?.id,
    });
  } catch (err) {
    console.error('POST /api/deposit/redeem/confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm redeem' });
  }
});

// Legacy /redeem endpoint — kept as an alias to /redeem/prepare for clients that
// haven't migrated. Returns the prepared tx instead of doing a DB-only redeem.
router.post('/redeem', validate(redeemSchema), (req: Request, res: Response) => {
  req.url = '/redeem/prepare';
  (router as any).handle(req, res);
});

// ---------------------------------------------------------------------------
// Portfolio + transaction history — unchanged from the original stub-backed
// implementation; the DB rows are authoritative for historical PnL queries.
// ---------------------------------------------------------------------------

router.get('/portfolio/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const positions = await getPositionsByWallet(walletAddress);

    if (positions.length === 0) {
      return res.json({ wallet_address: walletAddress, positions: [], total_value: 0, total_pnl: 0 });
    }

    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const bundle = await getBundleById(pos.bundle_id);
        let currentNav: number;
        if (bundle?.status === 'active') {
          const navResult = await getLiveNAV(pos.bundle_id);
          currentNav = navResult?.nav ?? pos.entry_price;
        } else {
          const legs = await getLegsByBundleId(pos.bundle_id);
          currentNav = legs.length > 0 ? calculateNAV(legs, pos.bundle_id).nav : pos.entry_price;
        }
        const currentValue = pos.tokens_held * currentNav;
        const unrealizedPnl = currentValue - pos.deposited_usdc;

        return {
          position_id: pos.id,
          bundle_id: pos.bundle_id,
          bundle_name: bundle?.name ?? 'Unknown',
          bundle_status: bundle?.status ?? 'unknown',
          risk_tier: bundle?.risk_tier ?? 0,
          resolution_date: bundle?.resolution_date ?? null,
          tokens_held: pos.tokens_held,
          entry_price: pos.entry_price,
          deposited_usdc: pos.deposited_usdc,
          current_nav: currentNav,
          current_value: currentValue,
          unrealized_pnl: unrealizedPnl,
          pnl_percent:
            pos.deposited_usdc > 0 ? (unrealizedPnl / pos.deposited_usdc) * 100 : 0,
          created_at: pos.created_at,
        };
      })
    );

    const totalValue = enriched.reduce((s, p) => s + p.current_value, 0);
    const totalPnl = enriched.reduce((s, p) => s + p.unrealized_pnl, 0);
    const totalDeposited = enriched.reduce((s, p) => s + p.deposited_usdc, 0);

    res.json({
      wallet_address: walletAddress,
      positions: enriched,
      total_value: totalValue,
      total_deposited: totalDeposited,
      total_pnl: totalPnl,
      total_pnl_percent: totalDeposited > 0 ? (totalPnl / totalDeposited) * 100 : 0,
    });
  } catch (err) {
    console.error('GET /api/deposit/portfolio/:walletAddress error:', err);
    res.status(500).json({ error: 'Failed to fetch portfolio' });
  }
});

router.get('/transactions/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const transactions = await getTransactionsByWallet(walletAddress);

    const enriched = await Promise.all(
      transactions.map(async (tx) => {
        const bundle = await getBundleById(tx.bundle_id);
        return {
          id: tx.id,
          bundle_id: tx.bundle_id,
          bundle_name: bundle?.name ?? 'Unknown',
          type: tx.type,
          amount_usdc: tx.amount_usdc,
          tokens: tx.tokens,
          fee_usdc: tx.fee_usdc,
          tx_signature: tx.tx_signature,
          created_at: tx.created_at,
        };
      })
    );

    res.json({
      wallet_address: walletAddress,
      count: enriched.length,
      transactions: enriched,
    });
  } catch (err) {
    console.error('GET /api/deposit/transactions/:walletAddress error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export const depositRoutes = router;
