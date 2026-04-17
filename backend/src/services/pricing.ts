import { Leg, NAVResult } from '../types';
import { calculateNAV, calculateIssuePrice } from './nav';
import { getMarketProbability, fetchMarketByConditionId } from './polymarket';
import {
  getLegsByBundleId,
  updateLegProbability,
  updateLegResolution,
} from '../db/queries';

export async function getLiveNAV(bundleId: string): Promise<NAVResult | null> {
  const legs = await getLegsByBundleId(bundleId);
  if (legs.length === 0) return null;

  const activeLegs = legs.filter((l) => l.status === 'active');

  const updates = await Promise.allSettled(
    activeLegs.map(async (leg) => {
      const prob = await getMarketProbability(leg.market_id);
      if (prob !== null) {
        leg.probability = prob;
        await updateLegProbability(leg.id, prob);
      }
    })
  );

  for (const result of updates) {
    if (result.status === 'rejected') {
      console.error('Failed to update leg probability:', result.reason);
    }
  }

  return calculateNAV(legs, bundleId);
}

export async function getIssuePriceForBundle(bundleId: string): Promise<number | null> {
  const legs = await getLegsByBundleId(bundleId);
  if (legs.length === 0) return null;

  const activeLegs = legs.filter((l) => l.status === 'active');

  await Promise.allSettled(
    activeLegs.map(async (leg) => {
      const prob = await getMarketProbability(leg.market_id);
      if (prob !== null) {
        leg.probability = prob;
      }
    })
  );

  return calculateIssuePrice(legs);
}

export async function checkAndUpdateResolutions(bundleId: string): Promise<Leg[]> {
  const legs = await getLegsByBundleId(bundleId);
  const activeLegs = legs.filter((l) => l.status === 'active');
  const newlyResolved: Leg[] = [];

  await Promise.allSettled(
    activeLegs.map(async (leg) => {
      const market = await fetchMarketByConditionId(leg.market_id);
      if (!market) return;

      const prob = await getMarketProbability(leg.market_id);
      if (prob === null) return;

      let resolved = false;
      let status: 'won' | 'lost' = 'won';
      let resolutionValue = 1.0;

      if (market.closed) {
        resolved = true;
        if (prob >= 0.5) {
          status = 'won';
          resolutionValue = 1.0;
        } else {
          status = 'lost';
          resolutionValue = 0.0;
        }
      } else if (prob >= 0.99) {
        resolved = true;
        status = 'won';
        resolutionValue = 1.0;
      } else if (prob <= 0.01) {
        resolved = true;
        status = 'lost';
        resolutionValue = 0.0;
      }

      if (resolved) {
        await updateLegResolution(leg.id, status, resolutionValue);
        leg.status = status;
        leg.resolution_value = resolutionValue;
        leg.probability = prob;
        newlyResolved.push(leg);
      } else {
        leg.probability = prob;
        await updateLegProbability(leg.id, prob);
      }
    })
  );

  return newlyResolved;
}
