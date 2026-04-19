/**
 * AI portfolio composer. Given a risk tolerance + capital, calls Claude with
 * the live state of Senthos's three primitives (lending, tranches, curated
 * Polymarket markets) and asks for a structured allocation plan.
 *
 * The Rust programs and Supabase rows are untouched - this is purely an
 * off-chain suggestion endpoint. Output weights are forced through a tool
 * schema, then validated + renormalised + risk-scored server-side.
 */
import Anthropic from "@anthropic-ai/sdk";
import { snapshot as lendingSnapshot, type PoolSnapshot } from "./lending";
import { quoteTranches, type TrancheQuote } from "./tranching";
import { filterMarkets, type FilteredMarket } from "./market-filter";
import { fetchMarkets } from "./polymarket";
import { assessBasketRisk, type LegMetadata } from "./correlation";
import { getAllBundles } from "../db/queries";

const ANTHROPIC_TIMEOUT_MS = 30_000;
const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 2_500;
const CAPITAL_CAP_USD = 100_000;
const MAX_MARKETS_IN_PROMPT = 20;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY not set - portfolio composer is disabled",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

export interface PortfolioRequest {
  risk_pct: number;
  capital_usd: number;
  objective: "income" | "speculation" | "balanced";
}

export interface AllocationTrancheDetails {
  basket_name?: string;
  tier: "senior" | "mezzanine" | "junior";
  expected_yield_pct: number;
  price_per_token: number;
}
export interface AllocationLendingDetails {
  supply_apy_pct: number;
  utilization: number;
}
export interface AllocationMarketDetails {
  market_id: string;
  question: string;
  side: "YES" | "NO";
  implied_prob: number;
  category?: string;
}

export interface Allocation {
  kind: "tranche" | "lending" | "market";
  weight: number;
  usd_amount: number;
  details:
    | AllocationTrancheDetails
    | AllocationLendingDetails
    | AllocationMarketDetails;
  rationale: string;
}

export interface PortfolioResponse {
  allocations: Allocation[];
  summary: string;
  expected_apy_low: number;
  expected_apy_high: number;
  risk_score: number;
  generated_at: string;
  cache: {
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    input_tokens: number;
    output_tokens: number;
  };
}

// ---------------------------------------------------------------------------
// System prompt - frozen + cacheable. Kept verbose on purpose so the prefix
// clears Sonnet 4.6's 2048-token cache floor. Any byte change here (including
// a stray space) invalidates the cache.
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are the portfolio composer for Senthos, a protocol that packages prediction-market outcomes into structured products on Solana devnet. A user tells you how much capital they have and how much risk they are willing to take, and you respond with a portfolio allocation across three primitives that Senthos already supports. You always return your answer by calling the \`return_portfolio\` tool - never plain text.

## The three primitives

### 1. USDC Lending (kind: "lending")
A single USDC money-market pool. Users supply USDC and earn interest scaled by utilization; borrowers post basket or tranche tokens as collateral at tier-specific LTV ratios. The rate curve is piecewise linear: 2% APY at 0% utilization, ramping to ~8.4% at 80%, then steeply up beyond that. The supply APY is the borrow APY multiplied by utilization and (1 - reserve_factor).

Risk profile: very low. Lending is a stablecoin-denominated yield primitive. The only loss vectors are pool insolvency (collateral liquidations failing) and USDC itself depegging. For our purposes, treat this as the "cash equivalent" of the basket - always a valid choice, especially for risk-averse users or as ballast in higher-risk portfolios.

Allocation guidance: a single lending row makes sense. Do not split lending into multiple allocations.

### 2. Tranches (kind: "tranche")
Every Senthos basket can be sliced into three tranche classes on a payout waterfall:
- **senior** (attach 0 -> detach 0.60): takes the first 60% of basket payout. Highest probability of getting paid in full; lowest upside. Priced near par, expected APY is a modest coupon, typically 3-12% annualised depending on basket tier and horizon.
- **mezzanine** (attach 0.60 -> detach 0.85): middle slice. Moderate probability of full pay, moderate expected return.
- **junior** (attach 0.85 -> detach 1.0): takes the last 15% of basket payout. Lowest probability of full pay, highest upside multiple. Priced at a deep discount, expected APY is highest when the basket NAV is elevated.

Pricing assumes leg outcomes are independent Bernoulli(p) where p is the basket NAV; attach and full-pay probabilities are derived from a Normal approximation to the Binomial across max(8, totalLegs) legs. The user-visible prices and APYs are computed server-side and given to you below.

Risk profile:
- senior: low-to-moderate. Pays before mezz or junior take anything. Suitable across the risk spectrum.
- mezzanine: moderate. A middle-of-the-road pick for balanced objectives.
- junior: high. Binary-looking payoff; best when the user has high risk tolerance AND the basket NAV is >= 0.7 (otherwise the attach probability is too low to be interesting).

Allocation guidance: at most one allocation per tier. When risk_pct is low (<= 30), prefer senior. When risk_pct is medium (30-70), a mix of senior + mezzanine is natural. Junior is only appropriate when risk_pct >= 70.

### 3. Polymarket markets (kind: "market")
Individual binary-outcome contracts resolving YES or NO. Each contract pays $1 at resolution if the outcome occurs, $0 otherwise. Current market price implies the market-consensus probability of YES. You can go long either side:
- BUY YES at price p - cost per contract = p, payout = $1 if YES resolves. Net return if YES = (1-p)/p.
- BUY NO at price p - cost per contract = (1-p), payout = $1 if NO resolves. Net return if NO = p/(1-p).

The markets list you receive below has already passed a five-stage filter (liquidity floor $5k+, NLP quality, 2-180 day resolution window, categorised, diversity-deduplicated). Volumes, yes probabilities, categories, and days-to-resolution are included.

Risk profile: highest variance of any primitive. Outcomes are binary and uncorrelated with public equity markets but strongly correlated within topics (all NBA markets move together). A single market allocation has a ~50% chance of going to zero by definition of a binary outcome. Variance compounds when multiple markets share tags or themes.

Allocation guidance:
- Never put more than 30% of the portfolio in a single market.
- Diversify across categories. If you pick 4 markets, do not pick 4 sports markets - pick one from 4 different categories (categories shown below are: crypto, sports, politics, economics, entertainment, tech, world, other).
- Prefer markets where you believe the current YES price under- or over-states the true probability. If the user's objective is "speculation", bias toward markets where your conviction is strongest (even at the cost of diversification). If "income" or "balanced", favour diversified low-beta picks (volumes >= $50k, yes probability in the 0.25-0.75 band).
- Pick the side (YES or NO) with clearest positive expected value relative to the market price.

## Risk tolerance -> allocation heuristics

These are defaults. Deviate if the objective argues for it; do not deviate wildly.

- **risk_pct 0-30 (conservative)**: 50-70% lending, 20-40% senior tranche, 0-10% curated markets (or none). Expected APY range: 3-8%.
- **risk_pct 30-70 (balanced)**: 15-35% lending, 25-45% senior + mezzanine tranches (skew toward mezz as risk rises), 15-35% 2-4 diversified curated markets. Expected APY range: 6-18%.
- **risk_pct 70-100 (aggressive)**: 0-15% lending (just for dry powder), 15-35% junior tranche, 40-70% curated markets with stronger conviction bets (fewer, larger positions). Expected APY range: 15-50% (with correspondingly higher variance).

## Objective semantics

- **income**: prefer steady yield. Minimum 20% lending + senior tranche combined; markets (if any) should lean toward high-volume / low-variance picks. APY range should reflect steady compounding (narrower low-high gap).
- **balanced**: no hard constraints - follow the risk-tolerance defaults straightforwardly. APY range should be moderately wide.
- **speculation**: maximise expected-return variance. Junior tranche or markets get larger allocations; lending is the floor that keeps some capital working. APY range should reflect the wider dispersion (low value can be near 0%; high can reach 50%+).

## Diversity rules (hard)

Do not construct a portfolio where all market legs share the same category. If you include 3 market legs and 2 are "sports", either swap one or drop to 2 markets. Every allocation that involves markets should touch at least two distinct categories when >=3 markets are selected.

## Output contract

Call \`return_portfolio\` with:
- \`allocations\`: 3-6 entries. Weights MUST sum to exactly 1.0. Mix at least two kinds unless the user is at the extremes (<5 or >95 risk_pct).
- For each allocation:
  - \`kind\`: one of "tranche", "lending", "market"
  - \`weight\`: number in [0, 1]
  - \`details\`: for tranches, include { basket_name, tier, expected_yield_pct, price_per_token }. For lending, include { supply_apy_pct, utilization }. For markets, include { market_id, question, side, implied_prob, category }.
  - \`rationale\`: MUST be 25 words or fewer. Name the specific edge, skip qualifiers.
- \`summary\`: MUST be 40 words or fewer. State the risk split + the single scenario that pays off best.
- \`expected_apy_low\`: conservative (10th-percentile) annualised return expectation, in percent. Can be 0 or negative with significant market exposure.
- \`expected_apy_high\`: optimistic (90th-percentile) annualised return expectation, in percent.

The gap between low and high should reflect the risk taken on. A 20/80 lending + senior portfolio should have a tight range (say 3-8%). A 10% lending + 20% junior + 70% markets portfolio should have a wide range (say -15% to 60%).

Do not invent values. Tranche yields, prices, lending APY, and market probabilities are given to you exactly - copy them into the details fields. Market IDs must be the conditionId strings below, character-for-character.

BREVITY MATTERS. The response must complete in under 8 seconds of generation, which means fewer than 800 output tokens total. Do not pad rationales. Do not restate the user's inputs in the summary. Do not explain what a tranche is or what lending is - the caller already knows.`;

// ---------------------------------------------------------------------------
// Tool schema - force Claude to return structured JSON. We add usd_amount,
// risk_score, and generated_at server-side so the model is never asked to
// invent them.
// ---------------------------------------------------------------------------

const RETURN_PORTFOLIO_TOOL: Anthropic.Tool = {
  name: "return_portfolio",
  description:
    "Return the final constructed portfolio. Call this exactly once. Do not emit any text alongside it.",
  input_schema: {
    type: "object",
    properties: {
      allocations: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: ["tranche", "lending", "market"],
              description: "Which primitive this allocation uses.",
            },
            weight: {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: "Fraction of the portfolio, in [0, 1].",
            },
            details: {
              type: "object",
              description:
                "Shape depends on kind. tranche: { basket_name, tier, expected_yield_pct, price_per_token }. lending: { supply_apy_pct, utilization }. market: { market_id, question, side, implied_prob, category }.",
              properties: {
                basket_name: { type: "string" },
                tier: {
                  type: "string",
                  enum: ["senior", "mezzanine", "junior"],
                },
                expected_yield_pct: { type: "number" },
                price_per_token: { type: "number" },
                supply_apy_pct: { type: "number" },
                utilization: { type: "number" },
                market_id: { type: "string" },
                question: { type: "string" },
                side: { type: "string", enum: ["YES", "NO"] },
                implied_prob: { type: "number" },
                category: { type: "string" },
              },
            },
            rationale: {
              type: "string",
              description: "1-2 sentences justifying this specific leg.",
            },
          },
          required: ["kind", "weight", "details", "rationale"],
        },
      },
      summary: {
        type: "string",
        description:
          "2-3 sentence strategy explanation covering risk split and scenarios.",
      },
      expected_apy_low: { type: "number" },
      expected_apy_high: { type: "number" },
    },
    required: [
      "allocations",
      "summary",
      "expected_apy_low",
      "expected_apy_high",
    ],
  },
};

// ---------------------------------------------------------------------------
// Primitive fetching
// ---------------------------------------------------------------------------

interface Primitives {
  lending: PoolSnapshot;
  markets: FilteredMarket[];
  tranches: TrancheQuote[];
  refBundle: {
    id: string;
    name: string;
    risk_tier: number;
    nav: number;
    days: number;
    legs: number;
  };
}

async function fetchPrimitives(): Promise<Primitives> {
  const lending = lendingSnapshot();

  // Curated markets via the existing filter pipeline.
  const raw = await fetchMarkets({ limit: 80, active: true, closed: false });
  const filtered = filterMarkets(raw, {});
  const markets = [...filtered.kept]
    .sort((a, b) => b.volumeUsd - a.volumeUsd)
    .slice(0, MAX_MARKETS_IN_PROMPT);

  // Tranche quotes: pick the first active bundle if Supabase has one,
  // otherwise fall back to a mock so the endpoint still works pre-seed.
  const bundles = await getAllBundles();
  let refBundle: Primitives["refBundle"];
  if (bundles.length > 0) {
    const b = bundles[0];
    const days = Math.max(
      1,
      Math.ceil(
        (new Date(b.resolution_date).getTime() - Date.now()) / 86_400_000,
      ),
    );
    const nav = Math.max(0.05, Math.min(0.95, b.issue_price ?? 0.5));
    refBundle = {
      id: b.id,
      name: b.name,
      risk_tier: b.risk_tier,
      nav,
      days,
      legs: 11,
    };
  } else {
    refBundle = {
      id: "mock",
      name: "Demo Basket (mock)",
      risk_tier: 70,
      nav: 0.5,
      days: 30,
      legs: 11,
    };
  }
  const tranches = quoteTranches({
    bundleNav: refBundle.nav,
    totalLegs: refBundle.legs,
    horizonDays: refBundle.days,
  });

  return { lending, markets, tranches, refBundle };
}

// ---------------------------------------------------------------------------
// User prompt - the volatile block. Kept outside cache_control on purpose.
// ---------------------------------------------------------------------------

function buildUserMessage(req: PortfolioRequest, prims: Primitives): string {
  const marketLines = prims.markets
    .map((m, i) => {
      const condId =
        (m.market as any).conditionId || (m.market as any).id || `market-${i}`;
      const yes = m.yesProbability != null ? (m.yesProbability * 100).toFixed(1) : "?";
      const days =
        m.daysToResolution != null ? m.daysToResolution.toFixed(0) : "?";
      return `- id=${condId} | cat=${m.category} | yes=${yes}% | vol=$${Math.round(m.volumeUsd)} | days=${days} | "${m.market.question}"`;
    })
    .join("\n");

  const trancheLines = prims.tranches
    .map(
      (t) =>
        `- ${t.kind}: price $${t.pricePerToken.toFixed(4)} / face $1, expected APY ${t.expectedYieldPct}%, attachP=${(t.attachProbability * 100).toFixed(1)}%, fullPayP=${(t.fullPayProbability * 100).toFixed(1)}%`,
    )
    .join("\n");

  return `## User profile
- risk_pct: ${req.risk_pct}/100
- capital_usd: $${req.capital_usd}
- objective: ${req.objective}

## Live primitives

### 1. USDC lending pool
- supply_apy: ${prims.lending.supply_rate_apy}%
- borrow_apy: ${prims.lending.borrow_rate_apy}%
- utilization: ${(prims.lending.utilization * 100).toFixed(1)}%
- total_deposits: $${prims.lending.total_deposits}

### 2. Reference basket for tranche pricing
- basket: "${prims.refBundle.name}" (tier ${prims.refBundle.risk_tier}, NAV ${prims.refBundle.nav.toFixed(2)}, ${prims.refBundle.days} days to resolution)
- Tranche quotes on this basket:
${trancheLines}

### 3. Curated Polymarket markets (top ${prims.markets.length} by volume, after NLP + liquidity + diversity filter)
${marketLines || "- (no markets available - Polymarket proxy unreachable)"}

Construct the portfolio now by calling return_portfolio. Weights must sum to 1.0. Use the tranche quote rows above verbatim for the tranche details (do not invent yields). Use market conditionIds character-for-character. Include 3-8 allocations.`;
}

// ---------------------------------------------------------------------------
// Anthropic call with timeout
// ---------------------------------------------------------------------------

async function callClaude(userMessage: string): Promise<{
  parsed: any;
  usage: Anthropic.Usage;
}> {
  const client = getClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ANTHROPIC_TIMEOUT_MS);
  try {
    // NOTE: no `thinking` config here. The Anthropic API rejects adaptive
    // thinking when tool_choice forces a specific tool, which is how we
    // guarantee a structured return_portfolio call. Speed is also fine
    // without thinking for a one-shot allocation decision.
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
        tools: [RETURN_PORTFOLIO_TOOL],
        tool_choice: { type: "tool", name: "return_portfolio" },
      },
      { signal: controller.signal, timeout: ANTHROPIC_TIMEOUT_MS },
    );
    const toolBlock = response.content.find(
      (b): b is Anthropic.ToolUseBlock =>
        b.type === "tool_use" && b.name === "return_portfolio",
    );
    if (!toolBlock) {
      throw new Error(
        `Claude did not call return_portfolio. stop_reason=${response.stop_reason}`,
      );
    }
    return { parsed: toolBlock.input, usage: response.usage };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Validation, renormalisation, risk scoring
// ---------------------------------------------------------------------------

function validateAndRenormalize(
  parsed: any,
  capital_usd: number,
): {
  allocations: Allocation[];
  summary: string;
  expected_apy_low: number;
  expected_apy_high: number;
} {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("tool input is not an object");
  }
  if (!Array.isArray(parsed.allocations) || parsed.allocations.length === 0) {
    throw new Error("allocations must be a non-empty array");
  }
  if (typeof parsed.summary !== "string") throw new Error("summary missing");
  if (
    typeof parsed.expected_apy_low !== "number" ||
    typeof parsed.expected_apy_high !== "number"
  ) {
    throw new Error("expected_apy_low / expected_apy_high must be numbers");
  }

  let sum = 0;
  for (const a of parsed.allocations) {
    if (typeof a.weight !== "number" || !Number.isFinite(a.weight)) {
      throw new Error("non-numeric weight");
    }
    if (a.weight < 0 || a.weight > 1) {
      throw new Error(`weight ${a.weight} out of [0, 1]`);
    }
    sum += a.weight;
  }
  if (Math.abs(sum - 1) > 0.01) {
    throw new Error(
      `weights sum to ${sum.toFixed(4)}, outside tolerance of 0.01`,
    );
  }

  // Renormalise to exactly 1.0 and compute usd_amount.
  const allocations: Allocation[] = parsed.allocations.map((a: any) => {
    const w = a.weight / sum;
    return {
      kind: a.kind,
      weight: +w.toFixed(4),
      usd_amount: +(w * capital_usd).toFixed(2),
      details: a.details ?? {},
      rationale: typeof a.rationale === "string" ? a.rationale : "",
    };
  });

  return {
    allocations,
    summary: parsed.summary,
    expected_apy_low: +parsed.expected_apy_low.toFixed(2),
    expected_apy_high: +parsed.expected_apy_high.toFixed(2),
  };
}

/**
 * Risk score 0-100. Lending contributes almost nothing (~2 per weight unit),
 * tranches contribute per-tier (senior 10, mezz 40, junior 75), and markets
 * go through `assessBasketRisk` - only the market legs are treated as a
 * basket, using normalised weights across the market allocations only.
 */
function computeRiskScore(allocations: Allocation[]): number {
  let trancheRisk = 0;
  let lendingRisk = 0;
  const marketAllocs: Allocation[] = [];

  for (const a of allocations) {
    if (a.kind === "tranche") {
      const tier = (a.details as AllocationTrancheDetails).tier;
      const factor =
        tier === "senior" ? 0.1 : tier === "mezzanine" ? 0.4 : 0.75;
      trancheRisk += a.weight * factor;
    } else if (a.kind === "lending") {
      lendingRisk += a.weight * 0.02;
    } else if (a.kind === "market") {
      marketAllocs.push(a);
    }
  }

  let marketRisk = 0;
  if (marketAllocs.length > 0) {
    const marketWeightSum = marketAllocs.reduce((s, a) => s + a.weight, 0);
    const legs: LegMetadata[] = marketAllocs.map((a, i) => {
      const d = a.details as AllocationMarketDetails;
      return {
        id: d.market_id || `leg-${i}`,
        question: d.question || "",
        probability: d.implied_prob,
        tags: d.category ? [d.category] : [],
      };
    });
    const normalizedWeights = marketAllocs.map(
      (a) => a.weight / marketWeightSum,
    );
    try {
      const risk = assessBasketRisk(legs, normalizedWeights);
      marketRisk = Math.min(1, risk.cvar_99_projected * 4) * marketWeightSum;
    } catch {
      marketRisk = marketWeightSum * 0.8;
    }
  }

  const combined = marketRisk + trancheRisk + lendingRisk;
  return Math.round(Math.max(0, Math.min(100, combined * 100)));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function constructPortfolio(
  req: PortfolioRequest,
): Promise<PortfolioResponse> {
  if (req.risk_pct < 0 || req.risk_pct > 100) {
    throw new Error("risk_pct must be in [0, 100]");
  }
  if (req.capital_usd <= 0 || req.capital_usd > CAPITAL_CAP_USD) {
    throw new Error(
      `capital_usd must be in (0, ${CAPITAL_CAP_USD}] for demo safety`,
    );
  }

  const prims = await fetchPrimitives();
  const userMessage = buildUserMessage(req, prims);
  const { parsed, usage } = await callClaude(userMessage);
  const validated = validateAndRenormalize(parsed, req.capital_usd);
  const risk_score = computeRiskScore(validated.allocations);

  return {
    allocations: validated.allocations,
    summary: validated.summary,
    expected_apy_low: validated.expected_apy_low,
    expected_apy_high: validated.expected_apy_high,
    risk_score,
    generated_at: new Date().toISOString(),
    cache: {
      cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
    },
  };
}
