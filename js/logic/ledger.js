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

/** 분류별 지출 합계 (큰 순서) [{ category, amount }] */
export function expenseByCategory(entries) {
  const map = new Map();
  for (const e of entries) if (e.kind !== 'income') map.set(e.category, (map.get(e.category) || 0) + (Number(e.amount) || 0));
  return [...map].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
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

/** 보는 사람 종류: 'public' 온 가족 | 'private' 나만 | 'some' 골라서 */
export const visibilityOf = (e) => (e?.is_public ? 'public' : (e?.shared_with || []).length ? 'some' : 'private');
