import { supabase, unwrap } from './client.js';

export const listPurchases = async (sid) =>
  unwrap(await supabase.from('purchases').select('*').eq('space_id', sid).order('created_at'));

export const insertPurchase = async (sid, p) =>
  unwrap(await supabase.from('purchases').insert({ ...p, space_id: sid }).select().single());

export const updatePurchase = async (id, p) =>
  unwrap(await supabase.from('purchases').update(p).eq('id', id).select().single());

export const deletePurchase = async (id) => unwrap(await supabase.from('purchases').delete().eq('id', id));
