// 시간 맞춘 알림 예약 계산 (DB/화면 모름)
// 할 일·일정의 시간 + 고른 알림(정각/10분 전/…)으로, 앞으로 며칠 동안 보낼 알림 목록을 만든다.
import { addDays, eachDay, toISO } from './dates.js';
import { occursOn, isRecurring } from './recurrence.js';
import { eventRule, sharedOf } from './schedule.js';
import { repeatOccurrences } from './ledger.js';

/** [분, 이름] — 0=정각, 1440=하루 전 */
export const REMIND_OPTIONS = [
  [0, '정각'],
  [10, '10분 전'],
  [30, '30분 전'],
  [60, '1시간 전'],
  [1440, '하루 전'],
];
export const remindLabel = (offs) =>
  REMIND_OPTIONS.filter(([v]) => (offs || []).map(Number).includes(v)).map(([, l]) => l).join('·');

const hm = (t) => (t ? String(t).slice(0, 5) : null);
const offsetsOf = (x) => [...new Set((Array.isArray(x.remind_offsets) ? x.remind_offsets : []).map(Number))].filter((n) => REMIND_OPTIONS.some(([v]) => v === n));
/** 그 기기의 시간대 기준 'YYYY-MM-DD' + 'HH:MM' 에서 off 분 전 */
const fireAt = (date, time, off) => new Date(new Date(`${date}T${time}:00`).getTime() - off * 60000);

/**
 * 지금부터 days 일 안에 보낼 알림 목록.
 * → [{ ref_kind, ref_id, task_id|event_id, occ_date, offset_min, fire_at(ISO), title, at_time, recipients }]
 * extra: 직접 추가한 쉬는 날 (반복 일정의 영업일 옮기기용)
 */
export const PURCHASE_REMIND_AT = '20:00'; // 구매 요청: 필요한 날 전날 저녁 8시

export function desiredReminders({ tasks = [], events = [], purchases = [], members = [] }, now = new Date(), { days = 30, extra = [] } = {}) {
  const today = toISO(now);
  const last = addDays(today, days + 1); // '하루 전' 알림까지 넉넉히
  const limit = now.getTime() + days * 864e5;
  const out = [];
  const push = (base, date, time, offs) => {
    for (const off of offs) {
      const f = fireAt(date, time, off);
      if (f.getTime() > now.getTime() && f.getTime() <= limit) out.push({ ...base, occ_date: date, offset_min: off, fire_at: f.toISOString(), at_time: time });
    }
  };
  for (const t of tasks) {
    const time = hm(t.task_time);
    const offs = offsetsOf(t);
    if (!time || !offs.length) continue;
    const dates = isRecurring(t) ? eachDay(today, last).filter((d) => occursOn(t, d)) : t.done ? [] : [t.task_date];
    const base = { ref_kind: 'task', ref_id: t.id, task_id: t.id, title: t.title, recipients: Array.isArray(t.assignee_ids) ? [...t.assignee_ids] : [] };
    for (const d of dates) if (d >= addDays(today, -1) && d <= last) push(base, d, time, offs);
  }
  for (const e of events) {
    const time = hm(e.start_time);
    const offs = offsetsOf(e);
    if (!time || !offs.length) continue;
    const r = eventRule(e);
    const dates = r ? repeatOccurrences(r, last, extra).map((o) => o.entry_date) : [e.start_date];
    const shared = sharedOf(e);
    const base = {
      ref_kind: 'event', ref_id: e.id, event_id: e.id, title: e.title,
      recipients: shared.length ? [...new Set([...shared, e.created_by].filter(Boolean))] : [], // 공유한 사람 + 작성자 (비면 온 가족)
    };
    for (const d of dates) if (d >= addDays(today, -1) && d <= last) push(base, d, time, offs);
  }
  // 구매 요청: 아직 안 산 것 중 필요한 날이 있으면 전날 저녁에, 승인 권한자 + 요청자에게 (승인 권한자가 없으면 온 가족)
  const approvers = members.filter((m) => m.can_approve).map((m) => m.id);
  for (const p of purchases) {
    if (!p.need_date || (p.status !== 'pending' && p.status !== 'approved')) continue;
    if (p.need_date < today || p.need_date > last) continue;
    const recipients = approvers.length ? [...new Set([...approvers, p.requested_by].filter(Boolean))] : [];
    push({ ref_kind: 'purchase', ref_id: p.id, purchase_id: p.id, title: p.title, recipients }, p.need_date, PURCHASE_REMIND_AT, [1440]);
  }
  return out;
}

export const reminderKey = (r) => `${r.ref_id}|${String(r.occ_date).slice(0, 10)}|${Number(r.offset_min)}`;
const same = (a, b) =>
  new Date(a.fire_at).getTime() === new Date(b.fire_at).getTime() &&
  a.title === b.title &&
  (a.at_time || '') === (b.at_time || '') &&
  [...(a.recipients || [])].sort().join() === [...(b.recipients || [])].sort().join();

/** 지금 예약표(아직 안 보낸 것)와 맞춰야 할 목록을 비교 → { toInsert, toDelete(id 목록) } */
export function diffReminders(desired, pending) {
  const want = new Map(desired.map((r) => [reminderKey(r), r]));
  const have = new Map(pending.map((r) => [reminderKey(r), r]));
  const toDelete = pending.filter((r) => !want.has(reminderKey(r)) || !same(r, want.get(reminderKey(r)))).map((r) => r.id);
  const keep = new Set(pending.filter((r) => !toDelete.includes(r.id)).map(reminderKey));
  const toInsert = desired.filter((r) => !keep.has(reminderKey(r)));
  return { toInsert, toDelete, unchanged: have.size - toDelete.length };
}
