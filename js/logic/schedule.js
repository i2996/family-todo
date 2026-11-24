// 일정 계산: 일정(events)과 외출/여행(trips)을 같은 모양으로 합쳐서 날짜별로 찾기 (DB/화면 모름)
import { addDays, eachDay, diffDays } from './dates.js';
import { repeatOccurrences } from './ledger.js';

/**
 * 일정의 공유 대상 구성원 id 목록 (비어 있으면 온 가족).
 * memberIds 를 주면 삭제된 구성원은 뺀다 (모두 삭제됐으면 온 가족 공개로 돌아감)
 */
export const sharedOf = (e, memberIds = null) => {
  const ids = Array.isArray(e?.shared_with) ? e.shared_with.filter(Boolean) : [];
  return memberIds ? ids.filter((id) => memberIds.includes(id)) : ids;
};

/**
 * 이 기기 주인(me)에게 보이는 일정만 남긴다.
 * - 공유 대상이 비어 있으면 온 가족 공개
 * - 지정돼 있으면 작성자와 지정된 사람에게만 보임
 * - me 를 모르면(이 기기 주인 미설정) 온 가족 공개 일정만 보임
 */
export function visibleEvents(events = [], me = null, memberIds = null) {
  return events.filter((e) => {
    const to = sharedOf(e, memberIds);
    if (!to.length) return true;
    return !!me && (e.created_by === me || to.includes(me));
  });
}

/** 일정의 반복 규칙 (가계부 반복과 같은 모양). 반복 안 하면 null */
export const eventRule = (e) =>
  e && e.repeat_freq
    ? {
        freq: e.repeat_freq, start_date: e.start_date, end_date: e.repeat_end || null, last_day: !!e.repeat_last_day,
        month_week: e.repeat_month_week || null, shift: e.repeat_shift || 'none', skip_dates: e.repeat_skip || [],
      }
    : null;

const eventItem = (e) => ({
  kind: 'event', id: e.id, title: e.title, start: e.start_date, end: e.end_date || e.start_date,
  time: e.start_time ? String(e.start_time).slice(0, 5) : null, place: e.place || '', memo: e.memo || '',
  by: e.created_by || null, icon: '📌', shared: sharedOf(e), repeat: !!e.repeat_freq, occ: null,
  remind: !!(e.start_time && Array.isArray(e.remind_offsets) && e.remind_offsets.length),
});

/**
 * 일정(events)과 외출/여행(trips)을 같은 모양으로.
 * kind: 'event' | 'trip'. start/end 는 날짜, time 은 'HH:MM' 또는 null, by 는 작성자 구성원 id, shared 는 공유 대상 id 목록(비면 온 가족)
 * 반복 일정은 { from, to } 기간 안의 날짜마다 하나씩 만든다 (occ: 원래 날짜). extra: 직접 추가한 쉬는 날
 */
export function toItems(events = [], trips = [], { from = null, to = null, extra = [] } = {}) {
  return [
    ...events.flatMap((e) => {
      const r = eventRule(e);
      if (!r || !to) return [eventItem(e)];
      const span = e.end_date ? Math.max(0, diffDays(e.start_date, e.end_date)) : 0; // 여러 날 일정은 같은 길이로
      return repeatOccurrences(r, addDays(to, 7), extra) // 앞 영업일로 당겨지는 날까지 넉넉히
        .map((o) => ({ ...eventItem(e), start: o.entry_date, end: addDays(o.entry_date, span), occ: o.repeat_date }))
        .filter((i) => i.start <= to && (!from || i.end >= from));
    }),
    ...trips.map((t) => ({
      kind: 'trip', id: t.id, title: t.title, start: t.start_date, end: t.end_date || t.start_date,
      time: null, place: t.place || '', memo: t.memo || '', by: t.created_by || null, icon: t.icon || '🏕️', shared: [],
    })),
  ];
}

const byTime = (a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title);

/** 그 날짜에 걸쳐 있는 일정 (여러 날 일정은 기간 내내 나옴) */
export const onDate = (items, date) => items.filter((i) => i.start <= date && date <= i.end).sort(byTime);

/** 기간 안의 날짜 → 일정 목록 (달력 점 표시용) */
export function byDateMap(items, from, to) {
  const map = new Map();
  for (const d of eachDay(from, to)) {
    const list = onDate(items, d);
    if (list.length) map.set(d, list);
  }
  return map;
}

/** 오늘부터 N일 안에 있는 일정 (진행 중인 것 포함). date: 목록에 표시할 날짜 */
export function upcoming(items, today, days = 7) {
  const to = addDays(today, days);
  return items
    .filter((i) => i.end >= today && i.start <= to)
    .map((i) => ({ ...i, date: i.start > today ? i.start : today }))
    .sort((a, b) => a.date.localeCompare(b.date) || byTime(a, b));
}

/**
 * 달력 한 주(weekStart~+6일)의 여러 날 일정 막대 자리 정하기.
 * 여러 날 일정은 주마다 같은 줄(lane)에 이어진 막대로 그리고, 제목은 그 주의 시작 칸에만 씀.
 * → { lanes: Map(날짜 → [ {item, first, rs, re, span} | null ...]), rest: Map(날짜 → [줄에 못 들어간 여러 날 일정]) }
 *   first: 이 주에서 막대가 시작하는 칸 (제목을 씀), span: 그 칸부터 이 주에서 이어지는 날 수
 *   rs/re: 일정이 진짜로 시작/끝나는 날 (둥근 모서리)
 */
export function weekLanes(items, weekStart, maxLanes = 3) {
  const weekEnd = addDays(weekStart, 6);
  const multi = items
    .filter((i) => i.start !== i.end && i.start <= weekEnd && i.end >= weekStart)
    .sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end) || a.title.localeCompare(b.title));
  const laneEnds = []; // 줄마다 마지막으로 차지한 날
  const lanes = new Map();
  const rest = new Map();
  const days = eachDay(weekStart, weekEnd);
  for (const d of days) lanes.set(d, []);
  for (const i of multi) {
    const s = i.start > weekStart ? i.start : weekStart;
    const e = i.end < weekEnd ? i.end : weekEnd;
    let lane = laneEnds.findIndex((end) => end < s);
    if (lane === -1 && laneEnds.length < maxLanes) lane = laneEnds.length;
    if (lane === -1) {
      for (const d of eachDay(s, e)) rest.set(d, [...(rest.get(d) || []), i]);
      continue;
    }
    laneEnds[lane] = e;
    for (const d of eachDay(s, e)) {
      lanes.get(d)[lane] = { item: i, first: d === s, rs: d === i.start, re: d === i.end, last: d === e, span: diffDays(d, e) + 1 };
    }
  }
  // 그 주에 쓰인 줄 수만큼 빈 자리도 채워서 칸마다 높이를 맞춤
  for (const d of days) {
    const arr = lanes.get(d);
    for (let k = 0; k < laneEnds.length; k++) if (!arr[k]) arr[k] = null;
  }
  return { lanes, rest };
}
