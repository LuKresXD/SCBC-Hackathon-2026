import { Router, Request, Response } from 'express';
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
import { DepositRequest, DepositResponse } from '../types';
import { validate, depositSchema, redeemSchema } from '../utils/validation';

const router = Router();

/**
 * POST /api/deposit
 * Record a deposit: calculate fees, mint tokens, create position + transaction.
 *
 * Body: { bundle_id, wallet_address, amount_usdc }
 */
router.post('/', validate(depositSchema), async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address, amount_usdc } = req.body as DepositRequest;

    // Fetch bundle
    const bundle = await getBundleById(bundle_id);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    }

    if (bundle.status !== 'active') {
      return res.status(400).json({ error: `Bundle is not active (status: ${bundle.status})` });
    }

    // Get current issue price (live NAV)
    const issuePrice = await getIssuePriceForBundle(bundle_id);
    if (!issuePrice || issuePrice <= 0) {
      return res.status(500).json({ error: 'Unable to determine issue price' });
    }

    // Calculate fees and tokens
    const feeUsdc = amount_usdc * config.structuringFee;
    const netUsdc = amount_usdc - feeUsdc;
    const tokensMinted = netUsdc / issuePrice;

    // Create position record
    const position = await createPosition({
      bundle_id,
      wallet_address,
      tokens_held: tokensMinted,
      entry_price: issuePrice,
      deposited_usdc: amount_usdc,
    });

    if (!position) {
      return res.status(500).json({ error: 'Failed to create position' });
    }

    // Create transaction record
    const transaction = await createTransaction({
      bundle_id,
      wallet_address,
      type: 'deposit',
      amount_usdc,
      tokens: tokensMinted,
      fee_usdc: feeUsdc,
    });

    if (!transaction) {
      return res.status(500).json({ error: 'Failed to create transaction' });
    }

    const result: DepositResponse = {
      transaction_id: transaction.id,
      bundle_id,
      tokens_minted: tokensMinted,
      issue_price: issuePrice,
      fee_usdc: feeUsdc,
      net_usdc: netUsdc,
    };

    res.status(201).json(result);
  } catch (err) {
    console.error('POST /api/deposit error:', err);
    res.status(500).json({ error: 'Failed to process deposit' });
  }
});

/**
 * POST /api/deposit/redeem
 * Redeem tokens from a fully resolved bundle. Calculates payout based on final NAV.
 *
 * Body: { bundle_id, wallet_address }
 */
router.post('/redeem', validate(redeemSchema), async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address } = req.body;

    // Fetch bundle
    const bundle = await getBundleById(bundle_id);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    }

    if (bundle.status !== 'resolved') {
      return res.status(400).json({
        error: `Bundle is not resolved yet (status: ${bundle.status}). All legs must resolve before redemption.`,
      });
    }

    // Fetch positions for this wallet + bundle
    const positions = await getPositionsByWalletAndBundle(wallet_address, bundle_id);
    if (positions.length === 0) {
      return res.status(404).json({
        error: `No positions found for wallet ${wallet_address} in bundle ${bundle_id}`,
      });
    }

    // Fetch legs and verify full resolution
    const legs = await getLegsByBundleId(bundle_id);
    if (!isFullyResolved(legs)) {
      return res.status(400).json({
        error: 'Not all legs are resolved. Redemption requires every leg to have a final outcome.',
      });
    }

    // Calculate final NAV
    const navResult = calculateNAV(legs, bundle_id);
    const finalNav = navResult.nav;

    // Sum total tokens across all positions for this wallet + bundle
    const totalTokens = positions.reduce((sum, pos) => sum + pos.tokens_held, 0);

    if (totalTokens <= 0) {
      return res.status(400).json({ error: 'No tokens available for redemption (already redeemed?)' });
    }

    // Payout = total tokens * final NAV
    const payoutUsdc = Math.round(totalTokens * finalNav * 1_000_000) / 1_000_000;

    // Burn tokens: set each position's tokens_held to 0
    await Promise.all(
      positions.map((pos) => updatePositionTokens(pos.id, 0))
    );

    // Create redemption transaction
    const transaction = await createTransaction({
      bundle_id,
      wallet_address,
      type: 'redemption',
      amount_usdc: payoutUsdc,
      tokens: totalTokens,
      fee_usdc: 0,
    });

    if (!transaction) {
      return res.status(500).json({ error: 'Failed to create redemption transaction' });
    }

    res.status(200).json({
      wallet_address,
      bundle_id,
      bundle_name: bundle.name,
      total_tokens: totalTokens,
      final_nav: finalNav,
      payout_usdc: payoutUsdc,
      transaction_id: transaction.id,
    });
  } catch (err) {
    console.error('POST /api/deposit/redeem error:', err);
    res.status(500).json({ error: 'Failed to process redemption' });
  }
});

/**
 * GET /api/deposit/portfolio/:walletAddress
 * Get all positions for a wallet with current NAV values and PnL.
 */
router.get('/portfolio/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const positions = await getPositionsByWallet(walletAddress);

    if (positions.length === 0) {
      return res.json({ wallet_address: walletAddress, positions: [], total_value: 0, total_pnl: 0 });
    }

    // Enrich each position with bundle info and current NAV
    const enriched = await Promise.all(
      positions.map(async (pos) => {
        const bundle = await getBundleById(pos.bundle_id);
        const navResult = await getLiveNAV(pos.bundle_id);

        const currentNav = navResult?.nav ?? pos.entry_price;
        const currentValue = pos.tokens_held * currentNav;
        const unrealizedPnl = currentValue - pos.deposited_usdc;

        return {
          position_id: pos.id,
          bundle_id: pos.bundle_id,
          bundle_name: bundle?.name ?? 'Unknown',
          bundle_status: bundle?.status ?? 'unknown',
          risk_tier: bundle?.risk_tier ?? 0,
          tokens_held: pos.tokens_held,
          entry_price: pos.entry_price,
          deposited_usdc: pos.deposited_usdc,
          current_nav: currentNav,
          current_value: currentValue,
          unrealized_pnl: unrealizedPnl,
          pnl_percent: pos.deposited_usdc > 0
            ? (unrealizedPnl / pos.deposited_usdc) * 100
            : 0,
          created_at: pos.created_at,
        };
      })
    );

    const totalValue = enriched.reduce((sum, p) => sum + p.current_value, 0);
    const totalPnl = enriched.reduce((sum, p) => sum + p.unrealized_pnl, 0);
    const totalDeposited = enriched.reduce((sum, p) => sum + p.deposited_usdc, 0);

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

/**
 * GET /api/deposit/transactions/:walletAddress
 * Get transaction history for a wallet, enriched with bundle names.
 */
router.get('/transactions/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const transactions = await getTransactionsByWallet(walletAddress);

    // Enrich each transaction with bundle name
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
