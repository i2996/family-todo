// 가계부 DB 접근. 어떤 내역이 보이는지는 서버(RLS)가 PIN 을 푼 기기 기준으로 걸러준다.
import { supabase, unwrap } from './client.js';

export const listEntries = async (sid) =>
  unwrap(await supabase.from('ledger_entries').select('*').eq('space_id', sid).order('entry_date', { ascending: false }).order('created_at', { ascending: false }));

export const insertEntry = async (sid, p) =>
  unwrap(await supabase.from('ledger_entries').insert({ ...p, space_id: sid }).select().single());

export const updateEntry = async (id, p) => unwrap(await supabase.from('ledger_entries').update(p).eq('id', id).select().single());

export const deleteEntry = async (id) => unwrap(await supabase.from('ledger_entries').delete().eq('id', id));

/** [{ member_id, has_pin, is_me }] */
export const status = async (sid) => unwrap(await supabase.rpc('ledger_status', { p_space: sid }));

/** 'ok' | 'wrong' | 'locked' | 'no_pin' */
export const unlock = async (memberId, pin) => unwrap(await supabase.rpc('ledger_unlock', { p_member: memberId, p_pin: pin }));

/** 'ok' | 'wrong' | 'locked' | 'bad_pin' */
export const setPin = async (memberId, pin, oldPin = null) =>
  unwrap(await supabase.rpc('ledger_set_pin', { p_member: memberId, p_pin: pin, p_old: oldPin }));

export const lock = async (sid) => unwrap(await supabase.rpc('ledger_lock', { p_space: sid }));
