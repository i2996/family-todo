// 구매 목록 규칙 (DB/화면 모름)
import { diffDays, shortDate, dow, KO_DOW, addDays } from './dates.js';
export const CATEGORIES = [
  { id: 'supplies', label: '생필품', icon: '🧴' },
  { id: 'snack', label: '간식', icon: '🍪' },
  { id: 'grocery', label: '식재료', icon: '🥬' },
  { id: 'etc', label: '기타', icon: '📦' },
];
export const categoryOf = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];

/** 승인 권한: 구성원 설정에서 '구매 요청 승인'을 체크한 사람만. (아무도 체크하지 않았다면 막히지 않게 누구나) */
export function canApprove(members, memberId) {
  const approvers = members.filter((m) => m.can_approve);
  if (!approvers.length) return !!memberId;
  return approvers.some((m) => m.id === memberId);
}

/** 필요한 날이 가까운 순서 (날짜 없는 건 뒤로, 같으면 먼저 요청한 순서) */
export const sortByNeed = (items) =>
  items
    .slice()
    .sort((a, b) => (a.need_date || '9999-12-31').localeCompare(b.need_date || '9999-12-31') || String(a.created_at || '').localeCompare(String(b.created_at || '')));

/** 카테고리 4개를 항상 순서대로 만들고 항목을 넣음 (비어 있어도 제목은 나옴). 각 묶음은 필요한 날 순서 */
export function groupByCategory(items) {
  return CATEGORIES.map((c) => ({ ...c, items: sortByNeed(items.filter((p) => categoryOf(p.category).id === c.id)) }));
}

/** 아직 안 산 요청인지 (승인 대기·구매 예정) */
export const isOpen = (p) => p.status === 'pending' || p.status === 'approved';

/**
 * 필요한 날 표시: { text, cls } 또는 null
 * 지남(빨강) / 오늘까지·내일까지(빨강) / 2일 이내(주황) / 그 외 '11/14(금)까지'
 */
export function needLabel(p, today) {
  if (!p.need_date) return null;
  const d = diffDays(today, p.need_date);
  if (d < 0) return { text: `${shortDate(p.need_date)} 지남`, cls: 'late' };
  if (d === 0) return { text: '오늘까지', cls: 'late' };
  if (d === 1) return { text: '내일까지', cls: 'late' };
  return { text: `${shortDate(p.need_date)}(${KO_DOW[dow(p.need_date)]})까지`, cls: d <= 2 ? 'soon' : '' };
}

/** 홈 '곧 사야 할 것': 안 산 요청 중 필요한 날이 days 일 안(지난 것 포함), 가까운 순서 */
export const dueSoon = (items, today, days = 7) =>
  sortByNeed(items.filter((p) => isOpen(p) && p.need_date && p.need_date <= addDays(today, days)));

/** 이번 주말(토요일). 오늘이 토·일이면 오늘 */
export function thisWeekend(today) {
  const w = dow(today);
  if (w === 6 || w === 0) return today;
  return addDays(today, 6 - w);
}
