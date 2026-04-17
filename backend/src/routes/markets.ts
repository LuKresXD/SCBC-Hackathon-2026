import { Router, Request, Response } from 'express';
import {
  fetchMarkets,
  fetchMarketByConditionId,
  searchMarkets,
} from '../services/polymarket';

const router = Router();

/**
 * GET /api/markets
 * List available Polymarket markets.
 * Query params: limit (default 20), active (default true)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 20;
    const active = req.query.active !== 'false'; // default true

    const markets = await fetchMarkets({
      limit,
      active,
      closed: !active,
    });

    res.json({
      count: markets.length,
      markets,
    });
  } catch (err) {
    console.error('GET /api/markets error:', err);
    res.status(500).json({ error: 'Failed to fetch markets' });
  }
});

/**
 * GET /api/markets/search/:query
 * Search markets by text. Must be before /:conditionId to avoid route conflict.
 */
router.get('/search/:query', async (req: Request, res: Response) => {
  try {
    const { query } = req.params;
    const limit = parseInt(req.query.limit as string, 10) || 20;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const markets = await searchMarkets(query, limit);

    res.json({
      query,
      count: markets.length,
      markets,
    });
  } catch (err) {
    console.error('GET /api/markets/search/:query error:', err);
    res.status(500).json({ error: 'Failed to search markets' });
  }
});

/**
 * GET /api/markets/:conditionId
 * Get single market details by condition ID.
 */
router.get('/:conditionId', async (req: Request, res: Response) => {
  try {
    const { conditionId } = req.params;
    const market = await fetchMarketByConditionId(conditionId);

    if (!market) {
      return res.status(404).json({ error: `Market not found: ${conditionId}` });
    }

    res.json(market);
  } catch (err) {
    console.error('GET /api/markets/:conditionId error:', err);
    res.status(500).json({ error: 'Failed to fetch market' });
  }
});

export const marketRoutes = router;
