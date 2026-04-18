use anchor_lang::prelude::*;

#[event]
pub struct MockAdapterInitialized {
    pub adapter: Pubkey,
    pub apy_bps: u16,
    pub usdc_mint: Pubkey,
}

#[event]
pub struct NoteInitialized {
    pub note: Pubkey,
    pub owner: Pubkey,
    pub principal_usdc: u64,
    pub maturity_ts: i64,
    pub trax_vault: Pubkey,
}

#[event]
pub struct YieldHarvested {
    pub note: Pubkey,
    pub yield_usdc: u64,
    pub trax_received: u64,
    pub timestamp: i64,
}

#[event]
pub struct NoteRedeemed {
    pub note: Pubkey,
    pub owner: Pubkey,
    pub principal_returned: u64,
    pub trax_transferred: u64,
}
