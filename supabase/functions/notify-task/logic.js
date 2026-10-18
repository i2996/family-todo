// 알림 대상/문구 계산 (순수 함수 - Deno 와 Node 어디서나 테스트 가능)

/** 새 할 일 알림을 받을 구성원 id 목록 */
export function pickRecipients({ kind, task, added, memberIds, members = [] }) {
  // 새 구매 요청: 승인 권한이 있는 사람에게 (권한자가 아무도 없으면 온 가족), 요청한 본인은 제외
  if (kind === 'purchase_request') {
    const approvers = members.filter((m) => m.can_approve).map((m) => m.id);
    return (approvers.length ? approvers : memberIds).filter((id) => id !== task.requested_by);
  }
  // 구매 요청이 승인/반려되면: 요청한 사람에게만 (본인이 직접 처리한 경우는 제외)
  if (kind === 'purchase') {
    const to = task.requested_by;
    return to && memberIds.includes(to) && to !== task.decided_by ? [to] : [];
  }
  // 새 일정 / 새 외출·여행: 온 가족에게 (등록한 본인 제외)
  if (kind === 'event' || kind === 'trip') return memberIds.filter((id) => id !== task.created_by);
  if (kind === 'update') return (added || []).filter((id) => memberIds.includes(id)); // 새로 담당이 된 사람만
  const ids = Array.isArray(task.assignee_ids) && task.assignee_ids.length ? task.assignee_ids : memberIds; // 비어 있으면 온 가족
  return ids.filter((id) => memberIds.includes(id) && id !== task.created_by); // 만든 본인에게는 안 보냄
}

const utcDay = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};

/** '오늘' / '내일' / '10월 5일 (일)' — 한국 시간 기준 */
export function dateLabel(iso, now = new Date()) {
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now); // YYYY-MM-DD
  const diff = Math.round((utcDay(iso) - utcDay(today)) / 86400000);
  if (diff === 0) return '오늘';
  if (diff === 1) return '내일';
  const [, m, d] = iso.split('-').map(Number);
  const dow = ['일', '월', '화', '수', '목', '금', '토'][new Date(utcDay(iso)).getUTCDay()];
  return `${m}월 ${d}일 (${dow})`;
}

export function buildMessage({ kind, task, creatorName, now = new Date() }) {
  const by = creatorName ? `\n등록: ${creatorName}` : '';
  if (kind === 'purchase_request') {
    const cat = { supplies: '생필품', snack: '간식', grocery: '식재료', etc: '기타' }[task.category] || '기타';
    return {
      title: '구매 요청이 왔어요 🛒',
      body: `${task.title} · ${cat}${task.memo ? ` (${task.memo})` : ''}${creatorName ? `\n요청: ${creatorName}` : ''}`,
      tag: `purchase-req-${task.id}`,
    };
  }
  if (kind === 'purchase') {
    const cat = { supplies: '생필품', snack: '간식', grocery: '식재료', etc: '기타' }[task.category] || '기타';
    const ok = task.status === 'approved';
    return {
      title: ok ? '구매 요청이 승인됐어요 ✅' : '구매 요청이 반려됐어요',
      body: `${task.title} · ${cat}${creatorName ? `\n${ok ? '승인' : '반려'}: ${creatorName}` : ''}`,
      tag: `purchase-${task.id}`,
    };
  }
  if (kind === 'event') {
    const when = dateLabel(task.start_date, now) + (task.start_time ? ` ${String(task.start_time).slice(0, 5)}` : '');
    return { title: '새 일정이 등록됐어요', body: `${task.title} · ${when}${task.place ? ` · ${task.place}` : ''}${by}`, tag: `event-${task.id}` };
  }
  if (kind === 'trip') {
    const range = dateLabel(task.start_date, now) + (task.end_date && task.end_date !== task.start_date ? ` ~ ${dateLabel(task.end_date, now)}` : '');
    return { title: '새 외출/여행이 등록됐어요', body: `${task.icon || '🏕️'} ${task.title} · ${range}${by}`, tag: `trip-${task.id}` };
  }
  const title = kind === 'update' ? '할 일이 새로 배정됐어요' : '새 할 일이 왔어요';
  const when = task.repeat_type ? '반복 업무' : dateLabel(task.task_date, now);
  const from = kind === 'insert' && creatorName ? `\n등록: ${creatorName}` : '';
  return { title, body: `${task.title} · ${when}${from}`, tag: `task-${task.id}` };
}
