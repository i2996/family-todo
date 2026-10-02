// 할 일 화면: 담당자 + 기간 + 완료 여부 필터 조합
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { buildTaskList, groupByDate, PERIODS, STATUSES } from '../logic/filters.js';
import { todayISO } from '../logic/dates.js';
import { taskRow, memberChips, deviceMemberId } from './components.js';

/** 현재 적용되는 필터 (담당자는 기기별로 기억, 저장값이 없으면 이 기기 주인) */
export function currentFilter() {
  const f = prefs.getFilter();
  let member = f.member ?? deviceMemberId() ?? 'all';
  if (member !== 'all' && !state.members.some((m) => m.id === member)) member = 'all';
  return { member, period: f.period, status: f.status };
}

const chipRow = (items, selected, action) =>
  items.map((i) => `<button class="chip sm${selected === i.id ? ' on' : ''}" data-act="${action}" data-v="${i.id}">${i.label}</button>`).join('');

export function renderTasks() {
  const today = todayISO();
  const f = currentFilter();
  const occs = buildTaskList({ tasks: state.tasks, completions: state.completions, members: state.members }, f, today);
  const groups = groupByDate(occs, today);

  return `
  <section class="page-head"><h1>할 일</h1><span class="muted">${occs.length}개</span></section>
  <div class="filters">
    <div class="chips scroll">${memberChips({ selected: f.member, action: 'f-member' })}</div>
    <div class="chips">${chipRow(PERIODS, f.period, 'f-period')}<span class="sep"></span>${chipRow(STATUSES, f.status, 'f-status')}</div>
  </div>
  ${
    groups.length
      ? groups
          .map(
            (g) => `<section class="day-group${g.key === 'overdue' ? ' late' : ''}">
              <h3 class="day-head">${g.label}${g.sub ? `<small>${g.sub}</small>` : ''}</h3>
              <ul class="tasks">${g.items.map((o) => taskRow(o)).join('')}</ul></section>`
          )
          .join('')
      : `<p class="empty big">${f.status === 'pending' ? '남은 할 일이 없어요 🎉' : '해당하는 할 일이 없어요'}</p>`
  }
  <button class="fab" data-act="add-task">+ 할 일 추가</button>`;
}

const update = (patch) => {
  prefs.setFilter({ ...prefs.getFilter(), ...patch });
  set();
};

export const actions = {
  'f-member': (el) => update({ member: el.dataset.v }),
  'f-period': (el) => update({ period: el.dataset.v }),
  'f-status': (el) => update({ status: el.dataset.v }),
};
