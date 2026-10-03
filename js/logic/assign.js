// 담당자 규칙: assignee_ids 가 비어 있으면 '온 가족'(미정) 할 일 = 모든 구성원의 목록에 나타남
export const assigneeIds = (t) => (Array.isArray(t.assignee_ids) ? t.assignee_ids : []);
export const isEveryone = (t) => assigneeIds(t).length === 0;
export const isAssignedTo = (t, memberId) => isEveryone(t) || assigneeIds(t).includes(memberId);
