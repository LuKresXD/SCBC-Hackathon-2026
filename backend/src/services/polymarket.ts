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
}

interface GammaEventResponse {
  id: string;
  title: string;
  slug: string;
  endDate?: string;
  markets: GammaMarketResponse[];
}

async function fetchWithRetry(url: string, retries = 1): Promise<Response | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url);
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

export async function fetchMarkets(params: {
  limit?: number;
  active?: boolean;
  closed?: boolean;
}): Promise<PolymarketMarket[]> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set('limit', String(params.limit));
  if (params.active !== undefined) searchParams.set('active', String(params.active));
  if (params.closed !== undefined) searchParams.set('closed', String(params.closed));

  const url = `${GAMMA_API}/markets?${searchParams.toString()}`;
  const res = await fetchWithRetry(url);
  if (!res) return [];

  const data = (await res.json()) as GammaMarketResponse[];
  return data.map(toPolymarketMarket);
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
