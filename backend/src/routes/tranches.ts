import { Router, Request, Response } from "express";
import { PublicKey } from "@solana/web3.js";
import {
  getAllBundles,
  getBundleById,
  getLegsByBundleId,
  createPPNVault,
  getPPNVaultById,
  updatePPNVaultOnchain,
  createTransaction,
  getTranchesByWallet,
} from "../db/queries";
import { calculateNAV } from "../services/nav";
import { quoteTranches, DEFAULT_TRANCHES, TrancheSpec } from "../services/tranching";
import {
  buildPpnDepositTx,
  confirmTransaction,
  getMockAdapterState,
} from "../services/solana";

const router = Router();

type TrancheKind = "senior" | "mezzanine" | "junior";

function resolveTrancheSpec(kind: TrancheKind): TrancheSpec {
  const s = DEFAULT_TRANCHES.find((t) => t.kind === kind);
  if (!s) throw new Error(`Unknown tranche kind: ${kind}`);
  return s;
}

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

/**
 * GET /api/tranches/user/:wallet
 * List every tranche position this wallet holds (excludes vanilla PPN).
 * Rows include the on-chain note PDA + on-chain tx signature when available.
 */
router.get("/user/:wallet", async (req: Request, res: Response) => {
  try {
    const { wallet } = req.params;
    const vaults = await getTranchesByWallet(wallet);
    const rows = vaults.map((v) => ({
      vault_id: v.id,
      bundle_id: v.bundle_id,
      wallet_address: v.wallet_address,
      tranche_kind: v.tranche_kind,
      tranche_attach: v.tranche_attach,
      tranche_detach: v.tranche_detach,
      price_per_token: v.price_per_token,
      principal_usdc: v.principal_usdc,
      note_pda: v.vault_address,
      note_seed_hex: v.note_seed_hex,
      onchain_tx_signature: v.onchain_tx_signature,
      redemption_tx_signature: v.redemption_tx_signature,
      maturity_date: v.maturity_date,
      maturity_ts: v.maturity_ts,
      status: v.status,
      created_at: v.created_at,
    }));
    res.json({ count: rows.length, rows });
  } catch (err) {
    console.error("GET /api/tranches/user/:wallet error:", err);
    res.status(500).json({ error: "Failed to fetch tranche positions" });
  }
});

/**
 * POST /api/tranches/prepare
 * Build a real on-chain deposit for a specific tranche slice. The underlying
 * tx is an `initialize_note` — the tranche kind is overlaid as Supabase
 * metadata so the programs stay untouched.
 *
 * Body: { bundle_id, wallet_address, tranche_kind, amount_usdc, maturity_days? }
 *
 * Returns: an unsigned transaction (base64) plus the vault_id the frontend
 * should pass back to /confirm after the wallet signs.
 */
router.post("/prepare", async (req: Request, res: Response) => {
  try {
    const {
      bundle_id,
      wallet_address,
      tranche_kind,
      amount_usdc,
      maturity_days,
    } = req.body as {
      bundle_id?: string;
      wallet_address?: string;
      tranche_kind?: TrancheKind;
      amount_usdc?: number;
      maturity_days?: number;
    };

    if (!bundle_id || !wallet_address || !tranche_kind || !amount_usdc) {
      return res.status(400).json({
        error:
          "bundle_id, wallet_address, tranche_kind, and amount_usdc are required",
      });
    }
    if (!["senior", "mezzanine", "junior"].includes(tranche_kind)) {
      return res.status(400).json({
        error: "tranche_kind must be one of: senior, mezzanine, junior",
      });
    }
    if (amount_usdc <= 0) {
      return res.status(400).json({ error: "amount_usdc must be positive" });
    }

    const bundle = await getBundleById(bundle_id);
    if (!bundle) {
      return res.status(404).json({ error: `Bundle not found: ${bundle_id}` });
    }
    if (bundle.status !== "active") {
      return res.status(400).json({
        error: `Bundle is not active (status: ${bundle.status})`,
      });
    }

    // Adapter must be live before any note can be minted.
    const adapter = await getMockAdapterState();
    if (!adapter) {
      return res.status(409).json({
        error:
          "Meteora mock adapter is not initialized. Run POST /api/admin/init-mock-adapter first.",
      });
    }

    // Horizon in days. If the caller didn't pass one, default to the bundle's
    // time-to-resolution so tranche maturity matches the bundle.
    const resolutionMs = new Date(bundle.resolution_date).getTime();
    const daysToResolution = Math.max(
      1,
      Math.ceil((resolutionMs - Date.now()) / 86_400_000),
    );
    const horizonDays = maturity_days ?? daysToResolution;
    if (horizonDays < 1 || horizonDays > 365) {
      return res.status(400).json({
        error: "maturity_days must be between 1 and 365",
      });
    }

    // Current NAV + quote for this tranche slice (so we lock in price_per_token
    // at issue time and can compute expected payoff later).
    const legs = await getLegsByBundleId(bundle_id);
    const nav =
      legs.length > 0 ? calculateNAV(legs, bundle_id).nav : bundle.issue_price;
    const quote = quoteTranches({
      bundleNav: nav,
      totalLegs: legs.length || 10,
      horizonDays,
    }).find((q) => q.kind === tranche_kind);
    if (!quote) {
      return res.status(500).json({ error: "Failed to price tranche" });
    }

    const spec = resolveTrancheSpec(tranche_kind);
    const maturityMs = Date.now() + horizonDays * 86_400_000;
    const maturityTs = Math.floor(maturityMs / 1000);
    const maturityDate = new Date(maturityMs).toISOString().split("T")[0];

    // principal_usdc is what the user sends (in USDC). They're purchasing
    // face-value tokens at `quote.pricePerToken`; face value recorded on-chain
    // is the principal itself (the PPN program doesn't know about tranches).
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
      if (
        String(err).includes("Account does not exist") ||
        String(err).includes("not found")
      ) {
        return res.status(409).json({
          error:
            "Bundle vault is not initialized on-chain yet. Run POST /api/admin/bundles/:id/init-onchain first.",
        });
      }
      throw err;
    }

    // Persist pending row — tranche metadata attached so the /confirm step
    // just has to write the signature.
    const vault = await createPPNVault({
      bundle_id,
      wallet_address,
      principal_usdc: amount_usdc,
      yield_deployed_usdc: 0,
      estimated_apy: adapter.apyBps / 10_000,
      vault_address: built.notePda,
      status: "active",
      maturity_date: maturityDate,
      note_seed_hex: built.noteSeedHex,
      maturity_ts: maturityTs,
      tranche_kind,
      tranche_attach: spec.attach,
      tranche_detach: spec.detach,
      price_per_token: quote.pricePerToken,
    });
    if (!vault) {
      return res.status(500).json({ error: "Failed to persist tranche vault" });
    }

    res.status(200).json({
      kind: "prepared",
      vault_id: vault.id,
      bundle_id,
      wallet_address,
      tranche_kind,
      tranche_attach: spec.attach,
      tranche_detach: spec.detach,
      amount_usdc,
      price_per_token: quote.pricePerToken,
      expected_yield_pct: quote.expectedYieldPct,
      full_pay_probability: quote.fullPayProbability,
      attach_probability: quote.attachProbability,
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
    console.error("POST /api/tranches/prepare error:", err);
    res.status(500).json({ error: "Failed to prepare tranche deposit" });
  }
});

/**
 * POST /api/tranches/confirm
 * Persist the on-chain signature once Phantom/Solflare/Backpack has signed
 * and the RPC has confirmed the tx. Mirrors /api/ppn/onchain/confirm but
 * also asserts that the vault is a tranche (tranche_kind is not null) so
 * callers can't accidentally mark a vanilla PPN note via this endpoint.
 *
 * Body: { vault_id, signature }
 */
router.post("/confirm", async (req: Request, res: Response) => {
  try {
    const { vault_id, signature } = req.body as {
      vault_id?: string;
      signature?: string;
    };
    if (!vault_id || !signature) {
      return res
        .status(400)
        .json({ error: "vault_id and signature are required" });
    }

    const vault = await getPPNVaultById(vault_id);
    if (!vault) return res.status(404).json({ error: "Vault not found" });
    if (!vault.tranche_kind) {
      return res.status(400).json({
        error:
          "Vault is not a tranche position. Use /api/ppn/onchain/confirm instead.",
      });
    }

    const confirmed = await confirmTransaction(signature);
    if (!confirmed) {
      return res.status(400).json({
        error: "Transaction has not confirmed yet",
      });
    }

    const updated = await updatePPNVaultOnchain(vault_id, {
      onchain_tx_signature: signature,
    });
    if (!updated) {
      return res
        .status(500)
        .json({ error: "Failed to record signature on tranche vault" });
    }

    // Transaction row for portfolio history. Tagged as a tranche deposit via
    // the bundle_id; the type remains 'deposit' so the portfolio endpoints
    // keep working unchanged.
    const tx = await createTransaction({
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      type: "deposit",
      amount_usdc: vault.principal_usdc,
      tokens: 0,
      fee_usdc: 0,
      tx_signature: signature,
    });

    res.status(201).json({
      vault_id,
      bundle_id: vault.bundle_id,
      wallet_address: vault.wallet_address,
      tranche_kind: vault.tranche_kind,
      tranche_attach: vault.tranche_attach,
      tranche_detach: vault.tranche_detach,
      price_per_token: vault.price_per_token,
      principal_usdc: vault.principal_usdc,
      signature,
      transaction_id: tx?.id ?? null,
    });
  } catch (err) {
    console.error("POST /api/tranches/confirm error:", err);
    res.status(500).json({ error: "Failed to confirm tranche deposit" });
  }
});

export const trancheRoutes = router;
