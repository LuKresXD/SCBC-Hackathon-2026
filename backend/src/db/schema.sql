-- LuKres structured prediction market bundles
-- Run in Supabase SQL Editor

create table bundles (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  risk_tier int not null check (risk_tier in (50, 70, 90)),
  resolution_date date not null,
  issue_price numeric not null,
  status text not null default 'active',
  description text,
  theme text,
  created_at timestamptz not null default now()
);

create table legs (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundles(id) on delete cascade,
  market_id text not null,
  question text not null,
  probability numeric not null,
  weight numeric not null,
  status text not null default 'active',
  resolution_value numeric,
  polymarket_url text,
  created_at timestamptz not null default now()
);

create table positions (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundles(id) on delete cascade,
  wallet_address text not null,
  tokens_held numeric not null,
  entry_price numeric not null,
  deposited_usdc numeric not null,
  created_at timestamptz not null default now()
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references bundles(id) on delete cascade,
  wallet_address text not null,
  type text not null check (type in ('deposit', 'redemption', 'transfer')),
  amount_usdc numeric not null,
  tokens numeric not null,
  fee_usdc numeric not null,
  tx_signature text,
  created_at timestamptz not null default now()
);

create index idx_legs_bundle_id on legs(bundle_id);
create index idx_positions_bundle_id on positions(bundle_id);
create index idx_positions_wallet_address on positions(wallet_address);
create index idx_transactions_bundle_id on transactions(bundle_id);
create index idx_transactions_wallet_address on transactions(wallet_address);
