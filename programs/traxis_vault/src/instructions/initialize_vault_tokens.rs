use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{Vault, TOKEN_DECIMALS};

/// Second half of vault initialization. Creates the TRAX mint and the
/// PDA-owned USDC vault token account, and populates the corresponding
/// fields on the Vault account. Split out of initialize_vault to keep each
/// instruction's stack usage under BPF's 4 KB-per-frame limit.
#[derive(Accounts)]
pub struct InitializeVaultTokens<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [Vault::SEED, vault.bundle_seed.as_ref()],
        bump = vault.bump,
        has_one = authority,
    )]
    pub vault: Box<Account<'info, Vault>>,

    #[account(
        init,
        payer = authority,
        seeds = [b"mint", vault.bundle_seed.as_ref()],
        bump,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = vault,
    )]
    pub trax_mint: Box<Account<'info, Mint>>,

    pub usdc_mint: Box<Account<'info, Mint>>,

    #[account(
        init,
        payer = authority,
        seeds = [b"usdc_vault", vault.bundle_seed.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Box<Account<'info, TokenAccount>>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeVaultTokens>) -> Result<()> {
    let vault = &mut ctx.accounts.vault;
    vault.trax_mint = ctx.accounts.trax_mint.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.usdc_vault = ctx.accounts.usdc_vault.key();
    Ok(())
}
