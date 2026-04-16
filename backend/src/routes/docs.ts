import { Router, Request, Response } from 'express';

const router = Router();

const apiDocs = {
  name: 'LuKres API',
  version: '1.0.0',
  description: 'Structured Prediction Market Products on Solana',
  base_url: '/api',
  endpoints: [
    {
      method: 'GET',
      path: '/api/health',
      description: 'Health check',
      response: '{ status: string, timestamp: string }',
    },
    {
      method: 'GET',
      path: '/api/docs',
      description: 'This endpoint. Returns full API documentation as JSON.',
      response: '{ name, version, description, base_url, endpoints[] }',
    },
    // Bundles
    {
      method: 'GET',
      path: '/api/bundles',
      description: 'List all bundles with current NAV, enriched with legs',
      query_params: [
        'risk_tier - filter by tier (90 | 70 | 50)',
        'status - filter by status (active | resolved | cancelled)',
      ],
      response: 'BundleWithLegs[] - each includes legs[], nav, num_legs, resolved_legs',
    },
    {
      method: 'GET',
      path: '/api/bundles/name/:name',
      description: 'Get bundle by name (e.g. LK-90-0430). Includes legs and NAV.',
      response: 'BundleWithLegs',
    },
    {
      method: 'GET',
      path: '/api/bundles/:id',
      description: 'Get single bundle by UUID with all legs and current NAV',
      response: 'BundleWithLegs',
    },
    {
      method: 'POST',
      path: '/api/bundles',
      description: 'Create a new bundle with legs. Fetches live Polymarket probabilities, calculates issue price, assigns equal weights if not specified.',
      body: {
        name: 'string (required) - e.g. LK-90-0430',
        risk_tier: 'number (required) - 90 | 70 | 50',
        resolution_date: 'string (required) - ISO date',
        description: 'string (optional)',
        theme: 'string (optional)',
        legs: [
          {
            market_id: 'string (required) - Polymarket condition ID',
            question: 'string (required)',
            weight: 'number (optional) - defaults to 1/num_legs',
            polymarket_url: 'string (optional)',
          },
        ],
      },
      response: 'BundleWithLegs (201 Created)',
    },
    // NAV
    {
      method: 'GET',
      path: '/api/nav/:bundleId',
      description: 'Get live NAV for a bundle. Fetches latest Polymarket prices, updates DB, returns full breakdown with per-leg contributions.',
      response: '{ bundle_id, nav, legs: [{ id, probability, weight, contribution }] }',
    },
    {
      method: 'GET',
      path: '/api/nav/:bundleId/history',
      description: 'NAV history for a bundle. Currently returns single snapshot; time-series tracking planned.',
      response: '{ bundle_id, history: [NAVResult] }',
    },
    // Deposit
    {
      method: 'POST',
      path: '/api/deposit',
      description: 'Record a deposit. Calculates fees (structuring fee), mints tokens at current NAV, creates position and transaction records.',
      body: {
        bundle_id: 'string (required) - UUID of bundle',
        wallet_address: 'string (required) - Solana wallet address',
        amount_usdc: 'number (required) - positive USDC amount',
      },
      response: '{ transaction_id, bundle_id, tokens_minted, issue_price, fee_usdc, net_usdc } (201 Created)',
    },
    {
      method: 'GET',
      path: '/api/deposit/portfolio/:walletAddress',
      description: 'Get all positions for a wallet with current NAV values, unrealized PnL, and total portfolio summary.',
      response: '{ wallet_address, positions: [{ position_id, bundle_id, bundle_name, tokens_held, entry_price, deposited_usdc, current_nav, current_value, unrealized_pnl, pnl_percent }], total_value, total_deposited, total_pnl, total_pnl_percent }',
    },
    // Markets
    {
      method: 'GET',
      path: '/api/markets',
      description: 'List available Polymarket markets',
      query_params: [
        'limit - max results (default 20)',
        'active - filter active markets (default true)',
      ],
      response: '{ count: number, markets: Market[] }',
    },
    {
      method: 'GET',
      path: '/api/markets/search/:query',
      description: 'Search Polymarket markets by text query',
      query_params: ['limit - max results (default 20)'],
      response: '{ query, count, markets: Market[] }',
    },
    {
      method: 'GET',
      path: '/api/markets/:conditionId',
      description: 'Get single market details by Polymarket condition ID',
      response: 'Market',
    },
    // Resolution
    {
      method: 'POST',
      path: '/api/nav/:bundleId/check-resolutions',
      description: 'Manually trigger resolution check for a bundle. Detects legs with prob >= 0.99 (won) or <= 0.01 (lost). Auto-updates bundle status to resolved when all legs resolve.',
      response: '{ bundle_id, newly_resolved: [{ leg_id, question, status, resolution_value }], newly_resolved_count, total_legs, resolved_legs, bundle_fully_resolved }',
    },
    {
      method: 'POST',
      path: '/api/nav/:bundleId/simulate-resolution',
      description: 'DEMO ONLY: Force-resolve a leg manually for testing/demos.',
      body: {
        leg_id: 'string (required) - UUID of the leg',
        outcome: 'string (required) - "won" or "lost"',
      },
      response: '{ bundle_id, leg: { leg_id, question, status, resolution_value }, total_legs, resolved_legs, bundle_fully_resolved }',
    },
    // Redemption
    {
      method: 'POST',
      path: '/api/deposit/redeem',
      description: 'Redeem tokens from a fully resolved bundle. Burns all tokens for the wallet, calculates payout at final NAV.',
      body: {
        bundle_id: 'string (required) - UUID of resolved bundle',
        wallet_address: 'string (required) - Solana wallet address',
      },
      response: '{ wallet_address, bundle_id, bundle_name, total_tokens, final_nav, payout_usdc, transaction_id }',
    },
    // SSE (Server-Sent Events)
    {
      method: 'GET',
      path: '/api/sse/nav/:bundleId',
      description: 'SSE stream for live NAV updates. Sends initial NAV immediately, then refreshes every 30 seconds. Connect with EventSource.',
      response: 'SSE stream - data: { nav, legs: [{ id, probability, weight, contribution }], timestamp }',
    },
    {
      method: 'GET',
      path: '/api/sse/portfolio/:walletAddress',
      description: 'SSE stream for live portfolio value updates. Recalculates all positions every 30 seconds.',
      response: 'SSE stream - data: { wallet_address, positions: [{ bundle_id, tokens_held, entry_price, deposited_usdc, current_nav, current_value, pnl }], total_deposited, total_current_value, total_pnl, timestamp }',
    },
  ],
};

router.get('/', (_req: Request, res: Response) => {
  res.json(apiDocs);
});

export const docsRoutes = router;
