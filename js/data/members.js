import { supabase, unwrap } from './client.js';

export const listMembers = async (sid) =>
  unwrap(await supabase.from('members').select('*').eq('space_id', sid).order('sort_order').order('created_at'));

export const insertMember = async (sid, p) =>
  unwrap(await supabase.from('members').insert({ ...p, space_id: sid }).select().single());

export const updateMember = async (id, p) =>
  unwrap(await supabase.from('members').update(p).eq('id', id).select().single());

export const deleteMember = async (id) => unwrap(await supabase.from('members').delete().eq('id', id));
