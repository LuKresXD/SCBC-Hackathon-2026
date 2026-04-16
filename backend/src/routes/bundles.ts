import { Router, Request, Response } from 'express';
import {
  getAllBundles,
  getBundleById,
  getBundleByName,
  getBundleWithLegs,
  createBundle,
  createLeg,
  getLegsByBundleId,
} from '../db/queries';
import { getLiveNAV } from '../services/pricing';
import { calculateNAV, calculateIssuePrice } from '../services/nav';
import { getMarketProbability } from '../services/polymarket';
import { Bundle, BundleWithLegs } from '../types';
import { validate, createBundleSchema } from '../utils/validation';

const router = Router();

/**
 * GET /api/bundles
 * List all bundles with current NAV.
 * Query params: risk_tier (90|70|50), status (active|resolved|cancelled)
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { risk_tier, status } = req.query;

    let bundles = await getAllBundles();

    // Filter by risk_tier
    if (risk_tier) {
      const tier = parseInt(risk_tier as string, 10);
      if (![90, 70, 50].includes(tier)) {
        return res.status(400).json({ error: 'risk_tier must be 90, 70, or 50' });
      }
      bundles = bundles.filter((b) => b.risk_tier === tier);
    }

    // Filter by status
    if (status) {
      const s = status as string;
      if (!['active', 'resolved', 'cancelled'].includes(s)) {
        return res.status(400).json({ error: 'status must be active, resolved, or cancelled' });
      }
      bundles = bundles.filter((b) => b.status === s);
    }

    // Enrich each bundle with legs and NAV
    const enriched: BundleWithLegs[] = await Promise.all(
      bundles.map(async (bundle) => {
        const legs = await getLegsByBundleId(bundle.id);
        const navResult = calculateNAV(legs, bundle.id);
        return {
          ...bundle,
          legs,
          nav: navResult.nav,
          num_legs: legs.length,
          resolved_legs: legs.filter((l) => l.status !== 'active').length,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    console.error('GET /api/bundles error:', err);
    res.status(500).json({ error: 'Failed to fetch bundles' });
  }
});

/**
 * GET /api/bundles/name/:name
 * Get bundle by name (e.g. "LK-90-0430").
 * Must be defined BEFORE /:id to avoid route conflict.
 */
router.get('/name/:name', async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const bundle = await getBundleByName(name);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${name}` });
    }

    const legs = await getLegsByBundleId(bundle.id);
    const navResult = calculateNAV(legs, bundle.id);

    const result: BundleWithLegs = {
      ...bundle,
      legs,
      nav: navResult.nav,
      num_legs: legs.length,
      resolved_legs: legs.filter((l) => l.status !== 'active').length,
    };

    res.json(result);
  } catch (err) {
    console.error('GET /api/bundles/name/:name error:', err);
    res.status(500).json({ error: 'Failed to fetch bundle by name' });
  }
});

/**
 * GET /api/bundles/:id
 * Get single bundle with all legs and current NAV.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bundleWithLegs = await getBundleWithLegs(id);
    if (!bundleWithLegs) {
      return res.status(404).json({ error: `Bundle not found: ${id}` });
    }

    res.json(bundleWithLegs);
  } catch (err) {
    console.error('GET /api/bundles/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch bundle' });
  }
});

/**
 * POST /api/bundles
 * Create a new bundle with legs. Admin endpoint (no auth for hackathon).
 *
 * Body: {
 *   name: string,
 *   risk_tier: 90 | 70 | 50,
 *   resolution_date: string (ISO date),
 *   description?: string,
 *   theme?: string,
 *   legs: [{
 *     market_id: string,
 *     question: string,
 *     weight?: number,
 *     polymarket_url?: string,
 *   }]
 * }
 */
router.post('/', validate(createBundleSchema), async (req: Request, res: Response) => {
  try {
    const { name, risk_tier, resolution_date, description, theme, legs } = req.body;

    // Fetch live probabilities for each leg
    const legProbabilities = await Promise.all(
      legs.map(async (leg: any) => {
        const prob = await getMarketProbability(leg.market_id);
        return prob ?? 0.5; // default to 0.5 if fetch fails
      })
    );

    // Assign equal weights if not specified
    const defaultWeight = 1 / legs.length;
    const legWeights = legs.map((leg: any) =>
      leg.weight !== undefined ? leg.weight : defaultWeight
    );

    // Calculate issue price from legs
    const issueLegs = legs.map((leg: any, i: number) => ({
      probability: legProbabilities[i],
      weight: legWeights[i],
    }));
    const issuePrice = calculateIssuePrice(
      issueLegs.map((l: { probability: number; weight: number }, i: number) => ({
        ...l,
        id: '',
        bundle_id: '',
        market_id: legs[i].market_id,
        question: legs[i].question,
        status: 'active' as const,
        created_at: '',
      }))
    );

    // Create bundle
    const bundle = await createBundle({
      name,
      risk_tier,
      resolution_date,
      issue_price: issuePrice,
      description: description || undefined,
      theme: theme || undefined,
    });

    if (!bundle) {
      return res.status(500).json({ error: 'Failed to create bundle' });
    }

    // Create legs
    const createdLegs = await Promise.all(
      legs.map(async (leg: any, i: number) => {
        const created = await createLeg({
          bundle_id: bundle.id,
          market_id: leg.market_id,
          question: leg.question,
          probability: legProbabilities[i],
          weight: legWeights[i],
          polymarket_url: leg.polymarket_url || undefined,
          resolution_value: undefined,
        });
        return created;
      })
    );

    const validLegs = createdLegs.filter((l) => l !== null);
    const navResult = calculateNAV(validLegs, bundle.id);

    const result: BundleWithLegs = {
      ...bundle,
      legs: validLegs,
      nav: navResult.nav,
      num_legs: validLegs.length,
      resolved_legs: 0,
    };

    res.status(201).json(result);
  } catch (err) {
    console.error('POST /api/bundles error:', err);
    res.status(500).json({ error: 'Failed to create bundle' });
  }
});

export const bundleRoutes = router;
