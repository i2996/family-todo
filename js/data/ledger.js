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

/* ---------- 반복 규칙 (ledger-repeat.sql) ---------- */
export const listRepeats = async (sid) =>
  unwrap(await supabase.from('ledger_repeats').select('*').eq('space_id', sid).order('created_at'));

export const insertRepeat = async (sid, p) =>
  unwrap(await supabase.from('ledger_repeats').insert({ ...p, space_id: sid }).select().single());

export const updateRepeat = async (id, p) => unwrap(await supabase.from('ledger_repeats').update(p).eq('id', id).select().single());

export const deleteRepeat = async (id) => unwrap(await supabase.from('ledger_repeats').delete().eq('id', id));

/** 반복 내역 한꺼번에 넣기 (이미 있는 날짜는 건너뜀) */
export const upsertRepeatEntries = async (sid, rows) =>
  rows.length
    ? unwrap(await supabase.from('ledger_entries').upsert(rows.map((r) => ({ ...r, space_id: sid })), { onConflict: 'repeat_id,repeat_date', ignoreDuplicates: true }))
    : null;

/** 그 반복의 오늘 이후 내역 중 따로 고치지 않은 것 지우기 */
export const deleteFutureOfRepeat = async (repeatId, today) =>
  unwrap(await supabase.from('ledger_entries').delete().eq('repeat_id', repeatId).gt('entry_date', today).eq('repeat_locked', false));

/* ---------- 내 가계부 백업 / 복원 ---------- */
/** 내 내역과 반복을 모두 지우기 (서버가 내 것만 지우게 해줌) */
export async function deleteMine(sid, me, { repeats = true } = {}) {
  unwrap(await supabase.from('ledger_entries').delete().eq('space_id', sid).eq('created_by', me));
  if (repeats) unwrap(await supabase.from('ledger_repeats').delete().eq('space_id', sid).eq('created_by', me));
}

/** 여러 줄 한꺼번에 넣기 (한 번에 500줄씩) */
export async function insertMany(table, rows) {
  for (let i = 0; i < rows.length; i += 500) unwrap(await supabase.from(table).insert(rows.slice(i, i + 500)));
}
