// 일정 계산: 일정(events)과 외출/여행(trips)을 같은 모양으로 합쳐서 날짜별로 찾기 (DB/화면 모름)
import { addDays, eachDay } from './dates.js';

/** kind: 'event' | 'trip'. start/end 는 날짜, time 은 'HH:MM' 또는 null, by 는 작성자 구성원 id */
export function toItems(events = [], trips = []) {
  return [
    ...events.map((e) => ({
      kind: 'event', id: e.id, title: e.title, start: e.start_date, end: e.end_date || e.start_date,
      time: e.start_time ? String(e.start_time).slice(0, 5) : null, place: e.place || '', memo: e.memo || '',
      by: e.created_by || null, icon: '📌',
    })),
    ...trips.map((t) => ({
      kind: 'trip', id: t.id, title: t.title, start: t.start_date, end: t.end_date || t.start_date,
      time: null, place: t.place || '', memo: t.memo || '', by: t.created_by || null, icon: t.icon || '🏕️',
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
