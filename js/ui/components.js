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

export const NEUTRAL = '#b9bec8';

/** 담당자 목록 (비어 있으면 '온 가족') */
export const assigneesOf = (t) => (t.assignee_ids || []).map(memberById).filter(Boolean);
export const assigneeLabel = (t) => {
  const ms = assigneesOf(t);
  return ms.length ? ms.map((m) => m.name).join(', ') : '온 가족';
};

/** 색 여러 개를 동그라미 테두리용 conic-gradient 로 */
export function ringOf(colors) {
  const n = colors.length;
  return `conic-gradient(${colors.map((c, i) => `${c} ${((i * 100) / n).toFixed(2)}% ${(((i + 1) * 100) / n).toFixed(2)}%`).join(', ')})`;
}

/** 할 일 하나를 '날짜별 할 일' 형태로 감싸기 (여행 상세 등에서 사용) */
export function occFor(task, date = task.task_date) {
  let done;
  let doneBy = null;
  if (isRecurring(task)) {
    const c = state.completions.find((x) => x.task_id === task.id && x.occurrence_date === date);
    done = !!c;
    doneBy = c ? c.done_by ?? null : null;
  } else {
    done = !!task.done;
    doneBy = done ? task.done_by ?? null : null;
  }
  return { key: `${task.id}|${date}`, task, date, done, doneBy, overdue: false };
}

export function taskRow(occ, { showDate = false } = {}) {
  const t = occ.task;
  const ms = assigneesOf(t);
  const everyone = ms.length === 0;
  const multi = everyone || ms.length > 1;
  const ringColors = everyone ? state.members.map((m) => m.color) : ms.map((m) => m.color);
  const ring = multi && ringColors.length > 1 ? ringOf(ringColors) : '';
  const color = multi ? NEUTRAL : ms[0].color; // 한 명이면 그 사람 색, 여러 명이면 색 띠
  const doneBy = occ.doneBy ? memberById(occ.doneBy) : null;
  const doneColor = doneBy ? doneBy.color : color; // 체크한 사람 색으로 채워짐
  const trip = t.trip_id ? tripById(t.trip_id) : null;

  const who = everyone
    ? `<span class="who"><span class="who-one"><i class="dot"${ring ? ` style="background:${esc(ring)}"` : ''}></i>온 가족</span></span>`
    : `<span class="who">${ms.map((m) => `<span class="who-one"><i class="dot" style="--mc:${esc(m.color)}"></i>${esc(m.name)}</span>`).join('')}</span>`;

  const tags = [who];
  if (occ.done && doneBy) tags.push(`<span class="tag done-by" style="--mc:${esc(doneBy.color)}"><i class="dot"></i>${esc(doneBy.name)} 완료</span>`);
  if (occ.overdue) tags.push('<span class="tag late">밀림</span>');
  if (showDate) tags.push(`<span class="tag">${shortDate(occ.date)}</span>`);
  if (isRecurring(t)) tags.push(`<span class="tag">🔁 ${esc(repeatLabel(t))}</span>`);
  else if (t.start_date && t.due_date) tags.push(`<span class="tag">${shortRange(t.start_date, t.due_date)}</span>`);
  else if (t.due_date) tags.push(`<span class="tag">마감 ${shortDate(t.due_date)}</span>`);
  if (trip) tags.push(`<span class="tag trip">${esc(trip.icon)} ${esc(trip.title)}</span>`);

  return `<li class="task${occ.done ? ' done' : ''}${ring ? ' ring' : ''}" style="--mc:${esc(color)};--dc:${esc(doneColor)};${ring ? `--ring:${esc(ring)};` : ''}">
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

// 파스텔 위주 팔레트 (체크박스·점으로 쓰여서 너무 연하지 않게)
export const PALETTE = ['#b9a4f0', '#7fbfe8', '#6fcfb0', '#8ed08f', '#f3cf5b', '#f5a97a', '#f29bb5', '#ef8f8f', '#c3a98c', '#a0acbd'];
