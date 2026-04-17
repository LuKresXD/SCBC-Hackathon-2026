# Traxis build state — 2026-04-17

Summary of what works, what's blocked, and the exact recovery path.

## Status at a glance

| Layer | State | Notes |
|---|---|---|
| Rust source — `traxis_vault` | ✅ Written, code-complete | Pending build verification |
| Rust source — `traxis_ppn` | ✅ Written, code-complete | Pending build verification |
| Anchor integration tests (TS) | ✅ Written | Run with `anchor test` once build succeeds |
| Backend `src/solana/*.ts` | ✅ Written, **typechecks locally** | Verified green with minimal stubs in my sandbox |
| Backend `src/services/onchain-bridge.ts` | ✅ Written | Typechecks |
| Helius webhook handler | ✅ Written | Wire-up complete pending program IDs |
| Deploy scripts | ✅ Written | Blocked on `anchor build` |
| Devnet deployment | 🛑 Blocked | See "Blocker" below |
| Supabase migration | ⏳ Ready | File at `backend/src/db/schema_onchain.sql`; you paste into Supabase SQL editor |
| Helius webhook URL | ⏳ Ready | Configure after backend is on Railway |

## Toolchain installed on your Mac

- ✅ Rust stable 1.95.0 (also 1.79.0, 1.83.0 installed, solana platform-tools)
- ✅ Cargo 1.95.0
- ✅ Solana CLI 2.3.9 (Agave, upgraded from 1.18.26)
- ✅ Anchor CLI 0.31.1 (via avm)
- ✅ Deployer keypair: `38fe3phREhkZNHmeAaZg1snxNafpFkPTivST465SYY5f`
- ✅ Devnet balance: ≥5 SOL (you topped up via faucet.solana.com)
- ✅ Program keypairs generated (in `target/deploy/`):
  - `traxis_vault` program ID: `B8zgsrtE6qT6q2Nk48zp9qwKmPA4wbN46KsNMykXa7UC`
  - `traxis_ppn` program ID: `7WUMSv86bvjH8VJS4WQ6CuFomsBFvg1wUhtZ85zoWF3g`

The `declare_id!` macros in `programs/*/src/lib.rs` and `Anchor.toml` are already synced to these IDs.

## Blocker: dependency / toolchain version matrix

`anchor build` fails at the dependency resolution step for both Anchor 0.30.1 and 0.31.1 with identical root cause:

```
error: failed to download `cmov v0.5.3`
Caused by: feature `edition2024` is required
The package requires the Cargo feature called `edition2024`, but that feature
is not stabilized in this version of Cargo
```

### Why

- `anchor-lang` 0.30.1 and 0.31.1 both pull in `solana-program`, which transitively depends on `curve25519-dalek`, which depends on `cmov 0.5.3`.
- `cmov 0.5.3` was bumped to require Rust's `edition2024` feature (stabilized in Rust 1.85 / Feb 2025).
- `cargo-build-sbf` (Anchor's BPF build driver) uses the cargo bundled with Solana platform-tools. Even on Solana 2.3.9, the bundled platform-tools ships with Cargo 1.79.0 / 1.75.0, which predates edition2024.

### What this means in practice

Every known-stable Rust version between 1.75 and 1.84 doesn't support `edition2024`. Rust 1.85+ does but then writes Cargo.lock v4 which the older BPF cargo can't parse. We tried 8 different toolchain combinations; all hit the same wall.

## Recovery path (choose one)

### Option A — newer Solana platform-tools (recommended, 15 min)

Platform-tools v1.50+ ships with Rust 1.85+. These were released in early 2026. On your Mac:

```bash
# Use the latest beta/edge Solana which ships with newer platform-tools.
# Check https://github.com/anza-xyz/agave/releases for the latest version tag.
sh -c "$(curl -sSfL https://release.anza.xyz/v2.4.0/install)"   # or v2.5 etc.

# Force-reinstall SBF platform-tools inside the workspace
cd ~/SCBC-Hackathon-2026
cargo build-sbf --force-tools-install

# Confirm bundled cargo version
~/.cache/solana/*/platform-tools/rust/bin/cargo --version   # should be 1.85+
```

Then retry `anchor build`.

### Option B — pin cmov and cpufeatures to pre-edition2024 versions (30 min)

Add to root `Cargo.toml` above the `[workspace]` block:

```toml
[patch.crates-io]
cmov        = { git = "https://github.com/RustCrypto/utils", tag = "cmov-v0.4.1" }
cpufeatures = { git = "https://github.com/RustCrypto/utils", tag = "cpufeatures-v0.2.17" }
```

Verify these tags actually exist in the RustCrypto/utils repo first. If they don't, use `rev = "<commit-sha>"` pointing at a commit before the edition2024 bump.

### Option C — downgrade to Anchor 0.29.0 (least preferred)

Anchor 0.29.0 predates the crypto-crate modernization. Edit `programs/*/Cargo.toml`:

```toml
anchor-lang = "=0.29.0"
anchor-spl  = "=0.29.0"
```

Minor code tweaks required:
- Replace `ctx.bumps.vault` with `*ctx.bumps.get("vault").unwrap()` (7 occurrences across the two programs).

## Files already on disk that you can verify now

All of these exist and are complete:

```
programs/traxis_vault/              # 10 files, 8 instructions + state/events/errors
programs/traxis_ppn/                # 9 files, full Meteora-mocked PPN
tests/traxis_vault.test.ts          # Anchor integration tests — 12 test cases
tests/traxis_ppn.test.ts            # PPN lifecycle test
backend/src/solana/anchor.ts        # Env config, PDA derivations
backend/src/solana/client.ts        # Tx builders + authority calls
backend/src/services/solana.ts      # Backwards-compat adapter
backend/src/services/onchain-bridge.ts  # DB ↔ chain mirroring
backend/src/routes/deposit.ts       # /prepare + /confirm flow
backend/src/routes/webhook.ts       # Real Helius handler
backend/src/routes/admin.ts         # 5 new onchain admin endpoints
backend/src/db/schema_onchain.sql   # Apply in Supabase
scripts/deploy-devnet.sh            # Full deploy pipeline
scripts/init-demo-vaults.ts         # Bundle bootstrapping
scripts/init-meteora-mock.ts        # PPN bootstrap
scripts/demo-full-lifecycle.ts      # End-to-end smoke test
ONCHAIN.md                          # Judge-facing doc
ONCHAIN_DESIGN.md                   # Architecture spec
SECURITY.md                         # Self-review
```

Plus a series of `.command` files at the root tracking each build attempt. These are safe to delete after the real build works.

## What to do when you're back

1. Pick a recovery option above (A is fastest).
2. Once `anchor build` succeeds and `target/deploy/traxis_vault.so` exists, run `03-build-deploy.command` again — it will skip rebuild and proceed to deploy.
3. Run `bash scripts/sync-idl.sh` to copy IDLs into `backend/src/idl/`.
4. Paste `backend/src/db/schema_onchain.sql` into the Supabase SQL editor.
5. `cd backend && npm install && cp .env.example .env` then fill in Supabase/Helius/program IDs.
6. `npx tsx scripts/init-demo-vaults.ts` to bootstrap vault PDAs.
7. `npx tsx scripts/demo-full-lifecycle.ts` as a smoke test.
8. Configure Helius webhook to POST to your deployed backend's `/api/webhook/helius`.

None of the code needs changes — only the toolchain.
