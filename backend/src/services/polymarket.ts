import { PolymarketMarket, PolymarketEvent } from '../types';

const GAMMA_API = 'https://gamma-api.polymarket.com';
const CLOB_API = 'https://clob.polymarket.com';

interface GammaMarketResponse {
  id: string;
  question: string;
  conditionId: string;
  outcomePrices: string;
  volume: string;
  active: boolean;
  closed: boolean;
  endDate?: string;
  slug: string;
  tokens?: Array<{
    token_id: string;
    outcome: string;
    price: number;
  }>;
  // Parent events: Polymarket groups correlated questions under one event
  // (e.g. "What will happen before GTA VI?"). The first entry is used for
  // linking and for cross-basket correlation dedupe.
  events?: Array<{
    id?: string;
    slug?: string;
    title?: string;
  }>;
  // Price telemetry (all optional — newer markets may not have long-horizon
  // changes yet, and Gamma does not always emit oneDayPriceChange on every
  // row; we forward whichever fields are present).
  lastTradePrice?: number;
  oneDayPriceChange?: number;
  oneWeekPriceChange?: number;
  oneMonthPriceChange?: number;
}

interface GammaEventResponse {
  id: string;
  title: string;
  slug: string;
  endDate?: string;
  markets: GammaMarketResponse[];
}

// Gamma caps per-page at 500. We paginate with offset when more are needed.
const GAMMA_PAGE_MAX = 500;
// Browser-style UA — some Polymarket edges 403 default User-Agents.
const POLY_FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; senthos-backend/1.0)',
  'Accept': 'application/json',
};

async function fetchWithRetry(url: string, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: POLY_FETCH_HEADERS });
      if (response.ok) return response;
      if (response.status >= 500 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      console.error(`Polymarket API ${response.status}: ${url}`);
      return null;
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      console.error(`Polymarket API fetch failed: ${url}`, err);
      return null;
    }
  }
  return null;
}

function parseOutcomePrices(raw: string): number[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((p: string) => parseFloat(p));
    }
  } catch {
    console.error('Failed to parse outcomePrices:', raw);
  }
  return [];
}

function toPolymarketMarket(m: GammaMarketResponse): PolymarketMarket {
  const primaryEvent = m.events?.[0];
  return {
    id: m.id,
    question: m.question,
    condition_id: m.conditionId,
    tokens: m.tokens || [],
    outcomePrices: m.outcomePrices,
    volume: m.volume,
    active: m.active,
    closed: m.closed,
    end_date_iso: m.endDate,
    slug: m.slug,
    event_id: primaryEvent?.id,
    event_slug: primaryEvent?.slug,
    event_title: primaryEvent?.title,
    last_trade_price: m.lastTradePrice,
    one_day_price_change: m.oneDayPriceChange,
    one_week_price_change: m.oneWeekPriceChange,
    one_month_price_change: m.oneMonthPriceChange,
  };
}

function toPolymarketEvent(e: GammaEventResponse): PolymarketEvent {
  return {
    id: e.id,
    title: e.title,
    slug: e.slug,
    end_date_iso: e.endDate || '',
    markets: (e.markets || []).map(toPolymarketMarket),
  };
}

/**
 * Fetch Polymarket markets. When the caller asks for more than Gamma's
 * per-page cap (500), we paginate via `offset` until we have enough.
 *
 * Callers can pass limit up to ~5000 to retrieve the full live universe.
 */
export async function fetchMarkets(params: {
  limit?: number;
  active?: boolean;
  closed?: boolean;
}): Promise<PolymarketMarket[]> {
  const want = params.limit ?? GAMMA_PAGE_MAX;
  const collected: GammaMarketResponse[] = [];
  let offset = 0;

  while (collected.length < want) {
    const pageSize = Math.min(GAMMA_PAGE_MAX, want - collected.length);
    const searchParams = new URLSearchParams();
    searchParams.set('limit', String(pageSize));
    if (params.active !== undefined) searchParams.set('active', String(params.active));
    if (params.closed !== undefined) searchParams.set('closed', String(params.closed));
    searchParams.set('offset', String(offset));

    const url = `${GAMMA_API}/markets?${searchParams.toString()}`;
    const res = await fetchWithRetry(url);
    if (!res) break;

    const batch = (await res.json()) as GammaMarketResponse[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    collected.push(...batch);

    // Gamma signalled end-of-results by returning fewer than requested.
    if (batch.length < pageSize) break;
    offset += batch.length;
  }

  return collected.map(toPolymarketMarket);
}

export async function fetchMarketByConditionId(
  conditionId: string
): Promise<PolymarketMarket | null> {
  // Gamma API: numeric IDs work in path, conditionIds need slug lookup
  // Try numeric ID path first (most reliable)
  const url = `${GAMMA_API}/markets/${conditionId}`;
  const res = await fetchWithRetry(url);
  if (!res) return null;

  const data = (await res.json()) as GammaMarketResponse;
  // Path returns single object, not array
  if (data && data.question) {
    return toPolymarketMarket(data);
  }
  return null;
}

export async function fetchEvents(params: {
  limit?: number;
  active?: boolean;
}): Promise<PolymarketEvent[]> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.active !== undefined) searchParams.set('active', String(params.active));

  const url = `${GAMMA_API}/events?${searchParams.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res) return [];

  const data = (await res.json()) as GammaEventResponse[];
  return data.map(toPolymarketEvent);
}

export async function fetchEventById(eventId: string): Promise<PolymarketEvent | null> {
  const url = `${GAMMA_API}/events/${eventId}`;
  const res = await fetchWithRetry(url);
  if (!res) return null;

  const data = (await res.json()) as GammaEventResponse;
  return toPolymarketEvent(data);
}

export async function getMarketProbability(conditionId: string): Promise<number | null> {
  const market = await fetchMarketByConditionId(conditionId);
  if (!market) return null;

  const prices = parseOutcomePrices(market.outcomePrices);
  if (prices.length === 0) return null;

  return prices[0]; // first outcome = YES
}

export async function getBatchProbabilities(
  conditionIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (conditionIds.length === 0) return result;

  const promises = conditionIds.map(async (id) => {
    const prob = await getMarketProbability(id);
    if (prob !== null) {
      result.set(id, prob);
    }
  });

  await Promise.all(promises);
  return result;
}

export async function searchMarkets(
  query: string,
  limit: number = 20
): Promise<PolymarketMarket[]> {
  // Try text_query param first (Gamma API search)
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(limit));
  searchParams.set('active', 'true');
  searchParams.set('closed', 'false');
  searchParams.set('text_query', query);

  const url = `${GAMMA_API}/markets?${searchParams.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res) return [];

  const data = (await res.json()) as GammaMarketResponse[];
  return data.map(toPolymarketMarket);
}

export async function getHighLiquidityMarkets(
  minVolume: number,
  limit: number
): Promise<PolymarketMarket[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('limit', String(limit * 3)); // overfetch to account for volume filtering
  searchParams.set('active', 'true');
  searchParams.set('closed', 'false');
  searchParams.set('order', 'volume');
  searchParams.set('ascending', 'false');

  const url = `${GAMMA_API}/markets?${searchParams.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res) return [];

  const data = (await res.json()) as GammaMarketResponse[];
  return data
    .filter((m) => parseFloat(m.volume) >= minVolume)
    .slice(0, limit)
    .map(toPolymarketMarket);
}
