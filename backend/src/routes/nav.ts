import { Router, Request, Response } from 'express';
import { getLiveNAV } from '../services/pricing';

const router = Router();

/**
 * GET /api/nav/:bundleId
 * Get live NAV for a bundle. Fetches latest Polymarket prices,
 * updates DB, returns full NAV breakdown with per-leg contributions.
 */
router.get('/:bundleId', async (req: Request, res: Response) => {
  try {
    const { bundleId } = req.params;
    const navResult = await getLiveNAV(bundleId);

    if (!navResult) {
      return res.status(404).json({ error: `Bundle not found or has no legs: ${bundleId}` });
    }

    res.json(navResult);
  } catch (err) {
    console.error('GET /api/nav/:bundleId error:', err);
    res.status(500).json({ error: 'Failed to calculate NAV' });
  }
});

/**
 * GET /api/nav/:bundleId/history
 * Placeholder: returns current NAV snapshot.
 * TODO: add time-series NAV tracking for historical charts.
 */
router.get('/:bundleId/history', async (req: Request, res: Response) => {
  try {
    const { bundleId } = req.params;
    const navResult = await getLiveNAV(bundleId);

    if (!navResult) {
      return res.status(404).json({ error: `Bundle not found or has no legs: ${bundleId}` });
    }

    // Return as single-element array for future compatibility
    // when we add actual historical tracking
    res.json({
      bundle_id: bundleId,
      history: [navResult],
    });
  } catch (err) {
    console.error('GET /api/nav/:bundleId/history error:', err);
    res.status(500).json({ error: 'Failed to fetch NAV history' });
  }
});

export const navRoutes = router;
