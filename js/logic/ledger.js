// 가계부 계산 (DB/화면 모름)
import { addDays as _addDays, parts as _parts, pad as _pad, daysInMonth as _dim, dow as _dow, KO_DOW as _KO_DOW } from './dates.js';
import { shiftToBusinessDay } from './holidays.js';

export const EXPENSE_CATS = [
  { id: '식비', icon: '🍚' },
  { id: '생활용품', icon: '🧻' },
  { id: '교통', icon: '🚌' },
  { id: '교육', icon: '📚' },
  { id: '의료', icon: '💊' },
  { id: '문화·여가', icon: '🎡' },
  { id: '경조사', icon: '🎁' },
  { id: '공과금', icon: '🧾' },
  { id: '기타', icon: '💸' },
];
export const INCOME_CATS = [
  { id: '월급', icon: '💼' },
  { id: '용돈', icon: '🪙' },
  { id: '기타', icon: '💰' },
];

export const catsOf = (kind) => (kind === 'income' ? INCOME_CATS : EXPENSE_CATS);
export const catIcon = (kind, cat) => (catsOf(kind).find((c) => c.id === cat) || catsOf(kind).at(-1)).icon;

/** 12345 → '12,345원' */
export const won = (n) => `${Number(n || 0).toLocaleString('ko-KR')}원`;

/** '12,345' 같은 입력 → 12345 (숫자가 아니면 NaN) */
export const parseAmount = (s) => {
  const digits = String(s ?? '').replace(/[,\s원]/g, '');
  return /^\d{1,13}$/.test(digits) ? Number(digits) : NaN;
};

/** 해당 월('YYYY-MM') 내역 */
export const inMonth = (entries, ym) => entries.filter((e) => String(e.entry_date).slice(0, 7) === ym);

/** { income, expense, balance } */
export function summarize(entries) {
  let income = 0;
  let expense = 0;
  for (const e of entries) {
    if (e.kind === 'income') income += Number(e.amount) || 0;
    else expense += Number(e.amount) || 0;
  }
  return { income, expense, balance: income - expense };
}

/**
 * 남은 돈을 오늘 기준으로: 오늘까지 들어오고 나간 돈만 계산하고, 오늘 이후 내역은 '예정'으로 따로.
 * → { now: {income, expense, balance}, planned: {income, expense, balance}, total: {...}, hasPlanned }
 */
export function summarizeAsOf(entries, today) {
  const now = summarize(entries.filter((e) => String(e.entry_date).slice(0, 10) <= today));
  const planned = summarize(entries.filter((e) => String(e.entry_date).slice(0, 10) > today));
  return { now, planned, total: summarize(entries), hasPlanned: planned.income > 0 || planned.expense > 0 };
}

/** 분류별 합계 (큰 순서) [{ category, amount }]. kind: 'expense' | 'income' */
export function byCategory(entries, kind = 'expense') {
  const map = new Map();
  for (const e of entries) if ((e.kind === 'income') === (kind === 'income')) map.set(e.category, (map.get(e.category) || 0) + (Number(e.amount) || 0));
  return [...map].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
}
export const expenseByCategory = (entries) => byCategory(entries, 'expense');

/** 보기 방식으로 거르기. mode: 'all' | 'income' | 'expense' */
export const byMode = (entries, mode) => (mode === 'all' ? entries : entries.filter((e) => (e.kind === 'income') === (mode === 'income')));

/** 날짜 → { income, expense } (달력 표시용) */
export function dailyTotals(entries) {
  const map = new Map();
  for (const e of entries) {
    const d = String(e.entry_date).slice(0, 10);
    const t = map.get(d) || { income: 0, expense: 0 };
    if (e.kind === 'income') t.income += Number(e.amount) || 0;
    else t.expense += Number(e.amount) || 0;
    map.set(d, t);
  }
  return map;
}

/** 달력 칸에 들어가게 짧게: 9,500 / 5.2만 / 350만 / 1.2억 */
export function compactWon(n) {
  n = Math.abs(Number(n) || 0);
  const trim = (x) => String(Math.round(x * 10) / 10).replace(/\.0$/, '');
  if (n >= 1e8) return `${trim(n / 1e8)}억`;
  if (n >= 1e6) return `${Math.round(n / 1e4).toLocaleString('ko-KR')}만`;
  if (n >= 1e4) return `${trim(n / 1e4)}만`;
  return n.toLocaleString('ko-KR');
}

/** 날짜별 묶음 (최근 날짜 먼저) [{ date, items }] */
export function byDate(entries) {
  const map = new Map();
  for (const e of [...entries].sort((a, b) => String(b.entry_date).localeCompare(String(a.entry_date)) || String(b.created_at).localeCompare(String(a.created_at)))) {
    if (!map.has(e.entry_date)) map.set(e.entry_date, []);
    map.get(e.entry_date).push(e);
  }
  return [...map].map(([date, items]) => ({ date, items }));
}

/** 보는 사람 종류: 'public' 온 가족 | 'private' 나만 | 'some' 선택 */
export const visibilityOf = (e) => (e?.is_public ? 'public' : (e?.shared_with || []).length ? 'some' : 'private');

/* ---------- 반복 ---------- */

export const SHIFT_LABEL = { none: '그대로', before: '앞 영업일', after: '다음 영업일' };

/** 반복 설명: '매월 25일 · 쉬는 날이면 앞 영업일' */
export function repeatLabel(r) {
  const [, m, d] = _parts(r.start_date);
  const base =
    r.freq === 'weekly' ? `매주 ${_KO_DOW[_dow(r.start_date)]}요일`
    : r.freq === 'monthly' ? (r.last_day ? '매월 말일' : `매월 ${d}일`)
    : `매년 ${m}월 ${d}일`;
  return r.shift && r.shift !== 'none' ? `${base} · 쉬는 날이면 ${SHIFT_LABEL[r.shift]}` : base;
}

/** 오늘이 속한 달부터 months 달 뒤 말일 (반복 내역을 미리 만들어 두는 끝) */
export function horizonOf(today, months = 3) {
  const [y, m] = _parts(today);
  const t = new Date(y, m - 1 + months, 1);
  return `${t.getFullYear()}-${_pad(t.getMonth() + 1)}-${_pad(_dim(t.getFullYear(), t.getMonth() + 1))}`;
}

/**
 * 반복 규칙이 만드는 날짜들 (원래 날짜 기준으로 until 까지).
 * → [{ repeat_date: 원래 날짜, entry_date: 쉬는 날이면 옮긴 날짜 }]
 * extra: 가족이 직접 추가한 쉬는 날
 */
export function repeatOccurrences(r, until, extra = []) {
  const end = r.end_date && r.end_date < until ? r.end_date : until;
  const skip = new Set(r.skip_dates || []);
  const out = [];
  const push = (d) => {
    if (d >= r.start_date && d <= end && !skip.has(d)) out.push({ repeat_date: d, entry_date: shiftToBusinessDay(d, r.shift, extra) });
  };
  const [sy, sm, sd] = _parts(r.start_date);
  if (r.freq === 'weekly') {
    for (let d = r.start_date, i = 0; d <= end && i < 1000; d = _addDays(d, 7), i++) push(d);
  } else if (r.freq === 'monthly') {
    for (let i = 0; i < 600; i++) {
      const y = sy + Math.floor((sm - 1 + i) / 12);
      const m = ((sm - 1 + i) % 12) + 1;
      const first = `${y}-${_pad(m)}-01`;
      if (first > end) break;
      const dim = _dim(y, m);
      push(`${y}-${_pad(m)}-${_pad(r.last_day ? dim : Math.min(sd, dim))}`);
    }
  } else if (r.freq === 'yearly') {
    for (let y = sy; y < sy + 100; y++) {
      if (`${y}-01-01` > end) break;
      push(`${y}-${_pad(sm)}-${_pad(Math.min(sd, _dim(y, sm)))}`);
    }
  }
  return out;
}
