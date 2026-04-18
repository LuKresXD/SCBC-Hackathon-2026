use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::TraxisError;
use crate::events::VaultInitialized;
use crate::state::{Leg, LegStatus, Vault, VaultState, BPS, MAX_LEGS, TOKEN_DECIMALS};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct LegInit {
    pub market_id: [u8; 32],
    pub weight_bps: u16,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct InitializeVaultArgs {
    /// 16 bytes — typically the Supabase bundle UUID.
    pub bundle_seed: [u8; 16],
    pub issue_price_bps: u16,
    pub fee_bps: u16,
    pub risk_tier: u8,
    pub resolution_date: i64,
    /// 1..=MAX_LEGS legs. Weights must sum to 10_000 bps.
    pub legs: Vec<LegInit>,
}

#[derive(Accounts)]
#[instruction(args: InitializeVaultArgs)]
pub struct InitializeVault<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = Vault::SIZE,
        seeds = [Vault::SEED, args.bundle_seed.as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// TRAX SPL mint for this bundle. Lives at a PDA address so the backend
    /// can re-derive it from the bundle seed alone.
    #[account(
        init,
        payer = authority,
        seeds = [b"mint", args.bundle_seed.as_ref()],
        bump,
        mint::decimals = TOKEN_DECIMALS,
        mint::authority = vault,
    )]
    pub trax_mint: Account<'info, Mint>,

    pub usdc_mint: Account<'info, Mint>,

    /// USDC vault: PDA-owned token account holding deposited USDC.
    #[account(
        init,
        payer = authority,
        seeds = [b"usdc_vault", args.bundle_seed.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = vault,
    )]
    pub usdc_vault: Account<'info, TokenAccount>,

    /// CHECK: Stored on the vault and used later to validate fee ATAs.
    /// No constraints checked here — it's just a pubkey the authority picked.
    pub fee_recipient: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitializeVault>, args: InitializeVaultArgs) -> Result<()> {
    // Validate.
    require!(
        args.issue_price_bps > 0 && args.issue_price_bps <= BPS as u16,
        TraxisError::InvalidIssuePrice
    );
    require!(args.fee_bps <= 500, TraxisError::InvalidFeeBps);
    require!(
        matches!(args.risk_tier, 50 | 70 | 90),
        TraxisError::InvalidRiskTier
    );
    require!(
        !args.legs.is_empty() && args.legs.len() <= MAX_LEGS,
        TraxisError::InvalidLegCount
    );

    let mut weight_sum: u64 = 0;
    for leg in args.legs.iter() {
        weight_sum = weight_sum
            .checked_add(leg.weight_bps as u64)
            .ok_or(TraxisError::ArithOverflow)?;
    }
    require!(weight_sum == BPS, TraxisError::InvalidLegWeights);

    // Build legs array, padding unused slots with zero.
    let mut legs_fixed: [Leg; MAX_LEGS] = [Leg {
        market_id: [0u8; 32],
        weight_bps: 0,
        status: LegStatus::Unresolved,
        _pad: [0u8; 5],
    }; MAX_LEGS];
    for (i, init) in args.legs.iter().enumerate() {
        legs_fixed[i] = Leg {
            market_id: init.market_id,
            weight_bps: init.weight_bps,
            status: LegStatus::Unresolved,
            _pad: [0u8; 5],
        };
    }

    let vault = &mut ctx.accounts.vault;
    vault.bundle_seed = args.bundle_seed;
    vault.authority = ctx.accounts.authority.key();
    vault.trax_mint = ctx.accounts.trax_mint.key();
    vault.usdc_mint = ctx.accounts.usdc_mint.key();
    vault.usdc_vault = ctx.accounts.usdc_vault.key();
    vault.fee_recipient = ctx.accounts.fee_recipient.key();
    vault.issue_price_bps = args.issue_price_bps;
    vault.fee_bps = args.fee_bps;
    vault.risk_tier = args.risk_tier;
    vault.resolution_date = args.resolution_date;
    vault.legs = legs_fixed;
    vault.leg_count = args.legs.len() as u8;
    vault.total_tokens_minted = 0;
    vault.total_usdc_deposited = 0;
    vault.total_fees_collected = 0;
    vault.final_payout_per_token = 0;
    vault.state = VaultState::Active;
    vault.bump = ctx.bumps.vault;
    vault._reserved = [0u8; 64];

    emit!(VaultInitialized {
        bundle_seed: args.bundle_seed,
        vault: vault.key(),
        trax_mint: vault.trax_mint,
        usdc_mint: vault.usdc_mint,
        authority: vault.authority,
        risk_tier: vault.risk_tier,
        issue_price_bps: vault.issue_price_bps,
        fee_bps: vault.fee_bps,
        leg_count: vault.leg_count,
        resolution_date: vault.resolution_date,
    });

    Ok(())
}
