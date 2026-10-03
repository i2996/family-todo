// 외출/여행: 목록 + 상세(준비 할 일 연결) + 등록 폼
import { state, set } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, tripById, taskRow, occFor, toast, errMsg } from './components.js';
import { openTaskForm } from './taskForm.js';
import { todayISO, diffDays, shortRange, longDate } from '../logic/dates.js';

const ICONS = ['🏕️', '🚗', '✈️', '🏖️', '🏔️', '🎡', '🍽️', '🏥', '🎒', '🏠'];

const progress = (tripId) => {
  const list = state.tasks.filter((t) => t.trip_id === tripId).map((t) => occFor(t));
  return { total: list.length, done: list.filter((o) => o.done).length };
};

const dday = (t, today) => {
  const end = t.end_date || t.start_date;
  if (end < today) return '';
  const d = diffDays(today, t.start_date);
  return d > 0 ? `D-${d}` : d === 0 ? '오늘' : '진행 중';
};

function tripRow(t, today) {
  const p = progress(t.id);
  return `<li><button class="trip-row" data-act="open-trip" data-id="${t.id}">
    <span class="trip-ico">${esc(t.icon)}</span>
    <span class="trip-main"><b>${esc(t.title)}</b>
      <small>${shortRange(t.start_date, t.end_date)}${t.place ? ` · ${esc(t.place)}` : ''}</small>
      ${p.total ? `<small class="prog">준비 ${p.done}/${p.total}</small>` : ''}</span>
    <span class="dday">${dday(t, today)}</span>
  </button></li>`;
}

export function renderTrips() {
  if (state.tripId && tripById(state.tripId)) return renderTripDetail(tripById(state.tripId));
  const today = todayISO();
  const upcoming = state.trips.filter((t) => (t.end_date || t.start_date) >= today);
  const past = state.trips.filter((t) => (t.end_date || t.start_date) < today).reverse();
  return `
  <section class="page-head"><h1>외출 / 여행</h1></section>
  ${upcoming.length ? `<ul class="trip-list">${upcoming.map((t) => tripRow(t, today)).join('')}</ul>` : '<p class="empty big">다가오는 외출이나 여행이 없어요</p>'}
  ${past.length ? `<details class="past"><summary>지난 일정 ${past.length}개</summary><ul class="trip-list">${past.map((t) => tripRow(t, today)).join('')}</ul></details>` : ''}
  <button class="fab" data-act="add-trip" aria-label="외출/여행 추가">+</button>`;
}

function renderTripDetail(t) {
  const today = todayISO();
  const occs = state.tasks
    .filter((x) => x.trip_id === t.id)
    .map((x) => occFor(x))
    .sort((a, b) => (a.done === b.done ? a.date.localeCompare(b.date) : a.done ? 1 : -1));
  const p = progress(t.id);
  return `
  <button class="back-link" data-act="trip-back">‹ 목록으로</button>
  <section class="trip-hero">
    <div class="trip-ico lg">${esc(t.icon)}</div>
    <h1>${esc(t.title)}</h1>
    <p class="trip-dates">${longDate(t.start_date)}${t.end_date && t.end_date !== t.start_date ? ` ~ ${longDate(t.end_date)}` : ''}</p>
    ${t.place ? `<p class="trip-place">📍 ${esc(t.place)}</p>` : ''}
    ${t.memo ? `<p class="trip-memo">${esc(t.memo)}</p>` : ''}
    <button class="chip sm" data-act="edit-trip" data-id="${t.id}">수정</button>
  </section>
  <section>
    <div class="sec-head"><h2>준비할 일</h2><span class="muted">${p.done}/${p.total}</span></div>
    ${occs.length ? `<ul class="tasks">${occs.map((o) => taskRow(o, { showDate: true })).join('')}</ul>` : '<p class="empty">준비할 일을 추가해보세요</p>'}
  </section>
  <button class="fab" data-act="add-trip-task" data-id="${t.id}" aria-label="준비할 일 추가">+</button>`;
}

export function openTripForm(trip = null) {
  const t = trip;
  const icon = t?.icon || ICONS[0];
  const body = `<form data-form="trip" data-id="${t ? t.id : ''}" autocomplete="off">
    <input class="big-input" name="title" required maxlength="60" placeholder="어디 가나요? (예: 경주 여행)" value="${esc(t?.title)}">
    <div class="field"><span class="label">아이콘</span>
      <div class="chips">${ICONS.map((i) => `<label class="chip pick sm"><input type="radio" name="icon" value="${i}" ${i === icon ? 'checked' : ''}><span>${i}</span></label>`).join('')}</div></div>
    <div class="grid2">
      <div class="field"><span class="label">시작 날짜</span><input type="date" name="start_date" required value="${t?.start_date || todayISO()}"></div>
      <div class="field"><span class="label">끝나는 날 (하루면 비움)</span><input type="date" name="end_date" value="${t?.end_date || ''}"></div>
    </div>
    <div class="field"><span class="label">장소</span><input name="place" maxlength="60" value="${esc(t?.place)}"></div>
    <div class="field"><span class="label">메모</span><textarea name="memo" rows="2" maxlength="300">${esc(t?.memo)}</textarea></div>
    <div class="form-actions">
      ${t ? `<button type="button" class="btn danger" data-act="trip-delete" data-id="${t.id}">삭제</button>` : ''}
      <button type="submit" class="btn primary">${t ? '저장' : '추가'}</button>
    </div></form>`;
  openSheet({
    title: t ? '외출/여행 수정' : '외출/여행 추가',
    body,
    onMount: (el) => !t && setTimeout(() => el.querySelector('[name=title]').focus(), 60),
  });
}

export const actions = {
  'open-trip': (el) => {
    closeSheet();
    set({ tab: 'trips', tripId: el.dataset.id });
    window.scrollTo(0, 0);
  },
  'trip-back': () => set({ tripId: null }),
  'add-trip': () => openTripForm(),
  'edit-trip': (el) => openTripForm(tripById(el.dataset.id)),
  'add-trip-task': (el) => openTaskForm({ tripId: el.dataset.id }),
  'trip-delete': async (el) => {
    const id = el.dataset.id;
    const n = state.tasks.filter((t) => t.trip_id === id).length;
    const choice = await confirmDialog({
      title: '이 외출/여행을 삭제할까요?',
      message: n ? `연결된 준비 할 일이 ${n}개 있어요.` : '',
      choices: [
        { label: '취소', value: null },
        ...(n ? [{ label: '준비 할 일은 남기기', value: 'keep' }] : []),
        { label: n ? '준비 할 일도 삭제' : '삭제', value: 'all', kind: 'danger' },
      ],
    });
    if (!choice) return;
    try {
      await A.removeTrip(id, { deleteTasks: choice === 'all' });
      closeSheet();
      toast('삭제했어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
};

export const forms = {
  trip: async (f) => {
    const fd = new FormData(f);
    const p = {
      title: (fd.get('title') || '').trim(),
      icon: fd.get('icon') || ICONS[0],
      start_date: fd.get('start_date'),
      end_date: fd.get('end_date') || null,
      place: (fd.get('place') || '').trim() || null,
      memo: (fd.get('memo') || '').trim() || null,
    };
    if (!p.title) return toast('제목을 입력해주세요');
    if (p.end_date && p.end_date < p.start_date) return toast('끝나는 날이 시작일보다 빠를 수 없어요');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (f.dataset.id) await A.saveTrip(f.dataset.id, p);
      else {
        const row = await A.addTrip(p);
        set({ tripId: row.id });
      }
      closeSheet();
      toast('저장했어요');
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  },
};
