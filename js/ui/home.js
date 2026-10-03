// 홈: 오늘/내일 할 일 + 요약 + 미니 달력
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import { buildTaskList, filterByMember, sortOccurrences } from '../logic/filters.js';
import { occurrencesInRange } from '../logic/recurrence.js';
import { todayISO, addDays, parts, pad, startOfWeekSun, eachDay, KO_DOW, longDate, labelDate, shortRange } from '../logic/dates.js';
import { esc, deviceMemberId, memberById, taskList, taskRow, occFor, memberChips } from './components.js';
import { openTaskForm } from './taskForm.js';
import { openMemberForm } from './settings.js';
import * as A from '../actions.js';

const view = { y: null, m: null, selected: null, scope: null };

function onboarding() {
  return `<section class="hero"><h1>가족 공간이 만들어졌어요 ✿</h1>
    <p class="hero-sub">할 일을 나누려면 먼저 가족 구성원을 등록해요.</p>
    <div class="stack">
      <button class="btn primary" data-act="add-default-members">나·남편·첫째·둘째로 시작</button>
      <button class="btn" data-act="member-add">직접 등록하기</button>
    </div></section>`;
}

function calendar(today, memberFilter) {
  const first = `${view.y}-${pad(view.m)}-01`;
  const gridStart = startOfWeekSun(first);
  const gridEnd = addDays(gridStart, 41);

  const dots = new Map(); // date -> Map(color -> hasPending)
  for (const o of filterByMember(occurrencesInRange(state.tasks, state.completions, gridStart, gridEnd), memberFilter)) {
    const m = memberById(o.task.assignee_id);
    const color = m ? m.color : '#c9bfc4';
    if (!dots.has(o.date)) dots.set(o.date, new Map());
    const mp = dots.get(o.date);
    mp.set(color, (mp.get(color) || false) || !o.done);
  }
  const tripOn = new Map();
  for (const tr of state.trips) {
    const s = tr.start_date > gridStart ? tr.start_date : gridStart;
    const e = (tr.end_date || tr.start_date) < gridEnd ? tr.end_date || tr.start_date : gridEnd;
    if (s > e) continue;
    for (const d of eachDay(s, e)) if (!tripOn.has(d)) tripOn.set(d, tr);
  }

  const cells = eachDay(gridStart, gridEnd)
    .map((d) => {
      const [, m, dd] = parts(d);
      const ds = [...(dots.get(d) || [])].slice(0, 3);
      const tr = tripOn.get(d);
      return `<button class="day${m !== view.m ? ' other' : ''}${d === today ? ' today' : ''}${d === view.selected ? ' sel' : ''}"
        data-act="pick-date" data-date="${d}" aria-label="${longDate(d)}">
        <span class="n">${dd}</span>
        <span class="dots">${ds.map(([c, pending]) => `<i class="dot${pending ? '' : ' faded'}" style="--mc:${esc(c)}"></i>`).join('')}</span>
        ${tr ? `<span class="trip-mark">${esc(tr.icon)}</span>` : ''}
      </button>`;
    })
    .join('');

  return `<div class="cal-head">
      <button class="icon-btn" data-act="cal-prev" aria-label="이전 달">‹</button>
      <strong>${view.y}년 ${view.m}월</strong>
      <button class="icon-btn" data-act="cal-next" aria-label="다음 달">›</button>
      <button class="chip sm" data-act="cal-today">오늘</button>
    </div>
    <div class="cal-grid">
      ${KO_DOW.map((d, i) => `<span class="dow${i === 0 ? ' sun' : ''}">${d}</span>`).join('')}${cells}
    </div>`;
}

function dayDetail(date, memberFilter, today) {
  const dayTrips = state.trips.filter((t) => t.start_date <= date && date <= (t.end_date || t.start_date));
  const tripIds = new Set(dayTrips.map((t) => t.id));
  const occs = sortOccurrences(
    filterByMember(occurrencesInRange(state.tasks, state.completions, date, date), memberFilter),
    state.members
  ).filter((o) => !tripIds.has(o.task.trip_id));

  const tripHtml = dayTrips
    .map((tr) => {
      const linked = state.tasks.filter((t) => t.trip_id === tr.id).map((t) => occFor(t));
      return `<div class="trip-block">
        <button class="trip-line" data-act="open-trip" data-id="${tr.id}">
          <span class="trip-ico">${esc(tr.icon)}</span><b>${esc(tr.title)}</b>
          <small>${shortRange(tr.start_date, tr.end_date)}${tr.place ? ` · ${esc(tr.place)}` : ''}</small><span class="go">›</span>
        </button>
        ${linked.length ? `<ul class="tasks compact">${linked.map((o) => taskRow(o, { showDate: true })).join('')}</ul>` : ''}
      </div>`;
    })
    .join('');

  return `<div class="day-detail">
    <div class="day-detail-head"><h3>${labelDate(date, today) === '오늘' ? '오늘' : longDate(date)}</h3>
      <button class="chip sm" data-act="add-task" data-date="${date}">+ 이 날 할 일</button></div>
    ${tripHtml}
    ${occs.length ? `<ul class="tasks compact">${occs.map((o) => taskRow(o)).join('')}</ul>` : dayTrips.length ? '' : '<p class="empty">이 날은 할 일이 없어요</p>'}
  </div>`;
}

export function renderHome() {
  if (!state.members.length) return onboarding();
  const today = todayISO();
  if (view.y == null) [view.y, view.m] = parts(today);

  const dev = deviceMemberId();
  const scope = view.scope ?? (dev ? 'me' : 'all');
  const memberFilter = scope === 'me' && dev ? dev : 'all';
  const ctx = { tasks: state.tasks, completions: state.completions, members: state.members };

  const todayList = buildTaskList(ctx, { member: memberFilter, period: 'today', status: 'all' }, today);
  const tomorrow = addDays(today, 1);
  const tomorrowList = sortOccurrences(
    filterByMember(occurrencesInRange(state.tasks, state.completions, tomorrow, tomorrow), memberFilter),
    state.members
  );
  const family = buildTaskList(ctx, { member: 'all', period: 'today', status: 'all' }, today);
  const famPending = family.filter((o) => !o.done);
  const myPending = todayList.filter((o) => !o.done).length;

  const perMember = state.members
    .map((m) => ({ m, n: famPending.filter((o) => o.task.assignee_id === m.id).length }))
    .filter((x) => x.n > 0);

  const me = dev ? memberById(dev) : null;
  const heroTitle = me && scope === 'me' ? `${esc(me.name)}, 오늘 할 일 ${myPending}개 남았어요` : `오늘 가족 할 일 ${famPending.length}개 남았어요`;
  const heroDone = (me && scope === 'me' ? myPending : famPending.length) === 0 && todayList.length > 0;

  const tomorrowShown = tomorrowList.slice(0, 5);

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
        <div class="sec-head"><h2>내일</h2><span class="muted">${tomorrowList.length}개</span></div>
        ${
          tomorrowShown.length
            ? `<ul class="tasks compact">${tomorrowShown.map((o) => taskRow(o)).join('')}</ul>${tomorrowList.length > 5 ? `<button class="more-link" data-act="goto-tasks">+ ${tomorrowList.length - 5}개 더 보기</button>` : ''}`
            : '<p class="empty">내일 할 일은 아직 없어요</p>'
        }
      </section>
    </div>

    <div class="home-col">
      <section>
        <div class="sec-head"><h2>달력</h2><span class="muted">${memberFilter === 'all' ? '가족 전체' : esc(me.name)} 할 일 표시</span></div>
        ${calendar(today, memberFilter)}
        ${view.selected ? dayDetail(view.selected, memberFilter, today) : '<p class="hint">날짜를 누르면 그날 일정이 보여요</p>'}
      </section>
    </div>
  </div>
  <button class="fab" data-act="add-task">+ 할 일 추가</button>`;
}

const shiftMonth = (n) => {
  const d = new Date(view.y, view.m - 1 + n, 1);
  view.y = d.getFullYear();
  view.m = d.getMonth() + 1;
  set();
};

export const actions = {
  'home-scope': (el) => {
    view.scope = el.dataset.v;
    set();
  },
  'cal-prev': () => shiftMonth(-1),
  'cal-next': () => shiftMonth(1),
  'cal-today': () => {
    [view.y, view.m] = parts(todayISO());
    view.selected = todayISO();
    set();
  },
  'pick-date': (el) => {
    view.selected = view.selected === el.dataset.date ? null : el.dataset.date;
    const [y, m] = parts(el.dataset.date);
    if (m !== view.m) {
      view.y = y;
      view.m = m;
    }
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
