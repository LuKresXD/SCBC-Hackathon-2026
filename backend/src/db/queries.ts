import { supabase } from './supabase';
import { Bundle, Leg, Position, Transaction, BundleWithLegs, NAVSnapshot, LegNAVContribution } from '../types';

// --- Bundles ---

export async function getAllBundles(): Promise<Bundle[]> {
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllBundles error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getBundleById(id: string): Promise<Bundle | null> {
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('getBundleById error:', error.message);
    return null;
  }
  return data;
}

export async function getBundleByName(name: string): Promise<Bundle | null> {
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    console.error('getBundleByName error:', error.message);
    return null;
  }
  return data;
}

export async function createBundle(
  bundle: Omit<Bundle, 'id' | 'created_at' | 'status'>
): Promise<Bundle | null> {
  const { data, error } = await supabase
    .from('bundles')
    .insert(bundle)
    .select()
    .single();

  if (error) {
    console.error('createBundle error:', error.message);
    return null;
  }
  return data;
}

export async function updateBundleStatus(
  bundleId: string,
  status: Bundle['status']
): Promise<Bundle | null> {
  const { data, error } = await supabase
    .from('bundles')
    .update({ status })
    .eq('id', bundleId)
    .select()
    .single();

  if (error) {
    console.error('updateBundleStatus error:', error.message);
    return null;
  }
  return data;
}

// --- Legs ---

export async function getLegsByBundleId(bundleId: string): Promise<Leg[]> {
  const { data, error } = await supabase
    .from('legs')
    .select('*')
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('getLegsByBundleId error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getBundleWithLegs(id: string): Promise<BundleWithLegs | null> {
  const bundle = await getBundleById(id);
  if (!bundle) return null;

  const legs = await getLegsByBundleId(id);

  const nav = legs.reduce((sum, leg) => {
    const value = leg.status === 'active'
      ? leg.probability
      : (leg.resolution_value ?? 0);
    return sum + leg.weight * value;
  }, 0);

  return {
    ...bundle,
    legs,
    nav,
    num_legs: legs.length,
    resolved_legs: legs.filter(l => l.status !== 'active').length,
  };
}

export async function createLeg(
  leg: Omit<Leg, 'id' | 'created_at' | 'status'>
): Promise<Leg | null> {
  const { data, error } = await supabase
    .from('legs')
    .insert(leg)
    .select()
    .single();

  if (error) {
    console.error('createLeg error:', error.message);
    return null;
  }
  return data;
}

export async function updateLegProbability(
  legId: string,
  probability: number
): Promise<Leg | null> {
  const { data, error } = await supabase
    .from('legs')
    .update({ probability })
    .eq('id', legId)
    .select()
    .single();

  if (error) {
    console.error('updateLegProbability error:', error.message);
    return null;
  }
  return data;
}

export async function updateLegResolution(
  legId: string,
  status: 'won' | 'lost',
  resolutionValue: number
): Promise<Leg | null> {
  const { data, error } = await supabase
    .from('legs')
    .update({ status, resolution_value: resolutionValue })
    .eq('id', legId)
    .select()
    .single();

  if (error) {
    console.error('updateLegResolution error:', error.message);
    return null;
  }
  return data;
}

// --- Positions ---

export async function createPosition(
  position: Omit<Position, 'id' | 'created_at'>
): Promise<Position | null> {
  const { data, error } = await supabase
    .from('positions')
    .insert(position)
    .select()
    .single();

  if (error) {
    console.error('createPosition error:', error.message);
    return null;
  }
  return data;
}

export async function getPositionsByWallet(walletAddress: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPositionsByWallet error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getPositionsByBundle(bundleId: string): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPositionsByBundle error:', error.message);
    return [];
  }
  return data ?? [];
}

// --- Transactions ---

export async function createTransaction(
  transaction: Omit<Transaction, 'id' | 'created_at'>
): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('transactions')
    .insert(transaction)
    .select()
    .single();

  if (error) {
    console.error('createTransaction error:', error.message);
    return null;
  }
  return data;
}

export async function getTransactionsByWallet(walletAddress: string): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getTransactionsByWallet error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getPositionsByWalletAndBundle(
  walletAddress: string,
  bundleId: string
): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet_address', walletAddress)
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getPositionsByWalletAndBundle error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function updatePositionTokens(
  positionId: string,
  tokensHeld: number
): Promise<Position | null> {
  const { data, error } = await supabase
    .from('positions')
    .update({ tokens_held: tokensHeld })
    .eq('id', positionId)
    .select()
    .single();

  if (error) {
    console.error('updatePositionTokens error:', error.message);
    return null;
  }
  return data;
}

// --- NAV Snapshots ---

export async function createNAVSnapshot(
  bundleId: string,
  nav: number,
  legsData: LegNAVContribution[]
): Promise<NAVSnapshot | null> {
  const { data, error } = await supabase
    .from('nav_snapshots')
    .insert({ bundle_id: bundleId, nav, legs_data: legsData })
    .select()
    .single();

  if (error) {
    console.error('createNAVSnapshot error:', error.message);
    return null;
  }
  return data;
}

export async function getNAVHistory(
  bundleId: string,
  limit: number = 100
): Promise<NAVSnapshot[]> {
  const { data, error } = await supabase
    .from('nav_snapshots')
    .select('*')
    .eq('bundle_id', bundleId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('getNAVHistory error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getNAVHistorySince(
  bundleId: string,
  since: string
): Promise<NAVSnapshot[]> {
  const { data, error } = await supabase
    .from('nav_snapshots')
    .select('*')
    .eq('bundle_id', bundleId)
    .gte('created_at', since)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getNAVHistorySince error:', error.message);
    return [];
  }
  return data ?? [];
}

// --- Admin / Stats ---

export async function getAllPositions(): Promise<Position[]> {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllPositions error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getAllTransactions(params?: {
  wallet?: string;
  type?: string;
  limit?: number;
}): Promise<Transaction[]> {
  let query = supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (params?.wallet) {
    query = query.eq('wallet_address', params.wallet);
  }
  if (params?.type) {
    query = query.eq('type', params.type);
  }
  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('getAllTransactions error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getAllLegs(): Promise<Leg[]> {
  const { data, error } = await supabase
    .from('legs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('getAllLegs error:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getTransactionStats(): Promise<{
  total_deposited: number;
  total_redeemed: number;
  total_fees: number;
}> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*');

  if (error) {
    console.error('getTransactionStats error:', error.message);
    return { total_deposited: 0, total_redeemed: 0, total_fees: 0 };
  }

  const transactions = data ?? [];

  const total_deposited = transactions
    .filter((t) => t.type === 'deposit')
    .reduce((sum, t) => sum + t.amount_usdc, 0);

  const total_redeemed = transactions
    .filter((t) => t.type === 'redemption')
    .reduce((sum, t) => sum + t.amount_usdc, 0);

  const total_fees = transactions.reduce((sum, t) => sum + t.fee_usdc, 0);

  return { total_deposited, total_redeemed, total_fees };
}
