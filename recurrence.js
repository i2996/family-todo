// 반복 규칙 - "이 할 일이 이 날짜에 나타나는가?" 를 계산한다. (DB에 날짜별 행을 만들지 않음)
import { diffDays, dow, startOfWeekSun, parts, daysInMonth, addDays, eachDay, KO_DOW, shortDate } from './dates.js';

export const isRecurring = (t) => !!t.repeat_type;

/** 한 번만 하는 일: 날짜 당일 + (시작일~마감일이 있으면 그 기간 동안) */
function singleOccursOn(t, iso) {
  if (iso === t.task_date) return true;
  if (t.start_date && t.due_date) return iso >= t.start_date && iso <= t.due_date;
  return false;
}

export function occursOn(t, iso) {
  if (!t.repeat_type) return singleOccursOn(t, iso);

  const start = t.task_date;
  if (iso < start) return false;
  if (t.repeat_end && iso > t.repeat_end) return false;
  const n = Math.max(1, t.repeat_interval || 1);

  switch (t.repeat_type) {
    case 'daily':
      return diffDays(start, iso) % n === 0;

    case 'weekly': {
      const days = t.repeat_days && t.repeat_days.length ? t.repeat_days : [dow(start)];
      if (!days.includes(dow(iso))) return false;
      const weeks = Math.round(diffDays(startOfWeekSun(start), startOfWeekSun(iso)) / 7);
      return weeks % n === 0;
    }

    case 'monthly': {
      const [sy, sm, sd] = parts(start);
      const [y, m, d] = parts(iso);
      const months = (y - sy) * 12 + (m - sm);
      if (months % n !== 0) return false;
      return d === Math.min(sd, daysInMonth(y, m)); // 31일 시작 → 짧은 달은 말일
    }

    case 'yearly': {
      const [sy, sm, sd] = parts(start);
      const [y, m, d] = parts(iso);
      if (m !== sm || (y - sy) % n !== 0) return false;
      return d === Math.min(sd, daysInMonth(y, m)); // 2/29 → 평년엔 2/28
    }
    default:
      return false;
  }
}

export function repeatLabel(t) {
  if (!t.repeat_type) return '';
  const n = t.repeat_interval || 1;
  switch (t.repeat_type) {
    case 'daily':
      return n === 1 ? '매일' : `${n}일마다`;
    case 'weekly': {
      const days = t.repeat_days && t.repeat_days.length ? [...t.repeat_days].sort() : [dow(t.task_date)];
      const names = days.map((d) => KO_DOW[d]).join('·');
      return n === 1 ? `매주 ${names}` : `${n}주마다 ${names}`;
    }
    case 'monthly':
      return `${n === 1 ? '매월' : `${n}개월마다`} ${parts(t.task_date)[2]}일`;
    case 'yearly':
      return `${n === 1 ? '매년' : `${n}년마다`} ${shortDate(t.task_date)}`;
    default:
      return '';
  }
}

const completionKey = (taskId, date) => `${taskId}|${date}`;

export function makeOccurrence(t, date, doneSet) {
  const key = completionKey(t.id, date);
  return {
    key,
    task: t,
    date,
    done: t.repeat_type ? doneSet.has(key) : !!t.done,
    overdue: false,
  };
}

/**
 * 기간 [from, to] 안의 모든 "날짜별 할 일" 을 만든다.
 * opts.singlesAll: 한 번만 하는 일은 기간과 상관없이 전부 포함 (전체 기간 보기용)
 */
export function occurrencesInRange(tasks, completions, from, to, opts = {}) {
  const doneSet = new Set(completions.map((c) => completionKey(c.task_id, c.occurrence_date)));
  const days = eachDay(from, to);
  const out = [];
  for (const t of tasks) {
    if (!t.repeat_type && opts.singlesAll) {
      out.push(makeOccurrence(t, t.task_date, doneSet));
      continue;
    }
    for (const d of days) if (occursOn(t, d)) out.push(makeOccurrence(t, d, doneSet));
  }
  return out;
}

/** 마감/날짜가 지났는데 아직 안 끝난 '한 번짜리' 할 일 (오늘 목록에 밀린 일로 보여줌) */
export function overdueOccurrences(tasks, today) {
  const out = [];
  for (const t of tasks) {
    if (t.repeat_type || t.done) continue;
    const last = t.due_date && t.due_date > t.task_date ? t.due_date : t.task_date;
    if (last < today) out.push({ key: `${t.id}|${t.task_date}`, task: t, date: t.task_date, done: false, overdue: true });
  }
  return out;
}

export { addDays };
