// 여러 화면에서 같이 쓰는 작은 UI 조각들
import { state } from '../state.js';
import { prefs } from '../prefs.js';
import { repeatLabel, isRecurring } from '../logic/recurrence.js';
import { shortDate, shortRange } from '../logic/dates.js';

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const memberById = (id) => state.members.find((m) => m.id === id) || null;
export const tripById = (id) => state.trips.find((t) => t.id === id) || null;

/** 이 기기의 주인 (삭제된 구성원이면 null) */
export function deviceMemberId() {
  const id = prefs.getDeviceMember();
  return state.members.some((m) => m.id === id) ? id : null;
}

/** 할 일 하나를 '날짜별 할 일' 형태로 감싸기 (여행 상세 등에서 사용) */
export function occFor(task, date = task.task_date) {
  const done = isRecurring(task)
    ? state.completions.some((c) => c.task_id === task.id && c.occurrence_date === date)
    : !!task.done;
  return { key: `${task.id}|${date}`, task, date, done, overdue: false };
}

export function taskRow(occ, { showDate = false } = {}) {
  const t = occ.task;
  const m = memberById(t.assignee_id);
  const color = m ? m.color : '#c9bfc4';
  const trip = t.trip_id ? tripById(t.trip_id) : null;
  const tags = [`<span class="who"><i class="dot"></i>${m ? esc(m.name) : '담당 미정'}</span>`];
  if (occ.overdue) tags.push('<span class="tag late">밀림</span>');
  if (showDate) tags.push(`<span class="tag">${shortDate(occ.date)}</span>`);
  if (isRecurring(t)) tags.push(`<span class="tag">🔁 ${esc(repeatLabel(t))}</span>`);
  else if (t.start_date && t.due_date) tags.push(`<span class="tag">${shortRange(t.start_date, t.due_date)}</span>`);
  else if (t.due_date) tags.push(`<span class="tag">마감 ${shortDate(t.due_date)}</span>`);
  if (trip) tags.push(`<span class="tag trip">${esc(trip.icon)} ${esc(trip.title)}</span>`);

  return `<li class="task${occ.done ? ' done' : ''}" style="--mc:${esc(color)}">
    <button class="check" data-act="toggle" data-task="${t.id}" data-date="${occ.date}"
      aria-pressed="${occ.done}" aria-label="${esc(t.title)} 완료 표시"><span></span></button>
    <div class="task-body" data-act="edit-task" data-task="${t.id}" role="button" tabindex="0">
      <div class="task-title">${esc(t.title)}</div>
      <div class="task-meta">${tags.join('')}</div>
      ${t.memo ? `<div class="task-memo">${esc(t.memo)}</div>` : ''}
    </div>
    <button class="share" data-act="share-task" data-task="${t.id}" data-date="${occ.date}" aria-label="공유">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 10.5l6.8-4M8.6 13.5l6.8 4"/></svg>
    </button>
  </li>`;
}

export const taskList = (occs, opts, empty) =>
  occs.length
    ? `<ul class="tasks">${occs.map((o) => taskRow(o, opts)).join('')}</ul>`
    : `<p class="empty">${empty}</p>`;

export function memberChips({ selected, action, withAll = true, allLabel = '전체' }) {
  const all = withAll
    ? `<button class="chip${selected === 'all' ? ' on' : ''}" data-act="${action}" data-v="all">${allLabel}</button>`
    : '';
  return (
    all +
    state.members
      .map(
        (m) => `<button class="chip${selected === m.id ? ' on' : ''}" style="--mc:${esc(m.color)}" data-act="${action}" data-v="${m.id}">
          <i class="dot"></i>${esc(m.name)}</button>`
      )
      .join('')
  );
}

export function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

export function errMsg(e) {
  const m = (e && (e.message || e.error_description)) || String(e);
  if (m.includes('invalid_credentials')) return '가족 코드 또는 비밀번호가 맞지 않아요.';
  if (m.includes('password_too_short')) return '비밀번호는 4자 이상으로 해주세요.';
  if (m.includes('Failed to fetch') || m.includes('NetworkError')) return '인터넷 연결을 확인해주세요.';
  return m;
}

export const PALETTE = ['#ff7aa2', '#b57bff', '#4f9dff', '#2ec4b6', '#3fc380', '#f4c430', '#ff9f43', '#ff6b6b', '#8d6e63', '#6c7a89'];
