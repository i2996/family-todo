import { supabase, unwrap } from './client.js';

export const listTrips = async (sid) =>
  unwrap(await supabase.from('trips').select('*').eq('space_id', sid).order('start_date'));

export const insertTrip = async (sid, p) =>
  unwrap(await supabase.from('trips').insert({ ...p, space_id: sid }).select().single());

export const updateTrip = async (id, p) => unwrap(await supabase.from('trips').update(p).eq('id', id).select().single());

export const deleteTrip = async (id) => unwrap(await supabase.from('trips').delete().eq('id', id));
