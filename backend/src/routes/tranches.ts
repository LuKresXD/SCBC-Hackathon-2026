import { Router, Request, Response } from "express";
import { getAllBundles, getBundleById, getLegsByBundleId } from "../db/queries";
import { calculateNAV } from "../services/nav";
import { quoteTranches } from "../services/tranching";

const router = Router();

/**
 * GET /api/tranches
 * Lists every active bundle with its senior/mezz/junior quote.
 *
 * Returns compact rows suitable for the front-end tranche index page.
 */
router.get("/", async (_req: Request, res: Response) => {
  try {
    const bundles = await getAllBundles();
    const rows = await Promise.all(
      bundles.map(async (b) => {
        const legs = await getLegsByBundleId(b.id);
        const nav = legs.length > 0 ? calculateNAV(legs, b.id).nav : b.issue_price;
        const daysLeft = Math.max(
          1,
          Math.ceil((new Date(b.resolution_date).getTime() - Date.now()) / 86_400_000),
        );
        const tranches = quoteTranches({
          bundleNav: nav,
          totalLegs: legs.length || 10,
          horizonDays: daysLeft,
        });
        return {
          bundle_id: b.id,
          bundle_name: b.name,
          risk_tier: b.risk_tier,
          bundle_nav: nav,
          resolution_date: b.resolution_date,
          days_to_resolution: daysLeft,
          total_legs: legs.length,
          tranches,
        };
      }),
    );
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error("GET /api/tranches error:", err);
    res.status(500).json({ error: "Failed to build tranche list" });
  }
});

/**
 * GET /api/tranches/:bundleId
 * Full tranche detail for one bundle, including waterfall explanation.
 */
router.get("/:bundleId", async (req: Request, res: Response) => {
  try {
    const { bundleId } = req.params;
    const bundle = await getBundleById(bundleId);
    if (!bundle) return res.status(404).json({ error: "Bundle not found" });
    const legs = await getLegsByBundleId(bundleId);
    const nav = legs.length > 0 ? calculateNAV(legs, bundleId).nav : bundle.issue_price;
    const daysLeft = Math.max(
      1,
      Math.ceil((new Date(bundle.resolution_date).getTime() - Date.now()) / 86_400_000),
    );
    const tranches = quoteTranches({
      bundleNav: nav,
      totalLegs: legs.length || 10,
      horizonDays: daysLeft,
    });
    res.json({
      bundle_id: bundle.id,
      bundle_name: bundle.name,
      risk_tier: bundle.risk_tier,
      bundle_nav: nav,
      resolution_date: bundle.resolution_date,
      days_to_resolution: daysLeft,
      total_legs: legs.length,
      tranches,
      waterfall_explainer: {
        senior: "Pays first out of basket payout up to 60% of face. Highest certainty.",
        mezzanine: "Pays from 60% to 85% of basket payout. Medium risk, medium return.",
        junior: "Pays from 85% to 100%. Absorbs first losses, highest upside.",
      },
    });
  } catch (err) {
    console.error("GET /api/tranches/:bundleId error:", err);
    res.status(500).json({ error: "Failed to fetch tranche detail" });
  }
});

export const trancheRoutes = router;
