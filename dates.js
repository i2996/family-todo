// 날짜 유틸 - 모든 날짜는 'YYYY-MM-DD' 문자열(로컬 기준)로 다룬다.
export const KO_DOW = ['일', '월', '화', '수', '목', '금', '토'];

export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

const utc = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const parts = (iso) => iso.split('-').map(Number); // [y, m, d]

export const addDays = (iso, n) => {
  const d = new Date(utc(iso) + n * 86400000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
export const diffDays = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
export const dow = (iso) => new Date(utc(iso)).getUTCDay(); // 0=일
export const startOfWeekSun = (iso) => addDays(iso, -dow(iso));
export const startOfWeekMon = (iso) => addDays(iso, -((dow(iso) + 6) % 7));
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate(); // m: 1~12

export function eachDay(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function labelDate(iso, today = todayISO()) {
  const diff = diffDays(today, iso);
  const [, m, d] = parts(iso);
  const base = `${m}월 ${d}일 (${KO_DOW[dow(iso)]})`;
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  if (diff === -1) return '어제';
  return base;
}
export const shortDate = (iso) => {
  const [, m, d] = parts(iso);
  return `${m}/${d}`;
};
export const longDate = (iso) => {
  const [y, m, d] = parts(iso);
  return `${y}년 ${m}월 ${d}일 ${KO_DOW[dow(iso)]}요일`;
};
export const shortRange = (a, b) => (b && b !== a ? `${shortDate(a)}~${shortDate(b)}` : shortDate(a));
