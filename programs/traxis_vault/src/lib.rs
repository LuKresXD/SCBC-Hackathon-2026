//! Traxis Vault — tranched structured product on Solana.
//!
//! A single `traxis_vault` program can host many independent vaults, one per
//! bundle (per Supabase UUID). Each vault issues a distinct SPL token (TRAX)
//! that represents a pro-rata claim on the vault's USDC after all prediction-
//! market legs are resolved.
//!
//! Non-custodial by design: every user-facing instruction is signed by the
//! end user's wallet. The protocol authority only resolves legs and finalizes
//! the vault (triggered by a Helius webhook observing the real market).
//!
//! See /ONCHAIN_DESIGN.md for the full spec.

use anchor_lang::prelude::*;

pub mod errors;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat");

#[program]
pub mod traxis_vault {
    use super::*;

    /// Create a new vault + TRAX mint + USDC vault account.
    /// Admin only. Binds the vault to a Supabase bundle UUID via `bundle_seed`.
    pub fn initialize_vault(
        ctx: Context<InitializeVault>,
        args: InitializeVaultArgs,
    ) -> Result<()> {
        instructions::initialize_vault::handler(ctx, args)
    }

    /// User deposits USDC, receives TRAX atomically.
    ///
    /// One transaction:
    ///   transfer USDC → vault
    ///   transfer fee → fee recipient
    ///   mint TRAX → user
    ///
    /// Fails if the vault is not Active.
    pub fn deposit(ctx: Context<Deposit>, amount_usdc: u64) -> Result<()> {
        instructions::deposit::handler(ctx, amount_usdc)
    }

    /// Authority flips a leg's outcome (Won / Lost).
    /// Idempotent when the outcome matches; errors on conflicting re-resolution.
    pub fn resolve_leg(ctx: Context<ResolveLeg>, leg_index: u8, outcome: u8) -> Result<()> {
        instructions::resolve_leg::handler(ctx, leg_index, outcome)
    }

    /// Authority locks the final payout ratio after every leg has resolved.
    pub fn finalize_vault(ctx: Context<FinalizeVault>) -> Result<()> {
        instructions::finalize_vault::handler(ctx)
    }

    /// Anyone holding TRAX burns their tokens and receives pro-rata USDC.
    /// Requires vault in Finalized state.
    pub fn redeem(ctx: Context<Redeem>, amount_tokens: u64) -> Result<()> {
        instructions::redeem::handler(ctx, amount_tokens)
    }

    /// Authority drains any residual USDC above the promised final payout
    /// to the protocol fee recipient. Safe to call after finalize.
    pub fn admin_withdraw_fees(ctx: Context<AdminWithdrawFees>) -> Result<()> {
        instructions::admin_withdraw_fees::handler(ctx)
    }
}
