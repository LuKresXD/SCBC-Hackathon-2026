# Session Notes — Senthos/Traxis v2
Deep session log covering the whole arc from the initial branch merge through to the multi-product rebuild.
## Repo merge + rebrand
We combined three branches of `LuKresXD/SCBC-Hackathon-2026` into `~/coding-projects/SCBC-Hackathon-2026-combined`.
- `main` contributed the Next.js frontend and Express backend
- `phase-15-devnet-deploy` contributed the Anchor programs (`traxis_vault` at `DY7NAimrQZY7SxveXTb38XN7H69wAXjZZj8DRHto4Aat`, `traxis_ppn` at `3wDHsr9EnWkF968zYmSsj4hShNkAyFV6r7zxPrjqWNsp`)
- `ml-model` contributed the correlation deliverables in `traxis-correlation-deliverables/`
A rebrand from Lukres → Senthos landed on `main` prior to this session and the STHS token naming convention propagated through the code.
## Landing page
Built a standalone Lido/Morpho-style landing at `app/page.tsx` as a server component that fetches `/api/health`, `/api/onchain/status`, `/api/ml/metrics`, and `/api/markets` in parallel. Moved the authenticated Senthos app from `app/page.tsx` to `app/app/page.tsx` so the landing owns `/` and the app owns `/app`.
## Header and app-shell polish
Evolved the authenticated shell from a left sidebar to a full horizontal top bar at 60px height. Removed the "STRUCTURED PREDICTIONS" tagline, consolidated the `devnet` status pill next to the brand, switched active nav to an underline accent, converted the balance pill to an inline `$10,000 USDC Reset`, promoted Connect Wallet to a solid teal primary button. The `N` indicator in dev mode was removed by setting `devIndicators: false` in `next.config.ts`.
## Live Polymarket integration
Removed the fake `HOT_PREDICTIONS` and `NEWS` arrays from the monolithic page. Deleted the horizontal `<Ticker/>` and `tickerScroll` keyframes. Introduced a `LivePolymarket` component that hits `GET ${BACKEND_URL}/api/markets?limit=9` on mount and every 30 seconds and renders live markets with real YES prices and USD volume. The feed goes:
```
Polymarket Gamma API → backend/src/services/polymarket.ts:fetchMarkets → /api/markets → frontend
```
## Demo-mode and live-systems cleanup
Removed the "Demo mode" toggle from the sidebar, renamed "RESET DEMO" → "RESET", "Reset demo state?" → "Reset portfolio?". Deleted the `/live` route. Stripped em dashes repo-wide via `sed`, then scanned for and removed AI-speak words (`seamless`, `robust`, `leverage`, etc.) — grep returned zero matches post-cleanup.
## Backend bug hunt
Fixed a cluster of startup/stability issues uncovered during the audit:
- Downgraded `express-rate-limit` v8 → v7 (v8 hung on localhost dual-stack)
- Swapped the Supabase client for an in-memory mock when placeholder creds are detected (`config.supabaseConfigured`)
- Softened config to `console.warn` instead of `process.exit(1)`
- Added a 400 JSON-body-parse error middleware
- Removed `app.options('*', cors())` since Express 4.22's path-to-regexp rejects the bare `*` pattern
Also created `CREDENTIALS.md` at the repo root with the complete env-var inventory (Supabase, Solana RPC/program IDs, USDC mint, FEE_RECIPIENT, AUTHORITY_KEYPAIR, Helius, Polymarket, Vercel/Railway).
## Monitor dashboard (port 3002)
Built a standalone Express server on port 3002 that shares the main API process so it can import the `metrics` store directly. The monitor serves a self-contained HTML dashboard at `backend/src/monitor/monitor.html` (~1045 lines, then extended) that polls `/data` every second (configurable 0.5–10s, Pause button) and renders 13+ rows: overview / traffic / latency timeline / routes / process / Solana / external services / protocol state / USDC flows / cron / ML audit / model usage / **market filter funnel** / **market filter recent runs**. Client-side 300-sample history ring buffer. Pure Canvas/SVG charts, no external libs.
## ML model integration
Full correlation-model integration so every bundle creation flows through the model:
- **`backend/src/services/correlation.ts`** (~400 lines): `loadArtifacts()` memoised loader of 4 JSON deliverables; `scoreLegPair(a, b)` using noisy-OR of Jaccard text + tag + temporal signals; `optimizeWeights(legs)` greedy decorrelation with 2%/25% floor/cap; `assessBasketRisk(legs, weights)` with `risk_ratio = √(N·ρ + 1 − ρ)` vs tolerance 1.25; `getModelManifest()`
- **`backend/src/services/metrics.ts`**: added `modelBundlesScored/Accepted/Rejected`, `recordModelUsage`, `ModelUsageEvent` ring buffer
- **`backend/src/routes/bundles.ts`**: `POST /api/bundles` enriches legs with Polymarket metadata, runs `optimizeWeights`, runs `assessBasketRisk`, records usage, returns 422 on reject or 201 with `model` block
- **`backend/src/routes/ml.ts`**: added `GET /api/ml/manifest`
Smoke tested: 8-leg diverse basket accepts (ρ=0.008), 3-BTC-clone basket rejects (ρ=0.444, risk_ratio=1.37). Key correctness fix during dev: the initial guardrail compared projected CVaR_99 vs audited CVaR_99 absolute, which failed for small baskets; we corrected to a risk-ratio framing. We also changed the combiner from weighted sum to noisy-OR so a strong single signal (80% text overlap) triggers a correlation flag even without shared tags.
The honest limitation — preserved in `MODEL_INTEGRATION.md` §9 — is that the sklearn classifier in the production tarball is never actually invoked; the TypeScript `scoreLegPair` is a calibrated stand-in that never under-estimates correlation versus the classifier.
## NLP + market-filter pipeline
A five-stage filter that drops "BS markets" before they can be included in any basket:
1. `liquidity_floor` — drop closed / inactive / low-volume (<$5k) / missing-price markets
2. `quality_nlp` — drop troll / joke / unanswerable questions via `assessQuality` (length, binary trigger verb, time anchor, troll regex)
3. `time_window` — drop markets resolving in <2d or >180d
4. `category_classify` — softmax over seven keyword lexicons (crypto / sports / politics / economics / entertainment / tech / world); reject `other` and `entertainment` by default
5. `diversity_prefilter` — dedupe near-duplicates via TF-IDF cosine + the correlation service's `scoreLegPair`
Files:
- `backend/src/services/nlp.ts` — tokenizer + stemmer, 7 lexicons, classifier, quality heuristics, TF-IDF + cosine
- `backend/src/services/market-filter.ts` — full pipeline + `gateCheckLeg` bundle-gate helper (runs activity/quality/time-window independently, no short-circuit)
- `backend/src/routes/markets.ts` — `GET /api/markets/curated`, `GET /api/markets/curated/stats`
- `backend/src/routes/bundles.ts` — `POST /api/bundles` gates every leg through `gateCheckLeg`; rejects 422 on activity / quality / time-window failure
- `backend/src/services/metrics.ts` — lifetime funnel counters, `FilterRunEvent` ring buffer
- `backend/src/monitor/monitor.html` — two new rows (funnel counters + recent runs)
- Root doc: `MARKET_FILTER.md`
During the pipeline audit we caught and fixed three real bugs: an aggressive stemmer (`games → gam` instead of `game`); a classifier fallback that defaulted to `other` when only a single strong keyword was present; and a gate short-circuit that allowed closed markets to slip past the quality/time-window checks.
See `backend/scripts/nlp-probe.ts` — 26 unit probes for the NLP + pipeline primitives that all pass.
## Multi-product expansion (this session's major deliverable)
Restructured the authenticated app from a single 1527-line monolith into a proper Next.js App Router tree of product pages, and added two new product primitives on top of the existing Native Basket and PPN.
### Shared infrastructure (new)
- `app/app/_lib/tokens.ts` — design tokens: colours, fonts, easing, helpers
- `app/app/_lib/bundles.ts` — the 15 seeded STHS bundles (extracted from the monolith)
- `app/app/_lib/demo-state.tsx` — `SandboxProvider` + `useSandbox` reducer holding cash, basket positions, tranche positions, PPN vaults, loans, and lending deposits in a single typed state
- `app/app/_components/charts.tsx` — `Sparkline`, `PulseGauge`, `SvgDonut`, `BundleCard`, `MetricTile`, `Pill` primitives
- `app/app/_components/Header.tsx` — horizontal nav with live USDC balance and per-route active indicator
- `app/app/layout.tsx` — shell layout that wraps every `/app` route in `SandboxProvider`
### Product routes (new, each is its own Next route)
- `/app` — Markets landing: live curated Polymarket feed + category filter + 4 product entry tiles
- `/app/basket` + `/app/basket/[id]` — Native Basket index and detail (deposit flow wired to sandbox)
- `/app/tranche` + `/app/tranche/[id]` — tranche list and detail with waterfall chart, senior/mezz/junior selector, expected yield, attach/full-pay probabilities
- `/app/ppn` — Principal Protected Notes as a first-class product page: principal guaranteed, APY-based yield deployed into a reference basket, maturity selector
- `/app/lending` — lend USDC into the pool and borrow against basket collateral; utilization-based rate curve; LTV per tier
- `/app/hedge` — custom basket builder: picks legs from `/api/markets/curated`, toggles YES/NO side, calls `POST /api/hedge/analyze` to get live correlation matrix, optimized weights, risk-gate verdict, and a delta approximation
- `/app/portfolio` — unified view across cash + baskets + tranches + PPN + lending with a primitive-level donut, per-product sections, and deep links
### Backend additions (new)
- `backend/src/services/tranching.ts` — Normal-approximation basket-payout CDF and tranche quote engine (senior 0–60 / mezz 60–85 / junior 85–100)
- `backend/src/routes/tranches.ts` — `GET /api/tranches`, `GET /api/tranches/:bundleId`
- `backend/src/services/lending.ts` — in-memory pool state, piecewise-linear utilization curve, LTV table per collateral class, `snapshot/deposit/withdraw/borrow/repay/maxBorrow`
- `backend/src/routes/lending.ts` — `GET /api/lending`, `POST /api/lending/quote|lend|withdraw|borrow|repay`
- `backend/src/routes/hedge.ts` — `POST /api/hedge/analyze`, which fetches every leg from the live Gamma API, flips probabilities to `1-p` for NO-side legs, runs the correlation service, optimizer, and risk gate, and returns the pairwise corr matrix, optimized weights, verdict, and delta
All three new route bundles are mounted in `backend/src/index.ts`. The existing correlation service, market filter, monitor, and metrics store are reused directly — nothing backward-incompatible was changed.
### Key design decisions for v2
- Tranches and lending are in-memory + client-state for the hackathon; no new Anchor programs needed. The primitives are real at the service layer and wired end-to-end through the UI.
- The hedge builder is long-YES and synthetic-short (via probability flip). It reuses `scoreLegPair` from `correlation.ts` so the basket risk-gate numbers match what `POST /api/bundles` would produce.
- The legacy monolith page was moved to `app/_backup/monolith-page.tsx.bak` for reference; it's not routed because `_backup/` is a Next.js private folder.
## Verification at handoff
- Backend `tsc --noEmit` clean
- Frontend `tsc --project tsconfig.json --noEmit` clean
- NLP+filter probe at `backend/scripts/nlp-probe.ts` passes all 26 assertions
- Live HTTP smoke tests across `/api/markets/curated`, `/api/markets/curated/stats`, `/api/bundles` (troll bundle 422), `/api/metrics`, and the monitor `/data` endpoint all green
## Produced docs index
- `CREDENTIALS.md` — env-var inventory
- `MODEL_INTEGRATION.md` — correlation service design and limitations
- `MARKET_FILTER.md` — NLP pipeline, stages, and gate contract
- `PRODUCTS.md` — product taxonomy for the four primitives (new)
- `SESSION_NOTES.md` — this document
