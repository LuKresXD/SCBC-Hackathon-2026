# Senthos / Traxis · SCBC Hackathon 2026 · Combined Repo

This folder merges **three branches** of [LuKresXD/SCBC-Hackathon-2026](https://github.com/LuKresXD/SCBC-Hackathon-2026) into a single working tree:

| Branch | Contribution |
|---|---|
| `main` (Senthos rebrand) | Next.js 16 frontend + Express/Supabase/Polymarket backend |
| `phase-15-devnet-deploy` | Solana Anchor on-chain programs (`traxis_vault`, `traxis_ppn`) + on-chain bridge in the backend |
| `ml-model` | Traxis correlation model audit artifacts, Monte-Carlo, walk-forward metrics |

## Layout
```
SCBC-Hackathon-2026-combined/
├── app/                             # Next.js 16 frontend (Senthos UI)
├── public/                          # Frontend static assets
├── backend/                         # Express API (Supabase, Polymarket, Solana bridge)
│   └── src/
│       ├── routes/                  # REST routes (bundles, nav, deposit, ppn, alerts…)
│       ├── services/                # cron, pricing, polymarket, solana, onchain-bridge
│       ├── solana/                  # Anchor provider, program handles, PDA derivation
│       └── idl/                     # traxis_vault.json, traxis_ppn.json (synced from anchor build)
├── programs/                        # Anchor programs (Rust)
│   ├── traxis_vault/                # Bundle vault (deposit/redeem/resolve/finalize)
│   └── traxis_ppn/                  # Principal-protected notes + Meteora mock adapter
├── scripts/                         # deploy-devnet.sh, init-demo-vaults.ts, sync-idl.sh…
├── migrations/                      # Anchor migration (deploy.ts)
├── tests/                           # Anchor integration tests (mocha/chai)
├── traxis-correlation-deliverables/ # ML model artifacts, reports, tarball
├── *.command                        # macOS double-click helpers for build/deploy
├── Anchor.toml / Cargo.toml / rust-toolchain.toml
├── ONCHAIN.md / ONCHAIN_DESIGN.md / STATE.md / SECURITY.md
└── package.json                     # Root = frontend (Next.js 16)
```

## Running locally

### 1. Frontend (Next.js 16 · Turbopack)
```bash
npm install           # already done
npm run dev           # http://localhost:3000
```

### 2. Backend (Express + tsx watch)
```bash
cd backend
npm install           # already done
cp .env.example .env  # already done with devnet defaults
npm run dev           # http://localhost:3001
```

The backend will run without real Supabase credentials  -  `config/index.ts` was softened to warn instead of exit. All list/portfolio endpoints will return empty arrays. To get real DB-backed behaviour, fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `backend/.env`.

### 3. On-chain (Anchor programs on Solana devnet)
The two programs are **already deployed on Solana devnet**:

| Program | Devnet Address |
|---|---|
| `traxis_vault` | `DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat` |
| `traxis_ppn`   | `3wDHsr9EnWkF968zYmSsj4hShNkAyFV6r7zxPrjqWNsp` |

To rebuild / redeploy you need the Solana toolchain (not installed on this host):
```bash
# Install prerequisites (only needed to rebuild programs)
sh -c "$(curl -sSfL https://release.anchor-lang.com/v0.30.1/install)"
sh -c "$(curl -sSfL https://release.solana.com/v1.18.26/install)"
rustup install 1.75.0

# Build + deploy
anchor build
bash scripts/deploy-devnet.sh
```

## Patches applied during the merge
1. `tsconfig.json`  -  target bumped to ES2020 and `programs/scripts/tests/migrations/traxis-correlation-deliverables/` added to `exclude` so Next.js 16 type check doesn't pull in the Anchor workspace.
2. `backend/src/index.ts`  -  removed `app.options('*', cors())` (Express 4.22 / path-to-regexp rejects the bare `*`) and migrated `express-rate-limit` options to v8 (`limit`, `standardHeaders: 'draft-7'`, explicit `validate`); added `DISABLE_RATE_LIMIT` env gate.
3. `backend/src/config/index.ts`  -  missing Supabase creds now warn instead of `process.exit(1)`.
4. `backend/src/middleware/requestLogger.ts`  -  added request-arrival log line.
5. `backend/.env`  -  populated with real devnet program IDs and `DISABLE_RATE_LIMIT=true`.

## Deep audit
See `AUDIT.md` in this folder for a full rundown of what works and what doesn't.
