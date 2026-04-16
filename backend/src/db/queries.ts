import { supabase } from './supabase';
import { Bundle, Leg, Position, Transaction, BundleWithLegs } from '../types';

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
