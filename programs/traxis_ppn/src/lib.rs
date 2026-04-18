//! Traxis PPN — Principal Protected Note.
//!
//! Structure:
//!   1. User deposits USDC principal → PPN note minted.
//!   2. Principal is placed into a Meteora-style yield vault (CPI).
//!   3. Accrued yield is harvested and CPIed into `traxis_vault::deposit`
//!      to buy TRAX tokens on the user's behalf.
//!   4. At maturity, principal is withdrawn from Meteora and returned to the
//!      user alongside whatever TRAX the yield has purchased.
//!
//! In this build the Meteora leg is a mock adapter that accrues a fixed APY
//! against elapsed time. Swapping in real Meteora is a mechanical replacement
//! of the CPI call sites — the user-facing state machine is identical.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("4NnrpeWgdmVymcdGqbrmQUunHHvyVSevUXCKFGJYwbtE");

#[program]
pub mod traxis_ppn {
    use super::*;

    /// One-time admin bootstrap of the mock Meteora adapter that all PPN
    /// notes deposit principal into. In a real deployment this is replaced
    /// by direct CPIs into Meteora's live vault; the adapter exists so the
    /// hackathon demo can be run on devnet without Meteora's SDK.
    pub fn initialize_mock_adapter(
        ctx: Context<InitializeMockAdapter>,
        apy_bps: u16,
    ) -> Result<()> {
        instructions::initialize_mock_adapter::handler(ctx, apy_bps)
    }

    pub fn initialize_note(
        ctx: Context<InitializeNote>,
        args: InitializeNoteArgs,
    ) -> Result<()> {
        instructions::initialize_note::handler(ctx, args)
    }

    /// Anyone can call this. Computes accrued yield since last harvest,
    /// withdraws it from Meteora (mock) to the note's intermediate USDC ATA,
    /// and CPIs into `traxis_vault::deposit` to buy TRAX with it.
    pub fn harvest_yield(ctx: Context<HarvestYield>) -> Result<()> {
        instructions::harvest_yield::handler(ctx)
    }

    /// Owner only. Requires `now >= maturity_ts`.
    pub fn redeem_at_maturity(ctx: Context<RedeemAtMaturity>) -> Result<()> {
        instructions::redeem_at_maturity::handler(ctx)
    }
}
