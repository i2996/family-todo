// 일정 탭: 달력(날짜에 점) + 달력 아래에 선택한 날짜의 일정 (기본은 오늘). 일정마다 작성자 표시
import { state, set } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId, NEUTRAL } from './components.js';
import { toItems, onDate, byDateMap, visibleEvents, sharedOf, eventRule } from '../logic/schedule.js';
import { repeatLabel } from '../logic/ledger.js';
import { repeatSection, syncRep, readRepeat, remindField, readRemind } from './repeat.js';
import { renderPlanBox } from './plans.js';
import { todayISO, addDays, parts, pad, startOfWeekSun, eachDay, KO_DOW, longDate, labelDate, shortRange } from '../logic/dates.js';

const TRIP_COLOR = '#8dd0b5';
const view = { y: null, m: null, selected: null };

const itemColor = (i) => {
  const m = i.by ? memberById(i.by) : null;
  return m ? m.color : i.kind === 'trip' ? TRIP_COLOR : NEUTRAL;
};

/** 공유 대상이 지정된 일정이면 '🔒 공유: 엄마, 아빠' 표시 */
function shareLabel(i) {
  const names = (i.shared || []).map(memberById).filter(Boolean).map((m) => m.name);
  return names.length ? `<small class="sch-share">🔒 공유: ${esc(names.join(', '))}</small>` : '';
}

/** 일정 한 줄 (일정 탭, 홈 공용). when: 홈에서 앞에 붙이는 날짜 문구 */
export function scheduleRow(i, { when = '' } = {}) {
  const by = i.by ? memberById(i.by) : null;
  const sub = [i.time ? `${i.time}${i.remind ? ' 🔔' : ''}` : '', i.start !== i.end ? shortRange(i.start, i.end) : '', i.place].filter(Boolean).map(esc).join(' · ');
  return `<li class="sch-item">
    <button class="sch-main" data-act="${i.kind === 'trip' ? 'open-trip' : 'edit-event'}" data-id="${i.id}"${i.occ ? ` data-occ="${i.occ}" data-day="${i.start}"` : ''}>
      ${when ? `<span class="sch-when">${esc(when)}</span>` : ''}
      <span class="sch-ico">${esc(i.icon)}</span>
      <span class="sch-body">
        <b>${i.repeat ? '<span class="sch-rep" title="반복 일정">🔁</span> ' : ''}${esc(i.title)}</b>
        ${sub ? `<small>${sub}</small>` : ''}
        ${i.memo ? `<small class="sch-memo">${esc(i.memo)}</small>` : ''}
        ${by ? `<small class="sch-by" style="--mc:${esc(by.color)}"><i class="dot"></i>작성 ${esc(by.name)}</small>` : ''}
        ${shareLabel(i)}
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
  const me = deviceMemberId();
  const events = visibleEvents(state.events, me, state.members.map((m) => m.id)); // 나에게 공유되지 않은 일정은 숨김
  const gridStart = startOfWeekSun(`${view.y}-${pad(view.m)}-01`);
  const gridEnd = addDays(gridStart, 41);
  const items = toItems(events, state.trips, { from: gridStart, to: gridEnd, extra: A.ledgerHolidays() }); // 반복 일정은 달력 기간만큼 펼침
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
  <section class="page-head"><h1>일정</h1><span class="muted">${events.length + state.trips.length}개</span></section>
  ${!me && events.length < state.events.length ? '<p class="note">일부 일정은 공유된 사람에게만 보여요. 설정에서 <b>이 기기 주인</b>을 정하면 나에게 공유된 일정도 보여요.</p>' : ''}
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
/**
 * event: 고칠 일정, occ/day: 반복 일정에서 누른 날 (원래 날짜 / 실제 날짜)
 * single: 반복 일정의 '이 날만 수정' (저장하면 그날만 따로 떼어낸 일정이 됨)
 */
export function openEventForm({ event = null, date = null, occ = null, day = null, single = false } = {}) {
  const e = event;
  const by = e ? e.created_by || '' : deviceMemberId() || '';
  const shared = sharedOf(e);
  const rule = eventRule(e);
  const startVal = single ? day : e?.start_date || date || todayISO();
  const span = e?.end_date ? Math.round((Date.parse(e.end_date) - Date.parse(e.start_date)) / 864e5) : 0;
  const endVal = single ? (span ? addDays(day, span) : '') : e?.end_date || '';
  const repBox =
    rule && occ && !single
      ? `<div class="lg-rep-box"><b>🔁 ${esc(repeatLabel(rule))}</b>
          <small>${esc(labelDate(day || occ))} 일정을 눌렀어요. 아래에서 저장하면 반복 일정 전체가 바뀌어요.</small>
          <span class="lg-rep-acts">
            <button type="button" class="chip sm" data-act="event-occ-edit" data-id="${e.id}" data-occ="${occ}" data-day="${day || occ}">이 날만 수정</button>
            <button type="button" class="chip sm" data-act="event-occ-delete" data-id="${e.id}" data-occ="${occ}">이 날만 삭제</button>
            <button type="button" class="chip sm" data-act="event-rep-stop" data-id="${e.id}">반복 그만하기</button>
          </span></div>`
      : '';
  const body = `<form data-form="event" data-id="${e && !single ? e.id : ''}" data-split="${single ? e.id : ''}" data-occ="${single ? occ : ''}" autocomplete="off">
    ${repBox}
    ${single ? `<p class="note" style="margin-top:0">🔁 반복 일정 중 <b>${esc(labelDate(day))}</b> 하나만 바꿔요. 저장하면 이 날은 따로 떨어진 일정이 돼요.</p>` : ''}
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
      <div class="field"><span class="label">${rule && !single ? '시작 날짜' : '날짜'}</span><input type="date" name="start_date" required value="${startVal}" data-change="rep-sync"></div>
      <div class="field"><span class="label">끝나는 날 (여러 날이면)</span><input type="date" name="end_date" value="${endVal}"></div>
    </div>
    <div class="grid2">
      <div class="field time-field"><span class="label">시간 (선택)</span><input type="time" name="start_time" value="${e?.start_time ? String(e.start_time).slice(0, 5) : ''}" data-change="remind-time"></div>
      <div class="field"><span class="label">장소 (선택)</span><input name="place" maxlength="60" value="${esc(e?.place)}"></div>
    </div>
    <div class="ev-remind">${remindField(e ? e.remind_offsets : [0], !!e?.start_time)}</div>
    <div class="field"><span class="label">메모 (선택)</span><textarea name="memo" rows="2" maxlength="300">${esc(e?.memo)}</textarea></div>
    <div class="field"><span class="label">작성자</span>
      <div class="chips">${state.members
        .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="radio" name="by" value="${m.id}" ${by === m.id ? 'checked' : ''} ${e ? '' : 'required'}><span><i class="dot"></i>${esc(m.name)}</span></label>`)
        .join('')}</div></div>
    <div class="field share-field"><span class="label">공유할 사람</span>
      <div class="chips">${state.members
        .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="checkbox" name="share" value="${m.id}" ${shared.includes(m.id) ? 'checked' : ''}><span><i class="dot"></i>${esc(m.name)}</span></label>`)
        .join('')}</div>
      <small class="note share-hint">아무도 고르지 않으면 온 가족에게 보여요. 고르면 작성자와 고른 사람에게만 보여요.</small></div>
    ${single ? '' : `<div class="rep-field">${repeatSection(rule, startVal, { dateField: 'start_date', noneOption: true })}</div>`}
    <div class="form-actions">
      ${e && !single ? `<button type="button" class="btn danger" data-act="event-delete" data-id="${e.id}">${rule ? '반복 전체 삭제' : '삭제'}</button>` : ''}
      <button type="submit" class="btn primary">${e ? '저장' : '추가'}</button>
    </div></form>`;
  openSheet({
    title: single ? '이 날만 수정' : rule ? '반복 일정 수정' : e ? '일정 수정' : '일정 추가',
    body,
    onMount: (el) => {
      syncRep(el.querySelector('form'));
      if (!e) setTimeout(() => el.querySelector('[name=title]').focus(), 60);
    },
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
    if (ev) openEventForm({ event: ev, occ: el.dataset.occ || null, day: el.dataset.day || null });
  },
  'event-occ-edit': (el) => {
    const ev = state.events.find((x) => x.id === el.dataset.id);
    if (ev) openEventForm({ event: ev, occ: el.dataset.occ, day: el.dataset.day, single: true });
  },
  'event-occ-delete': async (el) => {
    const ev = state.events.find((x) => x.id === el.dataset.id);
    if (!ev) return;
    const ok = await confirmDialog({
      title: '이 날 일정만 삭제할까요?',
      message: '다른 날의 반복 일정은 그대로 있어요.',
      choices: [{ label: '취소', value: false }, { label: '이 날만 삭제', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      await A.saveEvent(ev.id, { repeat_skip: [...new Set([...(ev.repeat_skip || []), el.dataset.occ])] });
      closeSheet();
      toast('이 날 일정을 삭제했어요');
    } catch (err) {
      toast(errMsg(err));
    }
  },
  'event-rep-stop': async (el) => {
    const ev = state.events.find((x) => x.id === el.dataset.id);
    if (!ev) return;
    const yesterday = addDays(todayISO(), -1);
    const noPast = yesterday < ev.start_date; // 아직 한 번도 안 지난 반복이면 통째로 지움
    const ok = await confirmDialog({
      title: '반복을 그만할까요?',
      message: noPast ? '아직 지난 일정이 없어서 이 반복 일정이 모두 지워져요.' : '지난 일정은 남고, 오늘부터의 반복 일정은 없어져요.',
      choices: [{ label: '취소', value: false }, { label: '그만하기', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      if (noPast) await A.removeEvent(ev.id);
      else await A.saveEvent(ev.id, { repeat_end: yesterday });
      closeSheet();
      toast('반복을 그만했어요');
    } catch (err) {
      toast(errMsg(err));
    }
  },
  'event-delete': async (el) => {
    const isRep = !!state.events.find((x) => x.id === el.dataset.id)?.repeat_freq;
    const ok = await confirmDialog({
      title: isRep ? '반복 일정을 모두 삭제할까요?' : '이 일정을 삭제할까요?',
      message: isRep ? '지난 날짜까지 모든 반복 일정이 지워져요. 오늘부터만 없애려면 "반복 그만하기"를 쓰세요.' : '',
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
    const er = f.querySelector('.ev-remind');
    if (er) er.hidden = trip; // 외출/여행은 시간 알림 없음
    f.querySelector('.share-field').hidden = trip; // 외출/여행은 온 가족 공개
    const rf = f.querySelector('.rep-field');
    if (rf) rf.hidden = trip; // 외출/여행은 반복 없음
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
    const share = fd.getAll('share').filter(Boolean);
    // 공유 대상: 비어 있으면 온 가족. events-share.sql 을 아직 안 돌린 곳에서도 '온 가족' 일정은 저장되게
    // 컬럼이 있을 때(기존 일정에 키가 있음)나 사람을 골랐을 때만 보낸다
    if (share.length || state.events.some((x) => 'shared_with' in x)) p.shared_with = share.length ? share : null;
    if (!p.title) return toast('제목을 입력해주세요');
    if (p.end_date && p.end_date < p.start_date) return toast('끝나는 날이 시작일보다 빠를 수 없어요');
    // 반복: events-repeat.sql 을 안 돌린 곳에서도 반복 없는 일정은 저장되게, 반복을 쓰거나 칸이 있을 때만 보냄
    const isTrip = !f.dataset.id && fd.get('kind') === 'trip';
    const r = isTrip || f.dataset.split ? null : readRepeat(f, p.start_date);
    if (r && r.end_date && r.end_date < p.start_date) return toast('반복 끝나는 날이 시작 날짜보다 빠를 수 없어요');
    const old = f.dataset.id ? state.events.find((x) => x.id === f.dataset.id) : null;
    const remind = isTrip ? undefined : readRemind(f, p.start_time);
    if (remind !== undefined) p.remind_offsets = remind; // 시간 맞춘 알림 (정각/10분 전/…)
    if (r || (old && 'repeat_freq' in old) || (f.dataset.split && state.events.some((x) => 'repeat_freq' in x))) {
      Object.assign(p, {
        repeat_freq: r ? r.freq : null,
        repeat_end: r ? r.end_date : null,
        repeat_last_day: !!r?.last_day,
        repeat_month_week: r ? r.month_week : null,
        repeat_shift: r ? r.shift : 'none',
      });
      // 시작 날짜나 반복 규칙이 바뀌면 예전에 지운 날 목록은 의미가 없어서 비움
      if (old && (old.start_date !== p.start_date || old.repeat_freq !== p.repeat_freq || !r)) p.repeat_skip = [];
    }
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (!f.dataset.id && fd.get('kind') === 'trip') {
        if (share.length) {
          btn.disabled = false;
          return toast('공유할 사람 지정은 📌 일정에서만 할 수 있어요');
        }
        // 외출/여행: 같은 달력에 표시되고, 준비할 일을 연결하는 상세 화면이 열림
        const row = await A.addTrip({ title: p.title, icon: '🏕️', start_date: p.start_date, end_date: p.end_date, place: p.place, memo: p.memo, created_by: p.created_by });
        view.selected = p.start_date;
        set({ tripId: row.id });
        closeSheet();
        toast('외출/여행을 만들었어요. 준비할 일을 추가해보세요');
        return;
      }
      if (f.dataset.split) {
        // 반복 일정의 이 날만 수정: 따로 떼어낸 일정을 만들고, 반복에서는 그 날을 뺌
        const series = state.events.find((x) => x.id === f.dataset.split);
        await A.addEvent(p);
        if (series) await A.saveEvent(series.id, { repeat_skip: [...new Set([...(series.repeat_skip || []), f.dataset.occ])] });
      } else if (f.dataset.id) await A.saveEvent(f.dataset.id, p);
      else await A.addEvent(p);
      view.selected = f.dataset.id && r ? view.selected : p.start_date; // 방금 만든 일정이 바로 보이게
      closeSheet();
      toast(f.dataset.split ? '이 날만 바꿨어요' : r && !f.dataset.id ? '반복 일정을 만들었어요' : f.dataset.id ? '저장했어요' : '추가했어요');
    } catch (err) {
      btn.disabled = false;
      const msg = String(err && err.message);
      if (msg.includes('remind_offsets')) return toast('알림을 쓰려면 먼저 supabase/reminders.sql 을 실행해주세요');
      if (msg.includes('repeat_')) return toast('반복을 쓰려면 먼저 supabase/events-repeat.sql 을 실행해주세요');
      toast(msg.includes('shared_with') ? '공유할 사람을 지정하려면 먼저 supabase/events-share.sql 을 실행해주세요' : errMsg(err));
    }
  },
};
