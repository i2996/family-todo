// 가계부 계산 (DB/화면 모름)

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
