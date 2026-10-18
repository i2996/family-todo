// 일정 탭 아래 '계획' 박스: 날짜가 정해지지 않은 외출·여행을 적어두는 목록
import { state } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId } from './components.js';

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
