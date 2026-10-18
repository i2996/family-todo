// 구매 목록 규칙 (DB/화면 모름)
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

/** 카테고리 4개를 항상 순서대로 만들고 항목을 넣음 (비어 있어도 제목은 나옴) */
export function groupByCategory(items) {
  return CATEGORIES.map((c) => ({ ...c, items: items.filter((p) => categoryOf(p.category).id === c.id) }));
}
