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
import { analyzeDiversification } from '../services/analytics';
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
 * GET /api/bundles/compare
 * Compare multiple bundles side-by-side.
 * Query param: ?ids=uuid1,uuid2,uuid3 (comma-separated, max 5)
 * Must be defined BEFORE /:id to avoid route conflict.
 */
router.get('/compare', async (req: Request, res: Response) => {
  try {
    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      return res.status(400).json({ error: 'ids query parameter is required (comma-separated UUIDs)' });
    }

    const ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return res.status(400).json({ error: 'At least one bundle ID is required' });
    }
    if (ids.length > 5) {
      return res.status(400).json({ error: 'Maximum 5 bundles can be compared at once' });
    }

    const results = await Promise.all(
      ids.map(async (id) => {
        const bundleWithLegs = await getBundleWithLegs(id);
        if (!bundleWithLegs) return null;

        const navResult = await getLiveNAV(id);
        const currentNav = navResult?.nav ?? bundleWithLegs.nav;

        const activeLegs = bundleWithLegs.legs.filter((l) => l.status === 'active');
        const avgProbability = activeLegs.length > 0
          ? activeLegs.reduce((sum, l) => sum + l.probability, 0) / activeLegs.length
          : 0;

        const resDate = new Date(bundleWithLegs.resolution_date);
        const now = new Date();
        const daysToResolution = Math.max(0, Math.ceil((resDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        const navChangePercent = bundleWithLegs.issue_price > 0
          ? ((currentNav - bundleWithLegs.issue_price) / bundleWithLegs.issue_price) * 100
          : 0;

        return {
          id: bundleWithLegs.id,
          name: bundleWithLegs.name,
          risk_tier: bundleWithLegs.risk_tier,
          status: bundleWithLegs.status,
          issue_price: bundleWithLegs.issue_price,
          current_nav: Math.round(currentNav * 10000) / 10000,
          nav_change_percent: Math.round(navChangePercent * 100) / 100,
          num_legs: bundleWithLegs.num_legs,
          resolved_legs: bundleWithLegs.resolved_legs,
          avg_probability: Math.round(avgProbability * 10000) / 10000,
          days_to_resolution: daysToResolution,
          resolution_date: bundleWithLegs.resolution_date,
        };
      })
    );

    const bundles = results.filter((b) => b !== null);
    if (bundles.length === 0) {
      return res.status(404).json({ error: 'No bundles found for the provided IDs' });
    }

    // Build comparison summary
    const comparison = {
      highest_nav: bundles.reduce((best, b) => (b.current_nav > best.current_nav ? b : best), bundles[0]).name,
      lowest_risk: bundles.reduce((best, b) => (b.risk_tier < best.risk_tier ? b : best), bundles[0]).name,
      most_resolved: bundles.reduce((best, b) => (b.resolved_legs > best.resolved_legs ? b : best), bundles[0]).name,
      best_performance: bundles.reduce((best, b) => (b.nav_change_percent > best.nav_change_percent ? b : best), bundles[0]).name,
    };

    res.json({ bundles, comparison });
  } catch (err) {
    console.error('GET /api/bundles/compare error:', err);
    res.status(500).json({ error: 'Failed to compare bundles' });
  }
});

/**
 * GET /api/bundles/:id/performance
 * Rich performance metrics for a bundle including risk analysis.
 */
router.get('/:id/performance', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bundle = await getBundleById(id);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

    const legs = await getLegsByBundleId(id);
    if (legs.length === 0) return res.status(404).json({ error: 'No legs found' });

    const navResult = await getLiveNAV(id);
    const currentNav = navResult?.nav ?? 0;

    // Calculate metrics
    const activeLegs = legs.filter(l => l.status === 'active');
    const wonLegs = legs.filter(l => l.status === 'won');
    const lostLegs = legs.filter(l => l.status === 'lost');

    // Probability distribution stats for active legs
    const activeProbs = activeLegs.map(l => l.probability);
    const avgProb = activeProbs.length > 0 ? activeProbs.reduce((s, p) => s + p, 0) / activeProbs.length : 0;
    const minProb = activeProbs.length > 0 ? Math.min(...activeProbs) : 0;
    const maxProb = activeProbs.length > 0 ? Math.max(...activeProbs) : 0;

    // Spread (max - min probability) - lower = more correlated
    const spread = maxProb - minProb;

    // Standard deviation of probabilities
    const variance = activeProbs.length > 0
      ? activeProbs.reduce((s, p) => s + Math.pow(p - avgProb, 2), 0) / activeProbs.length
      : 0;
    const stdDev = Math.sqrt(variance);

    // NAV vs issue price change
    const navChange = currentNav - bundle.issue_price;
    const navChangePercent = bundle.issue_price > 0 ? (navChange / bundle.issue_price) * 100 : 0;

    // Resolution progress
    const resolvedCount = wonLegs.length + lostLegs.length;
    const resolutionProgress = legs.length > 0 ? resolvedCount / legs.length : 0;

    // Weighted win rate (of resolved legs only)
    const resolvedWeight = [...wonLegs, ...lostLegs].reduce((s, l) => s + l.weight, 0);
    const wonWeight = wonLegs.reduce((s, l) => s + l.weight, 0);
    const weightedWinRate = resolvedWeight > 0 ? wonWeight / resolvedWeight : null;

    // Days to resolution
    const resDate = new Date(bundle.resolution_date);
    const now = new Date();
    const daysToResolution = Math.max(0, Math.ceil((resDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Risk score: simple heuristic based on tier and NAV vs issue
    const riskMultiplier = bundle.risk_tier === 90 ? 0.5 : bundle.risk_tier === 70 ? 1.0 : 1.5;
    const riskScore = Math.min(10, Math.max(1, Math.round(riskMultiplier * (1 + stdDev * 10) * 10) / 10));

    res.json({
      bundle_id: id,
      bundle_name: bundle.name,
      risk_tier: bundle.risk_tier,
      status: bundle.status,
      current_nav: currentNav,
      issue_price: bundle.issue_price,
      nav_change: Math.round(navChange * 10000) / 10000,
      nav_change_percent: Math.round(navChangePercent * 100) / 100,
      legs_summary: {
        total: legs.length,
        active: activeLegs.length,
        won: wonLegs.length,
        lost: lostLegs.length,
        resolution_progress: Math.round(resolutionProgress * 100) / 100,
        weighted_win_rate: weightedWinRate !== null ? Math.round(weightedWinRate * 100) / 100 : null,
      },
      probability_stats: {
        average: Math.round(avgProb * 10000) / 10000,
        min: Math.round(minProb * 10000) / 10000,
        max: Math.round(maxProb * 10000) / 10000,
        spread: Math.round(spread * 10000) / 10000,
        std_dev: Math.round(stdDev * 10000) / 10000,
      },
      risk_score: riskScore,
      days_to_resolution: daysToResolution,
      resolution_date: bundle.resolution_date,
      created_at: bundle.created_at,
    });
  } catch (err) {
    console.error('GET /api/bundles/:id/performance error:', err);
    res.status(500).json({ error: 'Failed to calculate performance metrics' });
  }
});

/**
 * GET /api/bundles/:id/analysis
 * Diversification and risk analysis for a bundle's legs.
 */
router.get('/:id/analysis', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const bundle = await getBundleById(id);
    if (!bundle) return res.status(404).json({ error: 'Bundle not found' });

    const legs = await getLegsByBundleId(id);
    if (legs.length === 0) return res.status(404).json({ error: 'No legs found' });

    // Refresh probabilities first
    const navResult = await getLiveNAV(id);

    const analysis = analyzeDiversification(legs);

    res.json({
      bundle_id: id,
      bundle_name: bundle.name,
      risk_tier: bundle.risk_tier,
      current_nav: navResult?.nav ?? 0,
      analysis,
    });
  } catch (err) {
    console.error('GET /api/bundles/:id/analysis error:', err);
    res.status(500).json({ error: 'Failed to analyze bundle' });
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
