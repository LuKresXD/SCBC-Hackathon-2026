import { Router, Request, Response } from 'express';
import {
  getBundleById,
  createPosition,
  createTransaction,
  getPositionsByWallet,
  getLegsByBundleId,
} from '../db/queries';
import { getIssuePriceForBundle, getLiveNAV } from '../services/pricing';
import { config } from '../config';
import { DepositRequest, DepositResponse } from '../types';

const router = Router();

/**
 * POST /api/deposit
 * Record a deposit: calculate fees, mint tokens, create position + transaction.
 *
 * Body: { bundle_id, wallet_address, amount_usdc }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address, amount_usdc } = req.body as DepositRequest;

    // Validate required fields
    if (!bundle_id || !wallet_address || amount_usdc === undefined) {
      return res.status(400).json({
        error: 'Missing required fields: bundle_id, wallet_address, amount_usdc',
      });
    }

    if (typeof amount_usdc !== 'number' || amount_usdc <= 0) {
      return res.status(400).json({ error: 'amount_usdc must be a positive number' });
    }

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

export const depositRoutes = router;
