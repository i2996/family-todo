// 일정 탭: 달력(날짜에 점) + 달력 아래에 선택한 날짜의 일정 (기본은 오늘). 일정마다 작성자 표시
import { state, set } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId, NEUTRAL } from './components.js';
import { toItems, onDate, byDateMap } from '../logic/schedule.js';
import { renderPlanBox } from './plans.js';
import { todayISO, addDays, parts, pad, startOfWeekSun, eachDay, KO_DOW, longDate, labelDate, shortRange } from '../logic/dates.js';

const TRIP_COLOR = '#8dd0b5';
const view = { y: null, m: null, selected: null };

const itemColor = (i) => {
  const m = i.by ? memberById(i.by) : null;
  return m ? m.color : i.kind === 'trip' ? TRIP_COLOR : NEUTRAL;
};

/** 일정 한 줄 (일정 탭, 홈 공용). when: 홈에서 앞에 붙이는 날짜 문구 */
export function scheduleRow(i, { when = '' } = {}) {
  const by = i.by ? memberById(i.by) : null;
  const sub = [i.time, i.start !== i.end ? shortRange(i.start, i.end) : '', i.place].filter(Boolean).map(esc).join(' · ');
  return `<li class="sch-item">
    <button class="sch-main" data-act="${i.kind === 'trip' ? 'open-trip' : 'edit-event'}" data-id="${i.id}">
      ${when ? `<span class="sch-when">${esc(when)}</span>` : ''}
      <span class="sch-ico">${esc(i.icon)}</span>
      <span class="sch-body">
        <b>${esc(i.title)}</b>
        ${sub ? `<small>${sub}</small>` : ''}
        ${i.memo ? `<small class="sch-memo">${esc(i.memo)}</small>` : ''}
        ${by ? `<small class="sch-by" style="--mc:${esc(by.color)}"><i class="dot"></i>작성 ${esc(by.name)}</small>` : ''}
      </span>
      <span class="go">›</span>
    </button>
  </li>`;
}

export function renderSchedule() {
  if (!state.eventsReady) {
    return `<section class="page-head"><h1>일정</h1></section>
      <p class="empty big">일정 기능을 쓰려면 Supabase 에서<br><b>supabase/events.sql</b> 을 한 번 실행해주세요.<br><small>(SQL Editor 에 붙여넣고 Run)</small></p>`;
  }
  const today = todayISO();
  if (view.y == null) {
    [view.y, view.m] = parts(today);
    view.selected = today; // 처음엔 오늘 일정이 보이게
  }
  const items = toItems(state.events, state.trips);
  const gridStart = startOfWeekSun(`${view.y}-${pad(view.m)}-01`);
  const gridEnd = addDays(gridStart, 41);
  const map = byDateMap(items, gridStart, gridEnd);

  const cells = eachDay(gridStart, gridEnd)
    .map((d) => {
      const [, m, dd] = parts(d);
      const dayItems = map.get(d) || [];
      let mark = '';
      if (dayItems.length === 1) {
        // 일정이 1개면 작은 글씨로 제목 표시 (작성자 색 배경)
        const i = dayItems[0];
        mark = `<span class="cal-text" style="--mc:${esc(itemColor(i))}">${i.kind === 'trip' ? esc(i.icon) : ''}${esc(i.title)}</span>`;
      } else if (dayItems.length > 1) {
        // 2개 이상이면 일정마다 작성자 색 점 (최대 4개)
        mark = `<span class="dots">${dayItems.slice(0, 4).map((i) => `<i class="dot" style="--mc:${esc(itemColor(i))}"></i>`).join('')}</span>`;
      }
      return `<button class="day${m !== view.m ? ' other' : ''}${d === today ? ' today' : ''}${d === view.selected ? ' sel' : ''}"
        data-act="pick-date" data-date="${d}" aria-label="${longDate(d)}">
        <span class="n">${dd}</span>${mark}
      </button>`;
    })
    .join('');

  const list = onDate(items, view.selected);
  return `
  <section class="page-head"><h1>일정</h1><span class="muted">${state.events.length + state.trips.length}개</span></section>
  <div class="cal-head">
    <button class="icon-btn" data-act="cal-prev" aria-label="이전 달">‹</button>
    <strong>${view.y}년 ${view.m}월</strong>
    <button class="icon-btn" data-act="cal-next" aria-label="다음 달">›</button>
    <button class="chip sm" data-act="cal-today">오늘</button>
  </div>
  <div class="cal-grid big">
    ${KO_DOW.map((d, i) => `<span class="dow${i === 0 ? ' sun' : ''}">${d}</span>`).join('')}${cells}
  </div>

  <div class="sec-head" style="margin-top:20px"><h2>${labelDate(view.selected, today)} 일정</h2><span class="muted">${list.length}개</span></div>
  ${list.length ? `<ul class="sch-list">${list.map((i) => scheduleRow(i)).join('')}</ul>` : '<p class="empty">이 날은 일정이 없어요</p>'}
  ${renderPlanBox()}
  <button class="fab" data-act="add-event" aria-label="일정 추가">+</button>`;
}

/* ---------- 일정 추가/수정 폼 ---------- */
export function openEventForm({ event = null, date = null } = {}) {
  const e = event;
  const by = e ? e.created_by || '' : deviceMemberId() || '';
  const body = `<form data-form="event" data-id="${e ? e.id : ''}" autocomplete="off">
    ${
      e
        ? ''
        : `<div class="field" style="margin-top:0"><span class="label">종류</span>
        <div class="chips">
          <label class="chip pick"><input type="radio" name="kind" value="event" data-change="event-kind" checked><span>📌 일정</span></label>
          <label class="chip pick"><input type="radio" name="kind" value="trip" data-change="event-kind"><span>🏕️ 외출·여행</span></label>
        </div>
        <small class="kind-hint">외출/여행은 만든 뒤에 열리는 화면에서 준비할 일을 연결할 수 있어요.</small></div>`
    }
    <input class="big-input" name="title" required maxlength="80" placeholder="무슨 일정인가요? (예: 학부모 상담)" value="${esc(e?.title)}">
    <div class="grid2">
      <div class="field"><span class="label">날짜</span><input type="date" name="start_date" required value="${e?.start_date || date || todayISO()}"></div>
      <div class="field"><span class="label">끝나는 날 (여러 날이면)</span><input type="date" name="end_date" value="${e?.end_date || ''}"></div>
    </div>
    <div class="grid2">
      <div class="field time-field"><span class="label">시간 (선택)</span><input type="time" name="start_time" value="${e?.start_time ? String(e.start_time).slice(0, 5) : ''}"></div>
      <div class="field"><span class="label">장소 (선택)</span><input name="place" maxlength="60" value="${esc(e?.place)}"></div>
    </div>
    <div class="field"><span class="label">메모 (선택)</span><textarea name="memo" rows="2" maxlength="300">${esc(e?.memo)}</textarea></div>
    <div class="field"><span class="label">작성자</span>
      <div class="chips">${state.members
        .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="radio" name="by" value="${m.id}" ${by === m.id ? 'checked' : ''} ${e ? '' : 'required'}><span><i class="dot"></i>${esc(m.name)}</span></label>`)
        .join('')}</div></div>
    <div class="form-actions">
      ${e ? `<button type="button" class="btn danger" data-act="event-delete" data-id="${e.id}">삭제</button>` : ''}
      <button type="submit" class="btn primary">${e ? '저장' : '추가'}</button>
    </div></form>`;
  openSheet({
    title: e ? '일정 수정' : '일정 추가',
    body,
    onMount: (el) => !e && setTimeout(() => el.querySelector('[name=title]').focus(), 60),
  });
}

const shiftMonth = (n) => {
  const d = new Date(view.y, view.m - 1 + n, 1);
  view.y = d.getFullYear();
  view.m = d.getMonth() + 1;
  set();
};

export const actions = {
  'cal-prev': () => shiftMonth(-1),
  'cal-next': () => shiftMonth(1),
  'cal-today': () => {
    const t = todayISO();
    [view.y, view.m] = parts(t);
    view.selected = t;
    set();
  },
  'pick-date': (el) => {
    view.selected = el.dataset.date;
    const [y, m] = parts(el.dataset.date);
    if (m !== view.m || y !== view.y) {
      view.y = y;
      view.m = m;
    }
    set();
  },
  'goto-schedule': () => {
    set({ tab: 'schedule', tripId: null });
    window.scrollTo(0, 0);
  },
  'add-event': () => {
    if (!state.members.length) return toast('먼저 가족 구성원을 등록해주세요');
    openEventForm({ date: view.selected || todayISO() });
  },
  'edit-event': (el) => {
    const ev = state.events.find((x) => x.id === el.dataset.id);
    if (ev) openEventForm({ event: ev });
  },
  'event-delete': async (el) => {
    const ok = await confirmDialog({
      title: '이 일정을 삭제할까요?',
      choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      await A.removeEvent(el.dataset.id);
      closeSheet();
      toast('삭제했어요');
    } catch (err) {
      toast(errMsg(err));
    }
  },
};

export const changes = {
  'event-kind': (el) => {
    const f = el.closest('form');
    const trip = f.elements.kind.value === 'trip';
    f.querySelector('.time-field').hidden = trip; // 외출/여행에는 시간 입력 없음
    f.querySelector('.kind-hint').classList.toggle('on', trip); // 안내 글자는 자리를 항상 차지해서 간격이 일정함
  },
};

export const forms = {
  event: async (f) => {
    const fd = new FormData(f);
    const p = {
      title: (fd.get('title') || '').trim(),
      start_date: fd.get('start_date'),
      end_date: fd.get('end_date') || null,
      start_time: fd.get('start_time') || null,
      place: (fd.get('place') || '').trim() || null,
      memo: (fd.get('memo') || '').trim() || null,
      created_by: fd.get('by') || null,
    };
    if (!p.title) return toast('제목을 입력해주세요');
    if (p.end_date && p.end_date < p.start_date) return toast('끝나는 날이 시작일보다 빠를 수 없어요');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (!f.dataset.id && fd.get('kind') === 'trip') {
        // 외출/여행: 같은 달력에 표시되고, 준비할 일을 연결하는 상세 화면이 열림
        const row = await A.addTrip({ title: p.title, icon: '🏕️', start_date: p.start_date, end_date: p.end_date, place: p.place, memo: p.memo, created_by: p.created_by });
        view.selected = p.start_date;
        set({ tripId: row.id });
        closeSheet();
        toast('외출/여행을 만들었어요. 준비할 일을 추가해보세요');
        return;
      }
      if (f.dataset.id) await A.saveEvent(f.dataset.id, p);
      else await A.addEvent(p);
      view.selected = p.start_date; // 방금 만든 일정이 바로 보이게
      closeSheet();
      toast(f.dataset.id ? '저장했어요' : '추가했어요');
    } catch (err) {
      btn.disabled = false;
      toast(errMsg(err));
    }
  },
};
