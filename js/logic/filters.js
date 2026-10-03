// 담당자 + 기간 + 완료 여부 필터를 조합해서 목록을 만든다.
import { addDays, startOfWeekMon, labelDate, shortDate, dow, KO_DOW } from './dates.js';
import { occurrencesInRange, overdueOccurrences } from './recurrence.js';
import { assigneeIds, isAssignedTo } from './assign.js';

export const PERIODS = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'all', label: '전체 기간' },
];
export const STATUSES = [
  { id: 'pending', label: '미완료' },
  { id: 'all', label: '완료 포함' },
];

export function periodRange(period, today) {
  if (period === 'today') return [today, today];
  if (period === 'week') {
    const mon = startOfWeekMon(today);
    return [mon, addDays(mon, 6)];
  }
  return [addDays(today, -14), addDays(today, 60)]; // 전체 기간: 반복 업무 표시 범위
}

export function sortOccurrences(occs, members) {
  const order = new Map(members.map((m, i) => [m.id, i]));
  return occs.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.done !== b.done) return a.done ? 1 : -1;
    const first = (t) => (order.has(assigneeIds(t)[0]) ? order.get(assigneeIds(t)[0]) : 99);
    const ma = first(a.task);
    const mb = first(b.task);
    if (ma !== mb) return ma - mb;
    return (a.task.created_at || '').localeCompare(b.task.created_at || '');
  });
}

export function filterByMember(occs, member) {
  if (!member || member === 'all') return occs;
  return occs.filter((o) => isAssignedTo(o.task, member)); // '온 가족' 할 일은 모든 구성원에게 보임
}

/** filter: { member: 'all' | memberId, period, status } */
export function buildTaskList({ tasks, completions, members }, filter, today) {
  const [from, to] = periodRange(filter.period, today);
  let occs = occurrencesInRange(tasks, completions, from, to, { singlesAll: filter.period === 'all' });
  if (filter.period === 'today') occs = occs.concat(overdueOccurrences(tasks, today));
  occs = filterByMember(occs, filter.member);
  if (filter.status === 'pending') occs = occs.filter((o) => !o.done);
  return sortOccurrences(occs, members);
}

/** 날짜별로 묶기. 밀린 일은 맨 위 별도 묶음 */
export function groupByDate(occs, today) {
  const groups = [];
  const index = new Map();
  for (const o of occs) {
    const gk = o.overdue ? 'overdue' : o.date;
    if (!index.has(gk)) {
      const g = o.overdue
        ? { key: gk, label: '밀린 일', sub: '' }
        : { key: gk, label: labelDate(o.date, today), sub: `${shortDate(o.date)} ${KO_DOW[dow(o.date)]}` };
      index.set(gk, g);
      g.items = [];
      groups.push(g);
    }
    index.get(gk).items.push(o);
  }
  return groups;
}
