import { supabase, unwrap } from './client.js';

export const listPlans = async (sid) =>
  unwrap(await supabase.from('trip_plans').select('*').eq('space_id', sid).order('created_at'));

export const insertPlan = async (sid, p) =>
  unwrap(await supabase.from('trip_plans').insert({ ...p, space_id: sid }).select().single());

export const updatePlan = async (id, p) => unwrap(await supabase.from('trip_plans').update(p).eq('id', id).select().single());

export const deletePlan = async (id) => unwrap(await supabase.from('trip_plans').delete().eq('id', id));
