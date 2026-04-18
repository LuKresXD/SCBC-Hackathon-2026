import { Router, Request, Response } from "express";
import {
  snapshot,
  deposit,
  withdraw,
  borrow,
  repay,
  maxBorrow,
  CollateralKind,
  TrancheKind,
} from "../services/lending";

const router = Router();

/**
 * GET /api/lending
 * Pool snapshot: total deposits, borrows, utilization, borrow/supply APY,
 * LTV table for every collateral class.
 */
router.get("/", (_req: Request, res: Response) => {
  res.json(snapshot());
});

/**
 * POST /api/lending/quote
 * body: { kind: 'basket'|'tranche', tier?: 90|70|50, trancheKind?, collateralValueUsd }
 */
router.post("/quote", (req: Request, res: Response) => {
  const { kind, tier, trancheKind, collateralValueUsd } = req.body as {
    kind: CollateralKind;
    tier?: 90 | 70 | 50;
    trancheKind?: TrancheKind;
    collateralValueUsd: number;
  };
  if (!kind || !Number.isFinite(collateralValueUsd) || collateralValueUsd <= 0) {
    return res.status(400).json({ error: "kind and positive collateralValueUsd required" });
  }
  const q = maxBorrow({ kind, tier, trancheKind, collateralValueUsd });
  res.json({ ...q, pool: snapshot() });
});

/** POST /api/lending/lend   body: { amount } */
router.post("/lend", (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount required" });
  res.json(deposit(amount));
});

/** POST /api/lending/withdraw   body: { amount } */
router.post("/withdraw", (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount required" });
  res.json(withdraw(amount));
});

/** POST /api/lending/borrow   body: { amount } */
router.post("/borrow", (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount required" });
  res.json(borrow(amount));
});

/** POST /api/lending/repay   body: { amount } */
router.post("/repay", (req: Request, res: Response) => {
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: "amount required" });
  res.json(repay(amount));
});

export const lendingRoutes = router;
