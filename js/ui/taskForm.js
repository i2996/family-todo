// 할 일 추가/수정 폼 (빠른 입력 + 펼치는 상세 옵션)
import { state } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, deviceMemberId } from './components.js';
import { openMembers } from './settings.js';
import { todayISO, addDays, KO_DOW } from '../logic/dates.js';

const UNITS = { daily: '일', weekly: '주', monthly: '개월', yearly: '년' };

export function openTaskForm({ task = null, date = null, tripId = null, assignee = null } = {}) {
  if (!state.members.length) {
    toast('먼저 가족 구성원을 등록해주세요');
    openMembers();
    return;
  }
  const t = task;
  const me = deviceMemberId();
  const selected = t ? t.assignee_ids || [] : assignee && assignee !== 'all' ? [assignee] : me ? [me] : [];
  const everyone = selected.length === 0;
  const taskDate = t ? t.task_date : date || todayISO();
  const linkedTrip = t ? t.trip_id || '' : tripId || '';
  const hasAdvanced = t && (t.start_date || t.due_date || t.memo || t.repeat_type || t.trip_id);
  const type = t?.repeat_type || '';
  const days = t?.repeat_days || [];

  // 담당자는 여러 명 선택 가능. 아무도 안 고르면 '온 가족'(모든 구성원에게 보임)
  const assigneeChips =
    state.members
      .map(
        (m) => `<label class="chip pick" style="--mc:${esc(m.color)}">
          <input type="checkbox" name="assignee" value="${m.id}" data-change="assignee-pick" ${selected.includes(m.id) ? 'checked' : ''}><span><i class="dot"></i>${esc(m.name)}</span></label>`
      )
      .join('') +
    `<label class="chip pick"><input type="checkbox" name="all" value="1" data-change="assignee-pick" ${everyone ? 'checked' : ''}><span>👨‍👩‍👧‍👦 온 가족 (미정)</span></label>`;

  const body = `<form data-form="task" data-id="${t ? t.id : ''}" autocomplete="off">
    <input class="big-input" name="title" required maxlength="80" placeholder="무엇을 해야 하나요?" value="${esc(t?.title)}">

    <div class="field"><span class="label">담당자 <small>여러 명 선택 가능 · 미정이면 온 가족 할 일</small></span><div class="chips">${assigneeChips}</div></div>

    <div class="field">
      <span class="label">날짜 <small class="repeat-hint" hidden>이 날부터 반복돼요</small></span>
      <div class="row">
        <input type="date" name="task_date" required value="${taskDate}">
        <button type="button" class="chip" data-act="date-quick" data-d="0">오늘</button>
        <button type="button" class="chip" data-act="date-quick" data-d="1">내일</button>
      </div>
    </div>

    <details class="more" ${hasAdvanced ? 'open' : ''}>
      <summary>상세 옵션</summary>

      <div class="range-opts grid2">
        <div class="field"><span class="label">시작일</span><input type="date" name="start_date" value="${t?.start_date || ''}"></div>
        <div class="field"><span class="label">마감일</span><input type="date" name="due_date" value="${t?.due_date || ''}"></div>
      </div>

      <div class="field">
        <span class="label">반복</span>
        <select name="repeat_type" data-change="repeat-type">
          <option value="">반복 안 함</option>
          <option value="daily" ${type === 'daily' ? 'selected' : ''}>매일</option>
          <option value="weekly" ${type === 'weekly' ? 'selected' : ''}>매주 (요일 선택)</option>
          <option value="monthly" ${type === 'monthly' ? 'selected' : ''}>매월 (같은 날짜)</option>
          <option value="yearly" ${type === 'yearly' ? 'selected' : ''}>매년</option>
        </select>
      </div>

      <div class="repeat-opts" hidden>
        <div class="field weekdays" hidden>
          <span class="label">요일</span>
          <div class="chips">${KO_DOW.map(
            (d, i) => `<label class="chip pick sm"><input type="checkbox" name="days" value="${i}" ${days.includes(i) ? 'checked' : ''}><span>${d}</span></label>`
          ).join('')}</div>
        </div>
        <div class="grid2">
          <div class="field"><span class="label">간격</span>
            <div class="row"><input type="number" name="repeat_interval" min="1" max="99" value="${t?.repeat_interval || 1}"><span class="unit">${UNITS[type] || '일'}마다</span></div>
          </div>
          <div class="field"><span class="label">종료일 (비우면 계속)</span><input type="date" name="repeat_end" value="${t?.repeat_end || ''}"></div>
        </div>
      </div>

      <div class="field"><span class="label">메모</span><textarea name="memo" rows="2" maxlength="300" placeholder="필요하면 적어두세요">${esc(t?.memo)}</textarea></div>

      <div class="field"><span class="label">외출/여행 준비물로 연결</span>
        <select name="trip_id">
          <option value="">연결 안 함</option>
          ${state.trips.map((tr) => `<option value="${tr.id}" ${linkedTrip === tr.id ? 'selected' : ''}>${esc(tr.icon)} ${esc(tr.title)}</option>`).join('')}
        </select>
      </div>
    </details>

    <div class="form-actions">
      ${t ? `<button type="button" class="btn danger" data-act="task-delete" data-id="${t.id}">삭제</button>` : ''}
      <button type="submit" class="btn primary">${t ? '저장' : '추가'}</button>
    </div>
  </form>`;

  openSheet({
    title: t ? '할 일 수정' : '할 일 추가',
    body,
    onMount: (el) => {
      syncRepeat(el.querySelector('form'));
      if (!t) setTimeout(() => el.querySelector('[name=title]').focus(), 60);
    },
  });
}

function syncRepeat(f) {
  const type = f.elements.repeat_type.value;
  f.querySelector('.repeat-opts').hidden = !type;
  f.querySelector('.weekdays').hidden = type !== 'weekly';
  f.querySelector('.range-opts').hidden = !!type;
  f.querySelector('.repeat-hint').hidden = !type;
  f.querySelector('.unit').textContent = `${UNITS[type] || '일'}마다`;
}

export const changes = {
  'repeat-type': (el) => syncRepeat(el.closest('form')),
  'assignee-pick': (el) => {
    const f = el.closest('form');
    const members = [...f.querySelectorAll('input[name=assignee]')];
    const all = f.querySelector('input[name=all]');
    if (el === all) {
      if (all.checked) members.forEach((i) => (i.checked = false));
      else if (!members.some((i) => i.checked)) all.checked = true; // 아무도 없으면 '온 가족'
    } else if (el.checked) all.checked = false;
    else if (!members.some((i) => i.checked)) all.checked = true;
  },
};

export const actions = {
  'date-quick': (el) => {
    el.closest('form').elements.task_date.value = addDays(todayISO(), Number(el.dataset.d));
  },
  'task-delete': async (el) => {
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    const choice = await confirmDialog({
      title: '이 할 일을 삭제할까요?',
      message: t?.repeat_type ? '반복 업무는 모든 날짜의 할 일이 함께 사라져요.' : '',
      choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }],
    });
    if (!choice) return;
    try {
      await A.removeTask(el.dataset.id);
      closeSheet();
      toast('삭제했어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
};

export const forms = {
  task: async (f) => {
    const fd = new FormData(f);
    const title = (fd.get('title') || '').trim();
    if (!title) return toast('제목을 입력해주세요');
    const type = fd.get('repeat_type') || null;
    const daysSel = type === 'weekly' ? fd.getAll('days').map(Number) : [];
    const p = {
      title,
      assignee_ids: fd.getAll('assignee'),
      task_date: fd.get('task_date'),
      memo: (fd.get('memo') || '').trim() || null,
      trip_id: fd.get('trip_id') || null,
      repeat_type: type,
      repeat_interval: type ? Math.max(1, parseInt(fd.get('repeat_interval'), 10) || 1) : 1,
      repeat_days: type === 'weekly' && daysSel.length ? daysSel : null,
      repeat_end: type ? fd.get('repeat_end') || null : null,
      start_date: type ? null : fd.get('start_date') || null,
      due_date: type ? null : fd.get('due_date') || null,
    };
    if (!p.task_date) return toast('날짜를 선택해주세요');
    if (p.start_date && p.due_date && p.due_date < p.start_date) return toast('마감일이 시작일보다 빠를 수 없어요');
    if (p.repeat_end && p.repeat_end < p.task_date) return toast('종료일이 시작 날짜보다 빠를 수 없어요');

    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (f.dataset.id) await A.saveTask(f.dataset.id, p);
      else await A.addTask(p);
      closeSheet();
      toast(f.dataset.id ? '저장했어요' : '추가했어요');
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  },
};
