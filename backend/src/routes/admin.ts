import { Router, Request, Response } from 'express';
import {
  getAllBundles,
  getBundleById,
  updateBundleStatus,
  getAllPositions,
  getAllTransactions,
  getAllLegs,
  getTransactionStats,
} from '../db/queries';

const router = Router();

/**
 * GET /api/admin/stats
 * Platform-level statistics: bundle counts, position/transaction totals, USDC flows.
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const [bundles, legs, positions, txStats] = await Promise.all([
      getAllBundles(),
      getAllLegs(),
      getAllPositions(),
      getTransactionStats(),
    ]);

    // Also need raw transactions for total count
    const transactions = await getAllTransactions();

    res.json({
      total_bundles: bundles.length,
      active_bundles: bundles.filter((b) => b.status === 'active').length,
      resolved_bundles: bundles.filter((b) => b.status === 'resolved').length,
      total_legs: legs.length,
      total_positions: positions.length,
      total_transactions: transactions.length,
      total_deposited_usdc: txStats.total_deposited,
      total_redeemed_usdc: txStats.total_redeemed,
      total_fees_collected: txStats.total_fees,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('GET /api/admin/stats error:', err);
    res.status(500).json({ error: 'Failed to fetch platform stats' });
  }
});

/**
 * POST /api/admin/bundles/:id/cancel
 * Cancel an active bundle. Sets status to 'cancelled'.
 */
router.post('/bundles/:id/cancel', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const bundle = await getBundleById(id);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${id}` });
    }
    if (bundle.status !== 'active') {
      return res.status(400).json({ error: `Bundle is not active (status: ${bundle.status})` });
    }

    const updated = await updateBundleStatus(id, 'cancelled');
    if (!updated) {
      return res.status(500).json({ error: 'Failed to cancel bundle' });
    }

    res.json(updated);
  } catch (err) {
    console.error('POST /api/admin/bundles/:id/cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel bundle' });
  }
});

/**
 * GET /api/admin/transactions
 * List all transactions with optional filters.
 * Query params: wallet, type (deposit|redemption), limit (default 50)
 */
router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const { wallet, type, limit } = req.query;

    const parsedLimit = limit ? parseInt(limit as string, 10) : 50;
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return res.status(400).json({ error: 'limit must be a positive integer' });
    }

    if (type && !['deposit', 'redemption', 'transfer'].includes(type as string)) {
      return res.status(400).json({ error: 'type must be deposit, redemption, or transfer' });
    }

    const transactions = await getAllTransactions({
      wallet: wallet as string | undefined,
      type: type as string | undefined,
      limit: parsedLimit,
    });

    res.json({
      count: transactions.length,
      transactions,
    });
  } catch (err) {
    console.error('GET /api/admin/transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

export const adminRoutes = router;
