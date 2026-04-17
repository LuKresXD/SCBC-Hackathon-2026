import { Router, Request, Response } from 'express';

const router = Router();

/**
 * POST /api/webhook/helius
 * Helius webhook handler for Solana on-chain events.
 * Configure Helius to POST here when relevant transactions occur.
 *
 * Event types we care about:
 * - TOKEN_MINT: new tokens minted for a bundle
 * - TOKEN_BURN: tokens burned during redemption
 * - TRANSFER: token transfers between wallets
 */
router.post('/helius', async (req: Request, res: Response) => {
  try {
    const events = req.body;

    if (!Array.isArray(events)) {
      return res.status(400).json({ error: 'Expected array of webhook events' });
    }

    let processed = 0;
    for (const event of events) {
      try {
        const { type, description, signature } = event;
        console.log(`[webhook] Helius event: type=${type}, sig=${signature}, desc=${description}`);

        // TODO: Process different event types
        // - On TOKEN_MINT: verify against our DB records
        // - On TOKEN_BURN: verify redemption was processed
        // - On TRANSFER: update position records if needed

        processed++;
      } catch (err) {
        console.error('[webhook] Failed to process event:', err);
      }
    }

    res.json({ processed, total: events.length });
  } catch (err) {
    console.error('POST /api/webhook/helius error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * GET /api/webhook/health
 * Helius can ping this to verify the webhook endpoint is alive.
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'helius-webhook' });
});

export const webhookRoutes = router;
