import { Router, Request, Response } from 'express';
import { PublicKey } from '@solana/web3.js';
import {
  getBundleById,
  createPPNVault,
  getPPNVaultsByWallet,
  getPPNVaultById,
  updatePPNVaultStatus,
  updatePPNVaultOnchain,
  getActivePPNVault,
  createTransaction,
} from '../db/queries';
import { PPNDepositRequest, PPNDepositResponse } from '../types';
import {
  buildPpnDepositTx,
  buildPpnRedeemTx,
  confirmTransaction,
  getMockAdapterState,
} from '../services/solana';

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

// ---------------------------------------------------------------------------
// On-chain PPN flow (non-custodial, matches /api/deposit prepare+confirm pattern).
//
// Unlike /deposit which writes the DB only after on-chain confirm, PPN writes a
// Supabase row at /prepare so the UI can render "pending" state. The row is
// upgraded from `status='active'` with on-chain artifacts once /confirm lands.
// If the user never submits, the stub row is a soft orphan — matches behaviour
// of the existing legacy /api/ppn/deposit endpoint.
// ---------------------------------------------------------------------------

/**
 * POST /api/ppn/onchain/prepare
 * Build the `initialize_note` transaction for the user to sign.
 * Body: { bundle_id, wallet_address, amount_usdc, maturity_days? }
 */
router.post('/onchain/prepare', async (req: Request, res: Response) => {
  try {
    const {
      bundle_id,
      wallet_address,
      amount_usdc,
      maturity_days = 30,
      // Tranche overlay — optional. Present only when a tranche BUY is issued
      // from /app/tranche/[id]; plain PPN deposits leave these undefined.
      tranche_kind,
      tranche_attach,
      tranche_detach,
      price_per_token,
    } = req.body as PPNDepositRequest;

    if (!bundle_id || !wallet_address || !amount_usdc) {
      return res.status(400).json({
        error: 'bundle_id, wallet_address, and amount_usdc are required',
      });
    }
    if (amount_usdc <= 0) {
      return res.status(400).json({ error: 'amount_usdc must be positive' });
    }
    if (maturity_days < 1 || maturity_days > 365) {
      return res.status(400).json({ error: 'maturity_days must be between 1 and 365' });
    }
    // Tranche metadata is optional as a group but must be self-consistent
    // when supplied. We don't enforce attach < detach here — the tranche
    // engine on the FE already guards that, and exotic presets may need
    // zero-width markers at the boundary of a range.
    if (tranche_kind !== undefined) {
      if (!['senior', 'mezzanine', 'junior'].includes(tranche_kind)) {
        return res.status(400).json({
          error: `tranche_kind must be one of: senior | mezzanine | junior (got "${tranche_kind}")`,
        });
      }
      if (
        typeof tranche_attach !== 'number' ||
        typeof tranche_detach !== 'number' ||
        typeof price_per_token !== 'number'
      ) {
        return res.status(400).json({
          error:
            'tranche_kind requires tranche_attach, tranche_detach, and price_per_token (all numbers)',
        });
      }
    }

    const bundle = await getBundleById(bundle_id);
    if (!bundle) return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    if (bundle.status !== 'active') {
      return res.status(400).json({
        error: `Bundle is not active (status: ${bundle.status})`,
      });
    }

    // Guard: mock adapter must be initialized (one-time admin bootstrap).
    const adapter = await getMockAdapterState();
    if (!adapter) {
      return res.status(409).json({
        error:
          'Meteora mock adapter is not initialized. Run POST /api/admin/init-mock-adapter first.',
      });
    }

    // Maturity: exact timestamp for the on-chain ix, and a calendar date for
    // display. The on-chain program compares against Solana clock::unix_timestamp.
    const maturityMs = Date.now() + maturity_days * 86_400_000;
    const maturityTs = Math.floor(maturityMs / 1000);
    const maturityDate = new Date(maturityMs).toISOString().split('T')[0];

    const principalBaseUnits = BigInt(Math.round(amount_usdc * 1_000_000));

    let built;
    try {
      built = await buildPpnDepositTx({
        userPubkey: new PublicKey(wallet_address),
        bundleId: bundle_id,
        principalUsdc: principalBaseUnits,
        maturityTs,
      });
    } catch (err: any) {
      // Common case: the bundle's on-chain vault / trax_mint hasn't been
      // initialized yet — initialize_note needs the TRAX mint to exist.
      if (
        String(err).includes('Account does not exist') ||
        String(err).includes('not found')
      ) {
        return res.status(409).json({
          error:
            'Bundle vault is not initialized on-chain yet. Run POST /api/admin/bundles/:id/init-onchain first.',
        });
      }
      throw err;
    }

    // Persist a pending PPN vault row so /confirm can look it up by wallet+bundle.
    const apyFromAdapter = adapter.apyBps / 10_000;
    const vault = await createPPNVault({
      bundle_id,
      wallet_address,
      principal_usdc: amount_usdc,
      yield_deployed_usdc: 0,
      estimated_apy: apyFromAdapter,
      vault_address: built.notePda,
      status: 'active',
      maturity_date: maturityDate,
      note_seed_hex: built.noteSeedHex,
      maturity_ts: maturityTs,
      // Tranche overlay: NULL for vanilla PPN, populated when the FE is
      // buying a slice of the basket's (attach, detach) loss range.
      tranche_kind: tranche_kind ?? null,
      tranche_attach: tranche_attach ?? null,
      tranche_detach: tranche_detach ?? null,
      price_per_token: price_per_token ?? null,
    });
    if (!vault) {
      return res.status(500).json({ error: 'Failed to persist PPN vault record' });
    }

    res.status(200).json({
      kind: 'prepared',
      vault_id: vault.id,
      bundle_id,
      wallet_address,
      amount_usdc,
      estimated_apy: apyFromAdapter,
      maturity_date: maturityDate,
      maturity_ts: maturityTs,
      note_pda: built.notePda,
      note_seed_hex: built.noteSeedHex,
      adapter_pda: built.adapterPda,
      adapter_pool: built.adapterPool,
      trax_mint: built.traxMint,
      trax_vault: built.traxVault,
      transaction_base64: built.transactionBase64,
      recent_blockhash: built.recentBlockhash,
      last_valid_block_height: built.lastValidBlockHeight,
    });
  } catch (err) {
    console.error('POST /api/ppn/onchain/prepare error:', err);
    res.status(500).json({ error: 'Failed to prepare PPN on-chain deposit' });
  }
});

/**
 * POST /api/ppn/onchain/confirm
 * Persist the on-chain signature after the wallet signs + the RPC confirms.
 * Body: { vault_id, signature }
 */
router.post('/onchain/confirm', async (req: Request, res: Response) => {
  try {
    const { vault_id, signature } = req.body as {
      vault_id: string;
      signature: string;
    };
    if (!vault_id || !signature) {
      return res.status(400).json({ error: 'vault_id and signature are required' });
    }

    const vault = await getPPNVaultById(vault_id);
    if (!vault) return res.status(404).json({ error: 'PPN vault not found' });

    const confirmed = await confirmTransaction(signature);
    if (!confirmed) {
      return res.status(400).json({ error: 'Transaction has not confirmed yet' });
    }

    const updated = await updatePPNVaultOnchain(vault_id, {
      onchain_tx_signature: signature,
    });
    if (!updated) {
      return res.status(500).json({ error: 'Failed to record signature on PPN vault' });
    }

    // Transaction row for portfolio/history. PPN deposits never pay a
    // structuring fee (fee comes out of yield in harvest).
    const tx = await createTransaction({
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      type: 'deposit',
      amount_usdc: vault.principal_usdc,
      tokens: 0,
      fee_usdc: 0,
      tx_signature: signature,
    });

    res.status(201).json({
      vault_id,
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      principal_usdc: vault.principal_usdc,
      signature,
      transaction_id: tx?.id ?? null,
    });
  } catch (err) {
    console.error('POST /api/ppn/onchain/confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm PPN on-chain deposit' });
  }
});

/**
 * POST /api/ppn/onchain/redeem/prepare
 * Build the `redeem_at_maturity` transaction for the user to sign.
 * Body: { bundle_id, wallet_address }  OR  { vault_id }
 */
router.post('/onchain/redeem/prepare', async (req: Request, res: Response) => {
  try {
    const { vault_id, bundle_id, wallet_address } = req.body as {
      vault_id?: string;
      bundle_id?: string;
      wallet_address?: string;
    };

    let vault = null as Awaited<ReturnType<typeof getPPNVaultById>> | null;
    if (vault_id) {
      vault = await getPPNVaultById(vault_id);
    } else if (bundle_id && wallet_address) {
      vault = await getActivePPNVault(wallet_address, bundle_id);
    }

    if (!vault) {
      return res.status(404).json({
        error: 'PPN vault not found. Supply vault_id, or (bundle_id + wallet_address).',
      });
    }
    if (!vault.note_seed_hex) {
      return res.status(400).json({
        error: 'This PPN vault was created before on-chain integration (no note seed).',
      });
    }
    if (vault.status !== 'active') {
      return res.status(400).json({
        error: `PPN vault is not active (status: ${vault.status})`,
      });
    }

    // Maturity guard — check both the exact ts (preferred) and the legacy date.
    const nowSec = Math.floor(Date.now() / 1000);
    const matured = vault.maturity_ts
      ? nowSec >= vault.maturity_ts
      : new Date(vault.maturity_date).getTime() <= Date.now();
    if (!matured) {
      const secsRemaining = (vault.maturity_ts ?? 0) - nowSec;
      return res.status(400).json({
        error: `Note has not matured yet. ${Math.max(0, secsRemaining)}s remaining.`,
        maturity_ts: vault.maturity_ts,
        maturity_date: vault.maturity_date,
      });
    }

    // We need the bundle's TRAX mint to derive the note's TRAX ATA. Pull from
    // the bundle row rather than re-deriving so we stay in lock-step with the
    // on-chain vault regardless of which env we're in.
    const bundle = await getBundleById(vault.bundle_id);
    if (!bundle) {
      return res.status(404).json({ error: 'Parent bundle not found' });
    }
    const traxMintBase58 = (bundle as any).trax_mint as string | null | undefined;
    if (!traxMintBase58) {
      return res.status(409).json({
        error: 'Bundle has no trax_mint — run /api/admin/bundles/:id/init-onchain first.',
      });
    }

    const built = await buildPpnRedeemTx({
      userPubkey: new PublicKey(vault.wallet_address),
      noteSeedHex: vault.note_seed_hex,
      traxMintBase58,
    });

    res.status(200).json({
      kind: 'prepared',
      vault_id: vault.id,
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      principal_usdc: vault.principal_usdc,
      note_pda: built.notePda,
      transaction_base64: built.transactionBase64,
      recent_blockhash: built.recentBlockhash,
      last_valid_block_height: built.lastValidBlockHeight,
    });
  } catch (err) {
    console.error('POST /api/ppn/onchain/redeem/prepare error:', err);
    res.status(500).json({ error: 'Failed to prepare PPN on-chain redeem' });
  }
});

/**
 * POST /api/ppn/onchain/redeem/confirm
 * Persist the redeem signature and flip the vault to `withdrawn`.
 * Body: { vault_id, signature }
 */
router.post('/onchain/redeem/confirm', async (req: Request, res: Response) => {
  try {
    const { vault_id, signature } = req.body as {
      vault_id: string;
      signature: string;
    };
    if (!vault_id || !signature) {
      return res.status(400).json({ error: 'vault_id and signature are required' });
    }

    const vault = await getPPNVaultById(vault_id);
    if (!vault) return res.status(404).json({ error: 'PPN vault not found' });

    const confirmed = await confirmTransaction(signature);
    if (!confirmed) {
      return res.status(400).json({ error: 'Transaction has not confirmed yet' });
    }

    const updated = await updatePPNVaultOnchain(vault_id, {
      redemption_tx_signature: signature,
      status: 'withdrawn',
    });
    if (!updated) {
      return res.status(500).json({ error: 'Failed to update PPN vault after redeem' });
    }

    const tx = await createTransaction({
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      type: 'redemption',
      amount_usdc: vault.principal_usdc,
      tokens: 0,
      fee_usdc: 0,
      tx_signature: signature,
    });

    res.status(201).json({
      vault_id,
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      principal_returned: vault.principal_usdc,
      signature,
      transaction_id: tx?.id ?? null,
    });
  } catch (err) {
    console.error('POST /api/ppn/onchain/redeem/confirm error:', err);
    res.status(500).json({ error: 'Failed to confirm PPN on-chain redeem' });
  }
});

export const ppnRoutes = router;
