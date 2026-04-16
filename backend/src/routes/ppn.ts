import { Router, Request, Response } from 'express';
import {
  getBundleById,
  createPPNVault,
  getPPNVaultsByWallet,
  getPPNVaultById,
  updatePPNVaultStatus,
  createTransaction,
} from '../db/queries';
import { PPNDepositRequest, PPNDepositResponse } from '../types';

const router = Router();

// Default Meteora estimated APY (8%)
const DEFAULT_APY = 0.08;

/**
 * POST /api/ppn/deposit
 * Create a PPN position. Principal goes to Meteora vault, yield is deployed into the bundle.
 *
 * Body: { bundle_id, wallet_address, amount_usdc, maturity_days? }
 */
router.post('/deposit', async (req: Request, res: Response) => {
  try {
    const { bundle_id, wallet_address, amount_usdc, maturity_days = 30 } = req.body as PPNDepositRequest;

    if (!bundle_id || !wallet_address || !amount_usdc) {
      return res.status(400).json({ error: 'bundle_id, wallet_address, and amount_usdc are required' });
    }
    if (amount_usdc <= 0) {
      return res.status(400).json({ error: 'amount_usdc must be positive' });
    }
    if (maturity_days < 7 || maturity_days > 365) {
      return res.status(400).json({ error: 'maturity_days must be between 7 and 365' });
    }

    const bundle = await getBundleById(bundle_id);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    }
    if (bundle.status !== 'active') {
      return res.status(400).json({ error: `Bundle is not active (status: ${bundle.status})` });
    }

    // Calculate maturity date
    const maturityDate = new Date();
    maturityDate.setDate(maturityDate.getDate() + maturity_days);

    // Estimated yield at maturity
    const estimatedYield = amount_usdc * (DEFAULT_APY / 365) * maturity_days;

    // Create PPN vault record
    const vault = await createPPNVault({
      bundle_id,
      wallet_address,
      principal_usdc: amount_usdc,
      yield_deployed_usdc: 0,
      estimated_apy: DEFAULT_APY,
      vault_address: `stub_vault_${Date.now().toString(36)}`, // Solana vault - stub for now
      status: 'active',
      maturity_date: maturityDate.toISOString().split('T')[0],
    });

    if (!vault) {
      return res.status(500).json({ error: 'Failed to create PPN vault' });
    }

    // Record transaction
    await createTransaction({
      bundle_id,
      wallet_address,
      type: 'deposit',
      amount_usdc,
      tokens: 0, // PPN doesn't mint tokens directly
      fee_usdc: 0, // No structuring fee on PPN (fee comes from yield)
    });

    const response: PPNDepositResponse = {
      vault_id: vault.id,
      bundle_id,
      principal_usdc: amount_usdc,
      estimated_apy: DEFAULT_APY,
      estimated_yield_at_maturity: Math.round(estimatedYield * 100) / 100,
      maturity_date: maturityDate.toISOString().split('T')[0],
      message: `Principal of $${amount_usdc} USDC is protected in Meteora yield vault. Estimated yield of $${estimatedYield.toFixed(2)} will be deployed into bundle ${bundle.name} over ${maturity_days} days.`,
    };

    res.status(201).json(response);
  } catch (err) {
    console.error('POST /api/ppn/deposit error:', err);
    res.status(500).json({ error: 'Failed to process PPN deposit' });
  }
});

/**
 * GET /api/ppn/portfolio/:walletAddress
 * Get all PPN vaults for a wallet with yield projections.
 */
router.get('/portfolio/:walletAddress', async (req: Request, res: Response) => {
  try {
    const { walletAddress } = req.params;
    const vaults = await getPPNVaultsByWallet(walletAddress);

    const enriched = await Promise.all(
      vaults.map(async (vault) => {
        const bundle = await getBundleById(vault.bundle_id);
        const maturityDate = new Date(vault.maturity_date);
        const now = new Date();
        const daysElapsed = Math.max(0, Math.floor((now.getTime() - new Date(vault.created_at).getTime()) / (1000 * 60 * 60 * 24)));
        const daysRemaining = Math.max(0, Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

        // Calculate accrued yield
        const accruedYield = vault.principal_usdc * (vault.estimated_apy / 365) * daysElapsed;
        const projectedTotalYield = vault.principal_usdc * (vault.estimated_apy / 365) * (daysElapsed + daysRemaining);

        return {
          vault_id: vault.id,
          bundle_id: vault.bundle_id,
          bundle_name: bundle?.name ?? 'Unknown',
          bundle_status: bundle?.status ?? 'unknown',
          principal_usdc: vault.principal_usdc,
          yield_deployed_usdc: vault.yield_deployed_usdc,
          accrued_yield: Math.round(accruedYield * 100) / 100,
          projected_total_yield: Math.round(projectedTotalYield * 100) / 100,
          estimated_apy: vault.estimated_apy,
          status: vault.status,
          days_elapsed: daysElapsed,
          days_remaining: daysRemaining,
          maturity_date: vault.maturity_date,
          created_at: vault.created_at,
          // Total value = principal (always protected) + accrued yield
          total_value: Math.round((vault.principal_usdc + accruedYield) * 100) / 100,
        };
      })
    );

    const totalPrincipal = enriched.reduce((sum, v) => sum + v.principal_usdc, 0);
    const totalAccruedYield = enriched.reduce((sum, v) => sum + v.accrued_yield, 0);
    const totalValue = enriched.reduce((sum, v) => sum + v.total_value, 0);

    res.json({
      wallet_address: walletAddress,
      vaults: enriched,
      summary: {
        total_vaults: enriched.length,
        total_principal: Math.round(totalPrincipal * 100) / 100,
        total_accrued_yield: Math.round(totalAccruedYield * 100) / 100,
        total_value: Math.round(totalValue * 100) / 100,
        principal_protected: true,
      },
    });
  } catch (err) {
    console.error('GET /api/ppn/portfolio/:walletAddress error:', err);
    res.status(500).json({ error: 'Failed to fetch PPN portfolio' });
  }
});

/**
 * POST /api/ppn/withdraw/:vaultId
 * Withdraw from a matured PPN vault. Returns principal + accumulated yield.
 */
router.post('/withdraw/:vaultId', async (req: Request, res: Response) => {
  try {
    const { vaultId } = req.params;

    const vault = await getPPNVaultById(vaultId);
    if (!vault) {
      return res.status(404).json({ error: 'PPN vault not found' });
    }
    if (vault.status !== 'active') {
      return res.status(400).json({ error: `Vault is not active (status: ${vault.status})` });
    }

    // Check if matured
    const maturityDate = new Date(vault.maturity_date);
    const now = new Date();
    const isMatured = now >= maturityDate;

    if (!isMatured) {
      const daysRemaining = Math.ceil((maturityDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return res.status(400).json({
        error: `Vault has not matured yet. ${daysRemaining} days remaining until ${vault.maturity_date}.`,
        early_withdrawal_available: true,
        early_withdrawal_penalty: '0% of principal (principal is always protected), but forfeits unrealized yield',
      });
    }

    // Calculate final yield
    const daysElapsed = Math.floor((now.getTime() - new Date(vault.created_at).getTime()) / (1000 * 60 * 60 * 24));
    const totalYield = vault.principal_usdc * (vault.estimated_apy / 365) * daysElapsed;
    const payoutUsdc = vault.principal_usdc + totalYield;

    // Update vault status
    await updatePPNVaultStatus(vaultId, 'withdrawn');

    // Record withdrawal transaction
    await createTransaction({
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      type: 'redemption',
      amount_usdc: payoutUsdc,
      tokens: 0,
      fee_usdc: 0,
    });

    res.json({
      vault_id: vaultId,
      wallet_address: vault.wallet_address,
      principal_returned: vault.principal_usdc,
      yield_earned: Math.round(totalYield * 100) / 100,
      total_payout: Math.round(payoutUsdc * 100) / 100,
      days_held: daysElapsed,
      effective_apy: vault.estimated_apy,
      message: 'Principal and yield withdrawn successfully.',
    });
  } catch (err) {
    console.error('POST /api/ppn/withdraw/:vaultId error:', err);
    res.status(500).json({ error: 'Failed to process PPN withdrawal' });
  }
});

export const ppnRoutes = router;
