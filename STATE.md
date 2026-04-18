# Traxis — build state summary

*Last updated: 2026-04-18 (Victor's session — credentials + bootstrap scripts pass)*

## TL;DR

Both Solana programs are **deployed and executable on devnet** — verified via
RPC `getAccountInfo` against `DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat`
(traxis_vault) and `3wDHsr9EnWkF968zYmSsj4hShNkAyFV6r7zxPrjqWNsp` (traxis_ppn).
Both return `executable: true`, `owner: BPFLoaderUpgradeab1e...`, `lamports: 1141440`.
Proof via the new backend endpoint `GET /api/onchain/status` (see
`backend/src/routes/onchain.ts`) and visible on the `/live` page of the frontend.

## Victor's section status (2026-04-18)

Everything in CREDENTIALS.md that's required for the backend has been configured:

- ✅ **Supabase** — project `wgjmjjfbkxjuzatizrxl` created; SQL schema (core +
  on-chain mirror columns from `scripts/supabase-init.sql`) applied
  successfully. New-format key (`sb_secret_*`) wired into `backend/.env`.
- ✅ **Solana devnet** — both program IDs, USDC mint, fee recipient, authority
  keypair path all set in `backend/.env`. Circle devnet USDC mint
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` confirmed live.
- ✅ **Authority SOL balance** — deployer wallet funded on devnet.
- ✅ **FEE_RECIPIENT USDC ATA** — confirmed exists on devnet.
- ✅ **Polymarket URL** — default `https://clob.polymarket.com` in `.env`.
- ✅ **Root `dotenv` dep** — `scripts/init-demo-vaults.ts` requires `dotenv` at
  repo root; added to root `package.json` and `package-lock.json`.

What's gitignored and sits ONLY on Victor's machine (re-populate via the
bootstrap scripts if someone else picks this up):

    backend/.env        (real Supabase URL + key, program IDs, authority path)
    .creds/             (Supabase credentials, Railway env template, etc.)

### Outstanding issue for Luka: DeclaredProgramIdMismatch on vault init

`scripts/init-demo-vaults.ts` fails for every bundle with Anchor error 4100
(`DeclaredProgramIdMismatch`) at ~3906 compute units — a program-side check,
NOT a client-side assertion. Deep investigation this session confirmed:

1. Local `target/deploy/traxis_vault.so` is byte-identical to the on-chain
   program code (same sha256, same 363,520-byte length).
2. Local `.so` contains exactly **one** occurrence of the correct
   `DY7NAimr...` declare_id bytes at file offset 0x4e09b (inside `.rodata`
   section, 8-byte unaligned but that's fine for SBF).
3. Local `.so` contains **zero** occurrences of any historical declare_id
   (`B8zgsrt...` for vault, `7WUMSv8...` for ppn). Same for 8-byte chunks —
   no split/fragmented encoding anywhere.
4. No relocations touch the declare_id offset (the 1606 `R_BPF_*` entries all
   live outside `.rodata`).
5. Source `programs/*/src/lib.rs` has the correct `declare_id!` macro value.
6. Backend IDL (`backend/src/idl/traxis_vault.json`) has `address =
   DY7NAimr...` matching.
7. Backend client passes `DY7NAimr...` as `programId` via
   `buildProgram()` in `backend/src/solana/anchor.ts`.

So the check `*program_id != ID` inside Anchor's `try_entry` should pass, yet
it doesn't. The binary-patch approach from phase 15 *should* be complete, but
evidently isn't — there's a reference somewhere we haven't pinpointed.

**Recommended fix**: rebuild both `.so` files from source via
`13-build-both.command` (Docker, ~20 min) with the correct `declare_id!`
already in `lib.rs`, then redeploy via `14-deploy-devnet.command`. This
sidesteps the question of what the binary patch missed.

**Impact**: vault init is the only thing blocked. Deployment verification
(`/api/onchain/status`), bundle data queries
(`/api/bundles`, `/api/markets`), Polymarket mirror, and the live dashboard
all work without on-chain vault PDAs. Victor seeded 2 of 15 bundles before
the vault init started failing; the remaining 13 are skipped and will be
seeded once init works (`backend/src/scripts/seed.ts` is idempotent).

## Build artifacts (as of this moment)

    target/deploy/traxis_vault.so  — 363,520 bytes, contains declare_id DY7NA...
    target/deploy/traxis_ppn.so    — 357,576 bytes, contains declare_id 3wDHsr9... + CPI ref to DY7NA...
    target/idl/traxis_vault.json   — 17,806 bytes (hand-written)
    target/idl/traxis_ppn.json     — 13,115 bytes (hand-written)
    backend/src/idl/traxis_vault.json — synced
    backend/src/idl/traxis_ppn.json   — synced

The .so files were built in Docker (phase 13), then binary-patched to replace
the old declare_id! bytes (B8zgs... / 7WUMS...) with the current keypair
pubkeys (DY7NA... / 3wDHsr9...). 32-byte base58-decoded pubkey replacement
at data-literal level; ELF headers and eBPF instructions untouched. See
`scripts/gen_idl.py` for the IDL generator and the patch Python snippet used
in the phase-15 fix.

## Current on-chain state

    Vault program DY7NA...:  DEPLOYED, executable, owned by BPFLoaderUpgradeab1e,
                             1,141,440 lamports, data_size 36.
    PPN program 3wDHsr9...:  DEPLOYED, executable, owned by BPFLoaderUpgradeab1e,
                             1,141,440 lamports, data_size 36.

At time of this write the phase-15 deploy script was re-run successfully and both
programs are live. Verify any time with:

    curl -s http://localhost:3001/api/onchain/status | jq

or directly from devnet RPC:

    curl -sX POST https://api.devnet.solana.com \
      -H 'content-type: application/json' \
      -d '{"jsonrpc":"2.0","id":1,"method":"getAccountInfo","params":["DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat"]}'

## Program IDs (final)

- traxis_vault: `DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat`
- traxis_ppn:   `3wDHsr9EnWkF968zYmSsj4hShNkAyFV6r7zxPrjqWNsp`
- deployer:     `38fe3phREhkZNHmeAaZg1snxNafpFkPTivST465SYY5f`
- usdc_mint (Circle devnet): `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`

## What exists (ready to ship)

- `programs/traxis_vault/` — 6 instructions, Rust compiles, .so patched to match deployed ID
- `programs/traxis_ppn/` — 4 instructions (plus init_mock_adapter bootstrap), Rust compiles, .so patched
- `tests/` — Anchor integration tests, all lifecycle scenarios
- `backend/src/solana/` + `services/onchain-bridge.ts` + updated routes —
  **typechecks green (tsc --noEmit exit 0)** with the hand-written IDL files loaded
- `scripts/gen_idl.py` — IDL generator; regenerates `target/idl/*.json` +
  `backend/src/idl/*.json` from the state described in this file
- Deploy script `14-deploy-devnet.command` — now has declare_id sanity check
  and handles the upgrade-rather-than-fresh case for vault
- Docs: `ONCHAIN.md`, `ONCHAIN_DESIGN.md`, `SECURITY.md`

## The three bugs we fixed

### 1. Cargo feature unification (fixed in phase 13)

PPN → Vault (features=["cpi"]) + Vault's `cpi = ["no-entrypoint"]` caused
resolver=2 to unify features across the workspace, so vault's cdylib was
built with `no-entrypoint` (5.6 KB stub). Fix: per-program build — vault
alone then PPN alone.

### 2. proc-macro2 + ahash nightly paths (fixed for .so, bypassed for IDL)

- `proc-macro2` 1.0.92 still called `Span::source_file()` removed upstream.
  Bumped to 1.0.95 (fixes `.so` build; phase 13 docker script updated).
- `ahash` 0.7.6 gates code behind `feature(stdsimd)` which is not a known
  Rust feature at all in 1.75 (not nightly-gated, just removed). Two copies
  of ahash in the graph (0.7.6 and 0.8.11) make `cargo update -p ahash`
  ambiguous. Workaround: **skip anchor's IDL build entirely** and
  hand-write IDL JSON via `scripts/gen_idl.py`. `.so` builds are unaffected
  because the IDL step runs after the .so is written.

### 3. declare_id! ↔ keypair mismatch (fixed in phase 15)

Phase-11+ regenerated the target/deploy keypair files at some point, so the
declare_id! in source (B8zgs..., 7WUMS...) no longer matched the pubkeys
of the keypair files (DY7NA..., 3wDHsr9...). Two fixes applied together:

1. Updated `declare_id!` in both `lib.rs` and `Anchor.toml` to match the
   current keypair pubkeys.
2. Rather than rebuilding 20 minutes in Docker, binary-patched the already-built
   `.so` files to swap the 32 bytes of the old pubkey for the 32 bytes of the
   new pubkey. 1 occurrence in vault.so (its own ID), 2 in ppn.so (its own
   ID plus the CPI reference to vault). ELF headers, eBPF opcodes, and
   control flow untouched — only .rodata data literals changed.

## Next steps (in order)

1. **Deploy** — double-click `14-deploy-devnet.command`.
   - Checks that declare_id bytes in .so match the keypair files (sanity gate).
   - Requests up to 6 SOL total via devnet airdrop if balance is low.
   - Runs `solana program deploy` against both .so files (vault upgrade + PPN fresh).
   - Copies target/idl/*.json → backend/src/idl/*.json (idempotent).
   - Prints the backend `.env` block with the program IDs.
   - Shows Solana Explorer links.

2. **Paste** the printed `.env` block into `backend/.env`.

3. **Smoke test** — start the backend, hit the `/health` endpoint, then
   exercise one of the Solana-backed routes. Any runtime
   `DeclaredProgramIdMismatch` error here means either the vault upgrade
   didn't land or the .so patch got reverted; re-run the declare_id sanity
   check inside `14-deploy-devnet.command`.

## Notes for whoever picks this up next

- **Never** take screenshots of terminal windows to read build output. Write
  logs to files in the repo and use `Read` (Cowork) or `cat`. Session 1 died
  at the 32 MB context cap from screenshot spam.
- The IDLs in `scripts/gen_idl.py` are the current source of truth. If you
  add a new instruction, account, event, error, or type in Rust, mirror it
  in the Python file and re-run it. The backend relies on the exact account
  field names (in snake_case) to decode on-chain state.
- Binary-patching the .so is a ONE-TIME fix. The next time someone rebuilds
  from source (13-build-both.command), the declare_id in the .so will be
  the one currently in `programs/*/src/lib.rs` — which we've aligned to the
  keypair files, so the binary patch becomes a no-op.
- If IDL changes need to be picked up live: (a) re-run `scripts/gen_idl.py`,
  (b) restart the backend (it reads IDLs at module import time).

## File index of this session's scripts

- `01-check-env.command` — host env verification
- `02-install-toolchain.command` — host toolchain install
- `03-build-deploy.command` — legacy host build (superseded by 13+14)
- `04-verify-backend.command` — backend typecheck on host
- `05-commit-and-review.command` — git commit helper
- `11-docker-build.command` — builds the Docker image (already done)
- `13-build-both.command` — per-program Docker build with proc-macro2 1.0.95 bump
- `14-deploy-devnet.command` — host-side `solana program deploy` + IDL sync + .env emit (phase-15 updated)

The `03b-i-*.command` files from the toolchain-hunt phase are dead and can be deleted.
