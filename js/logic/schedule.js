// 일정 계산: 일정(events)과 외출/여행(trips)을 같은 모양으로 합쳐서 날짜별로 찾기 (DB/화면 모름)
import { addDays, eachDay } from './dates.js';

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

/** kind: 'event' | 'trip'. start/end 는 날짜, time 은 'HH:MM' 또는 null, by 는 작성자 구성원 id, shared 는 공유 대상 id 목록(비면 온 가족) */
export function toItems(events = [], trips = []) {
  return [
    ...events.map((e) => ({
      kind: 'event', id: e.id, title: e.title, start: e.start_date, end: e.end_date || e.start_date,
      time: e.start_time ? String(e.start_time).slice(0, 5) : null, place: e.place || '', memo: e.memo || '',
      by: e.created_by || null, icon: '📌', shared: sharedOf(e),
    })),
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
