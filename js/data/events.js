import { supabase, unwrap } from './client.js';

export const listEvents = async (sid) =>
  unwrap(await supabase.from('events').select('*').eq('space_id', sid).order('start_date').order('start_time'));

export const insertEvent = async (sid, p) =>
  unwrap(await supabase.from('events').insert({ ...p, space_id: sid }).select().single());

export const updateEvent = async (id, p) => unwrap(await supabase.from('events').update(p).eq('id', id).select().single());

export const deleteEvent = async (id) => unwrap(await supabase.from('events').delete().eq('id', id));
