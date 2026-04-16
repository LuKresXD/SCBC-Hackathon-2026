import { Router, Request, Response } from 'express';
import { getLiveNAV } from '../services/pricing';
import { getPositionsByWallet } from '../db/queries';

const router = Router();

const NAV_INTERVAL_MS = 30_000; // 30 seconds

/**
 * GET /api/sse/nav/:bundleId
 * Server-Sent Events stream for live NAV updates.
 * Sends initial NAV immediately, then refreshes every 30 seconds.
 */
router.get('/nav/:bundleId', async (req: Request, res: Response) => {
  const { bundleId } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
  res.flushHeaders();

  const sendNAV = async () => {
    try {
      const navResult = await getLiveNAV(bundleId);
      if (navResult) {
        const payload = {
          nav: navResult.nav,
          legs: navResult.legs,
          timestamp: navResult.timestamp,
        };
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      }
    } catch (err) {
      console.error(`SSE nav error for bundle ${bundleId}:`, err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to fetch NAV' })}\n\n`);
    }
  };

  // Send initial NAV immediately
  await sendNAV();

  // Then refresh every 30 seconds
  const interval = setInterval(sendNAV, NAV_INTERVAL_MS);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

/**
 * GET /api/sse/portfolio/:walletAddress
 * Server-Sent Events stream for portfolio value updates.
 * Recalculates all positions for the wallet every 30 seconds.
 */
router.get('/portfolio/:walletAddress', async (req: Request, res: Response) => {
  const { walletAddress } = req.params;

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const sendPortfolio = async () => {
    try {
      const positions = await getPositionsByWallet(walletAddress);

      // Calculate current value for each position
      const positionValues = await Promise.allSettled(
        positions.map(async (pos) => {
          const navResult = await getLiveNAV(pos.bundle_id);
          const currentNav = navResult?.nav ?? 0;
          const currentValue = pos.tokens_held * currentNav;
          const pnl = currentValue - pos.deposited_usdc;

          return {
            bundle_id: pos.bundle_id,
            tokens_held: pos.tokens_held,
            entry_price: pos.entry_price,
            deposited_usdc: pos.deposited_usdc,
            current_nav: currentNav,
            current_value: currentValue,
            pnl,
          };
        })
      );

      const resolved = positionValues
        .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
        .map((r) => r.value);

      const totalDeposited = resolved.reduce((sum, p) => sum + p.deposited_usdc, 0);
      const totalCurrentValue = resolved.reduce((sum, p) => sum + p.current_value, 0);
      const totalPnl = totalCurrentValue - totalDeposited;

      const payload = {
        wallet_address: walletAddress,
        positions: resolved,
        total_deposited: totalDeposited,
        total_current_value: totalCurrentValue,
        total_pnl: totalPnl,
        timestamp: new Date().toISOString(),
      };

      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (err) {
      console.error(`SSE portfolio error for wallet ${walletAddress}:`, err);
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Failed to fetch portfolio' })}\n\n`);
    }
  };

  // Send initial portfolio immediately
  await sendPortfolio();

  // Then refresh every 30 seconds
  const interval = setInterval(sendPortfolio, NAV_INTERVAL_MS);

  // Clean up on client disconnect
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});

export const sseRoutes = router;
