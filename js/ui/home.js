// 홈: 오늘 할 일 + 다가오는 할 일 + 다가오는 일정 + 요약 (달력은 '일정' 탭으로 이동)
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { buildTaskList, filterByMember, sortOccurrences } from '../logic/filters.js';
import { occurrencesInRange } from '../logic/recurrence.js';
import { toItems, upcoming } from '../logic/schedule.js';
import { todayISO, addDays, longDate, labelDate, shortDate, dow, KO_DOW } from '../logic/dates.js';
import { esc, deviceMemberId, memberById, taskList, taskRow } from './components.js';
import { isAssignedTo } from '../logic/assign.js';
import { scheduleRow } from './schedule.js';
import { openMemberForm } from './settings.js';
import * as A from '../actions.js';

const view = { scope: null };

function onboarding() {
  return `<section class="hero"><h1>가족 공간이 만들어졌어요 ✿</h1>
    <p class="hero-sub">할 일을 나누려면 먼저 가족 구성원을 등록해요.</p>
    <div class="stack">
      <button class="btn primary" data-act="add-default-members">나·남편·첫째·둘째로 시작</button>
      <button class="btn" data-act="member-add">직접 등록하기</button>
    </div></section>`;
}

export function renderHome() {
  if (!state.members.length) return onboarding();
  const today = todayISO();

  const dev = deviceMemberId();
  const scope = view.scope ?? (dev ? 'me' : 'all');
  const memberFilter = scope === 'me' && dev ? dev : 'all';
  const ctx = { tasks: state.tasks, completions: state.completions, members: state.members };

  const todayList = buildTaskList(ctx, { member: memberFilter, period: 'today', status: 'all' }, today);
  // 가까운 시일(내일부터 7일 이내)의 남은 할 일
  const soonTasks = sortOccurrences(
    filterByMember(occurrencesInRange(state.tasks, state.completions, addDays(today, 1), addDays(today, 7)), memberFilter).filter((o) => !o.done),
    state.members
  );
  // 가까운 시일(오늘부터 7일 이내)의 일정 = 일정 + 외출/여행
  const soonSchedule = upcoming(toItems(state.events, state.trips), today, 7);
  const family = buildTaskList(ctx, { member: 'all', period: 'today', status: 'all' }, today);
  const famPending = family.filter((o) => !o.done);
  const myPending = todayList.filter((o) => !o.done).length;

  const perMember = state.members
    .map((m) => ({ m, n: famPending.filter((o) => isAssignedTo(o.task, m.id)).length }))
    .filter((x) => x.n > 0);

  const me = dev ? memberById(dev) : null;
  const heroTitle = me && scope === 'me' ? `${esc(me.name)}, 오늘 할 일 ${myPending}개 남았어요` : `오늘 가족 할 일 ${famPending.length}개 남았어요`;
  const heroDone = (me && scope === 'me' ? myPending : famPending.length) === 0 && todayList.length > 0;

  const soonTasksShown = soonTasks.slice(0, 6);
  const soonScheduleShown = soonSchedule.slice(0, 5);
  // 오늘/내일은 말로, 그 외는 짧게 (10/17 토)
  const whenLabel = (i) => {
    if (i.start < today) return '진행 중';
    const l = labelDate(i.date, today);
    return l === '오늘' || l === '내일' ? l : `${shortDate(i.date)} ${KO_DOW[dow(i.date)]}`;
  };

  return `
  <section class="hero">
    <div class="date-tape">${longDate(today)}</div>
    <h1>${heroDone ? '오늘 할 일 끝! 🎉' : heroTitle}</h1>
    <div class="stickers">
      <span class="sticker" style="--mc:#9b87e0">남은 일 <b>${famPending.length}</b></span>
      <span class="sticker" style="--mc:#5fc4a0">완료 <b>${family.length - famPending.length}</b></span>
      ${perMember.map((x) => `<span class="sticker" style="--mc:${esc(x.m.color)}"><i class="dot"></i>${esc(x.m.name)} <b>${x.n}</b></span>`).join('')}
    </div>
    ${
      dev
        ? ''
        : `<div class="who-ask"><p>이 기기는 누구 거예요? 한 번만 골라두면 열자마자 내 할 일이 보여요.</p>
           <div class="chips">${state.members.map((m) => `<button class="chip" style="--mc:${esc(m.color)}" data-act="set-device" data-v="${m.id}"><i class="dot"></i>${esc(m.name)}</button>`).join('')}</div></div>`
    }
  </section>

  <div class="home-grid">
    <div class="home-col">
      <section>
        <div class="sec-head">
          <h2>오늘 ${scope === 'me' && me ? '내가 할 일' : '가족 할 일'}</h2>
          ${
            me
              ? `<div class="seg" role="group"><button class="${scope === 'me' ? 'on' : ''}" data-act="home-scope" data-v="me">${esc(me.name)}</button><button class="${scope === 'all' ? 'on' : ''}" data-act="home-scope" data-v="all">전체</button></div>`
              : ''
          }
        </div>
        ${taskList(todayList, {}, '오늘은 할 일이 없어요 ☺')}
      </section>

      <section>
        <div class="sec-head"><h2>다가오는 할 일</h2><span class="muted">내일부터 7일 · ${soonTasks.length}개</span></div>
        ${
          soonTasksShown.length
            ? `<ul class="tasks compact">${soonTasksShown.map((o) => taskRow(o, { showDate: true })).join('')}</ul>${soonTasks.length > 6 ? `<button class="more-link" data-act="goto-tasks">+ ${soonTasks.length - 6}개 더 보기</button>` : ''}`
            : '<p class="empty">가까운 날에 남은 할 일이 없어요</p>'
        }
      </section>
    </div>

    <div class="home-col">
      <section>
        <div class="sec-head"><h2>다가오는 일정</h2><span class="muted">7일 이내 · ${soonSchedule.length}개</span></div>
        ${
          soonScheduleShown.length
            ? `<ul class="sch-list">${soonScheduleShown.map((i) => scheduleRow(i, { when: whenLabel(i) })).join('')}</ul>${soonSchedule.length > 5 ? `<button class="more-link" data-act="goto-schedule">+ ${soonSchedule.length - 5}개 더 보기</button>` : `<button class="more-link" data-act="goto-schedule">달력으로 보기 ›</button>`}`
            : `<p class="empty">가까운 일정이 없어요</p><button class="more-link" data-act="goto-schedule">달력으로 보기 ›</button>`
        }
      </section>
    </div>
  </div>
  <button class="fab" data-act="add-task" aria-label="할 일 추가">+</button>`;
}

export const actions = {
  'home-scope': (el) => {
    view.scope = el.dataset.v;
    set();
  },
  'set-device': (el) => {
    prefs.setDeviceMember(el.dataset.v);
    set();
  },
  'add-default-members': async () => {
    await A.addDefaultMembers();
  },
  'member-add': () => openMemberForm(),
  'goto-tasks': () => set({ tab: 'tasks', tripId: null }),
};
