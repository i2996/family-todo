// 일정 탭 아래 '계획' 박스: 날짜가 정해지지 않은 외출·여행을 적어두는 목록
import { state, set } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId } from './components.js';
import { focusScheduleDate } from './schedule.js';
import { todayISO } from '../logic/dates.js';

export function renderPlanBox() {
  if (!state.plansReady) {
    return `<section class="plan-box"><div class="plan-head"><h2>📝 계획</h2></div>
      <p class="empty">계획 목록을 쓰려면 Supabase 에서 <b>supabase/plans.sql</b> 을 한 번 실행해주세요.</p></section>`;
  }
  const rows = state.plans
    .map((p) => {
      const by = p.created_by ? memberById(p.created_by) : null;
      return `<li class="plan-item"><button class="plan-main" data-act="plan-edit" data-id="${p.id}">
        <span class="plan-ico">🗺️</span>
        <span class="plan-body"><b>${esc(p.title)}</b>${p.memo ? `<small class="plan-memo">${esc(p.memo)}</small>` : ''}
          ${by ? `<small class="sch-by" style="--mc:${esc(by.color)}"><i class="dot"></i>작성 ${esc(by.name)}</small>` : ''}</span>
        <span class="go">›</span></button></li>`;
    })
    .join('');
  return `<section class="plan-box">
    <div class="plan-head"><h2>📝 계획</h2><button class="chip sm plan-add" data-act="plan-add">+ 추가</button></div>
    <p class="note" style="margin:0 0 6px">날짜가 아직 안 정해진 외출·여행을 적어두는 곳이에요.</p>
    ${state.plans.length ? `<ul class="plan-list">${rows}</ul>` : '<p class="empty">아직 적어둔 계획이 없어요</p>'}
  </section>`;
}

export function openPlanForm(plan = null) {
  const p = plan;
  const by = p ? p.created_by || '' : deviceMemberId() || '';
  openSheet({
    title: p ? '계획 수정' : '계획 추가',
    body: `<form data-form="plan" data-id="${p ? p.id : ''}" autocomplete="off">
      <input class="big-input" name="title" required maxlength="60" placeholder="가고 싶은 곳 (예: 제주도 가족여행)" value="${esc(p?.title)}">
      <div class="field"><span class="label">메모 (선택)</span><textarea name="memo" rows="2" maxlength="200" placeholder="가고 싶은 이유, 후보 시기 등">${esc(p?.memo)}</textarea></div>
      <div class="field"><span class="label">작성자</span><div class="chips">${state.members
        .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="radio" name="by" value="${m.id}" ${by === m.id ? 'checked' : ''}><span><i class="dot"></i>${esc(m.name)}</span></label>`)
        .join('')}</div></div>
      ${
        p
          ? `<div class="field plan-when"><span class="label">📅 날짜가 정해졌나요?</span>
              <div class="grid2">
                <div class="field"><span class="label">가는 날</span><input type="date" name="start_date" value="${todayISO()}"></div>
                <div class="field"><span class="label">오는 날 (하루면 비움)</span><input type="date" name="end_date"></div>
              </div>
              <button type="button" class="btn wide plan-go" data-act="plan-schedule" data-id="${p.id}">달력에 올리기</button>
              <small class="note">외출·여행으로 달력에 올라가고, 계획 목록에서는 빠져요.</small></div>`
          : ''
      }
      <div class="form-actions">
        ${p ? `<button type="button" class="btn danger" data-act="plan-delete" data-id="${p.id}">삭제</button>` : ''}
        <button type="submit" class="btn primary">${p ? '저장' : '추가'}</button>
      </div></form>`,
    onMount: (el) => !p && setTimeout(() => el.querySelector('[name=title]').focus(), 60),
  });
}

const hint = (e) => (String(e && e.message).includes('trip_plans') ? '먼저 supabase/plans.sql 을 실행해주세요' : errMsg(e));

export const actions = {
  'plan-add': () => {
    if (!state.members.length) return toast('먼저 가족 구성원을 등록해주세요');
    openPlanForm();
  },
  'plan-edit': (el) => {
    const p = state.plans.find((x) => x.id === el.dataset.id);
    if (p) openPlanForm(p);
  },
  // 날짜가 정해진 계획 → 외출·여행으로 달력에 올리고 계획에서는 지움
  'plan-schedule': async (el) => {
    const f = el.closest('form');
    const p = state.plans.find((x) => x.id === el.dataset.id);
    if (!f || !p) return;
    const start = f.elements.start_date.value;
    const end = f.elements.end_date.value || null;
    const title = f.elements.title.value.trim() || p.title;
    if (!start) return toast('가는 날을 골라주세요');
    if (end && end < start) return toast('오는 날이 가는 날보다 빠를 수 없어요');
    el.disabled = true;
    try {
      await A.addTrip({
        title, icon: '🏕️', start_date: start, end_date: end && end !== start ? end : null, place: null,
        memo: f.elements.memo.value.trim() || null, created_by: f.elements.by.value || p.created_by || null,
      });
      await A.removePlan(p.id);
      focusScheduleDate(start); // 달력을 그 날로
      closeSheet();
      set({ tab: 'schedule', tripId: null });
      toast('달력에 올렸어요! 눌러서 준비할 일을 추가할 수 있어요');
    } catch (e) {
      el.disabled = false;
      toast(hint(e));
    }
  },
  'plan-delete': async (el) => {
    const ok = await confirmDialog({ title: '이 계획을 삭제할까요?', choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }] });
    if (!ok) return;
    try {
      await A.removePlan(el.dataset.id);
      closeSheet();
      toast('삭제했어요');
    } catch (e) {
      toast(hint(e));
    }
  },
};

export const forms = {
  plan: async (f) => {
    const fd = new FormData(f);
    const p = { title: (fd.get('title') || '').trim(), memo: (fd.get('memo') || '').trim() || null, created_by: fd.get('by') || null };
    if (!p.title) return toast('가고 싶은 곳을 적어주세요');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (f.dataset.id) await A.savePlan(f.dataset.id, p);
      else await A.addPlan(p);
      closeSheet();
      toast(f.dataset.id ? '저장했어요' : '추가했어요');
    } catch (e) {
      btn.disabled = false;
      toast(hint(e));
    }
  },
};
