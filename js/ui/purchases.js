// 구매 목록: 할 일 탭 하단의 테두리 박스. [구매예정] [승인 대기] 탭 + 카테고리(생필품·간식·식재료·기타)별 목록
import { state } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId } from './components.js';
import { CATEGORIES, groupByCategory, canApprove } from '../logic/purchases.js';

let buyTab = 'planned'; // 'planned' 구매예정 | 'pending' 승인 대기

const nameOf = (id) => (memberById(id) ? esc(memberById(id).name) : '');
const dotOf = (id) => (memberById(id) ? `<i class="dot" style="--mc:${esc(memberById(id).color)}"></i>` : '');

function plannedRow(p, bought = false) {
  const meta = [p.requested_by ? `요청 ${dotOf(p.requested_by)}${nameOf(p.requested_by)}` : '', p.decided_by && p.decided_by !== p.requested_by ? `승인 ${nameOf(p.decided_by)}` : '']
    .filter(Boolean)
    .join(' · ');
  return `<li class="buy-item${bought ? ' bought' : ''}">
    <button class="check" data-act="buy-bought" data-id="${p.id}" data-bought="${bought ? '0' : '1'}" aria-pressed="${bought}" aria-label="${esc(p.title)} ${bought ? '구매 완료 취소' : '구매 완료'}"
      style="--mc:#b9bec8;--dc:#8fcfb0"><span></span></button>
    <div class="buy-body"><div class="buy-title">${esc(p.title)}</div>${p.memo ? `<div class="buy-sub">${esc(p.memo)}</div>` : ''}<div class="buy-sub">${meta}</div></div>
    ${bought ? `<button class="chip sm" data-act="buy-delete" data-id="${p.id}">지우기</button>` : ''}
  </li>`;
}

function pendingRow(p, me, approver) {
  const mine = !!me && p.requested_by === me;
  const rejected = p.status === 'rejected';
  const acts = [];
  if (!rejected) {
    if (approver) acts.push(`<button class="chip sm buy-ok" data-act="buy-approve" data-id="${p.id}">승인</button><button class="chip sm" data-act="buy-reject" data-id="${p.id}">반려</button>`);
    if (mine) acts.push(`<button class="chip sm" data-act="buy-cancel" data-id="${p.id}">요청 취소</button>`);
  } else if (mine || approver) {
    acts.push(`<button class="chip sm" data-act="buy-delete" data-id="${p.id}">지우기</button>`);
  }
  const meta = [`요청 ${dotOf(p.requested_by)}${nameOf(p.requested_by) || '알 수 없음'}`, rejected && p.decided_by ? `반려 ${nameOf(p.decided_by)}` : ''].filter(Boolean).join(' · ');
  return `<li class="buy-item">
    <div class="buy-body"><div class="buy-title">${esc(p.title)}${rejected ? '<em class="buy-tag">반려</em>' : ''}</div>${p.memo ? `<div class="buy-sub">${esc(p.memo)}</div>` : ''}<div class="buy-sub">${meta}</div></div>
    <div class="buy-acts">${acts.join('')}</div>
  </li>`;
}

export function renderBuyBox() {
  if (!state.purchasesReady) {
    return `<section class="buy-box"><h2>🛒 구매 목록</h2>
      <p class="empty">구매 목록을 쓰려면 Supabase 에서 <b>supabase/purchases.sql</b> 을 한 번 실행해주세요.</p></section>`;
  }
  const me = deviceMemberId();
  const approver = canApprove(state.members, me);
  const planned = state.purchases.filter((p) => p.status === 'approved');
  const bought = state.purchases.filter((p) => p.status === 'bought');
  const pending = state.purchases.filter((p) => p.status === 'pending' || p.status === 'rejected');
  const noApprover = !state.members.some((m) => m.can_approve);

  const list = buyTab === 'planned' ? planned : pending;
  const groups = groupByCategory(list)
    .map(
      (g) => `<div class="buy-cat">
        <h3 class="buy-cat-head"><span>${g.icon} ${g.label}</span><small>${g.items.length}</small></h3>
        ${g.items.length ? `<ul class="buy-list">${g.items.map((p) => (buyTab === 'planned' ? plannedRow(p) : pendingRow(p, me, approver))).join('')}</ul>` : '<p class="buy-none">없음</p>'}
      </div>`
    )
    .join('');

  return `<section class="buy-box">
    <div class="buy-head"><h2>🛒 구매 목록</h2><button class="chip sm buy-add" data-act="buy-add">+ 구매 요청</button></div>
    <div class="seg wide" role="tablist">
      <button class="${buyTab === 'planned' ? 'on' : ''}" data-act="buy-tab" data-v="planned">구매 예정 ${planned.length}</button>
      <button class="${buyTab === 'pending' ? 'on' : ''}" data-act="buy-tab" data-v="pending">승인 대기 ${state.purchases.filter((p) => p.status === 'pending').length}</button>
    </div>
    ${noApprover && buyTab === 'pending' ? '<p class="note">승인 권한이 있는 사람이 아직 없어요. 설정 → 가족 구성원 → 권한에서 <b>구매 요청 승인</b>을 체크해주세요. (지금은 누구나 승인할 수 있어요)</p>' : ''}
    ${groups}
    ${buyTab === 'planned' && bought.length ? `<details class="buy-done"><summary>구매 완료 ${bought.length}개</summary><ul class="buy-list">${bought.map((p) => plannedRow(p, true)).join('')}</ul></details>` : ''}
  </section>`;
}

/* ---------- 구매 요청 폼 ---------- */
export function openBuyForm() {
  if (!state.members.length) return toast('먼저 가족 구성원을 등록해주세요');
  const me = deviceMemberId() || '';
  openSheet({
    title: '구매 요청',
    body: `<form data-form="buy" autocomplete="off">
      <input class="big-input" name="title" required maxlength="60" placeholder="무엇을 사야 하나요? (예: 휴지)">
      <div class="field"><span class="label">종류</span><div class="chips">${CATEGORIES.map(
        (c, i) => `<label class="chip pick"><input type="radio" name="category" value="${c.id}" ${i === 0 ? 'checked' : ''}><span>${c.icon} ${c.label}</span></label>`
      ).join('')}</div></div>
      <div class="field"><span class="label">수량 · 메모 (선택)</span><input name="memo" maxlength="80" placeholder="예: 2팩"></div>
      <div class="field"><span class="label">요청자</span><div class="chips">${state.members
        .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="radio" name="by" value="${m.id}" ${me === m.id ? 'checked' : ''} required><span><i class="dot"></i>${esc(m.name)}</span></label>`)
        .join('')}</div></div>
      <p class="note">구매 요청 승인 권한이 있는 사람이 승인하면 구매예정으로 옮겨져요. 권한이 있는 사람이 요청하면 바로 구매예정에 올라가요.</p>
      <div class="form-actions"><button type="submit" class="btn primary">요청하기</button></div>
    </form>`,
    onMount: (el) => setTimeout(() => el.querySelector('[name=title]').focus(), 60),
  });
}

const guardApprove = () => {
  if (canApprove(state.members, deviceMemberId())) return true;
  toast('승인 권한이 없어요. (구성원 설정의 "구매 요청 승인")');
  return false;
};
const hint = (e) => (String(e && e.message).includes('purchases') ? '먼저 supabase/purchases.sql 을 실행해주세요' : errMsg(e));

export const actions = {
  'buy-tab': (el) => {
    buyTab = el.dataset.v;
    A.refreshView();
  },
  'buy-add': () => openBuyForm(),
  'buy-approve': async (el) => {
    if (!guardApprove()) return;
    try {
      await A.decidePurchase(el.dataset.id, 'approved', deviceMemberId());
      toast('승인했어요. 요청한 사람에게 알림이 가요');
    } catch (e) {
      toast(hint(e));
    }
  },
  'buy-reject': async (el) => {
    if (!guardApprove()) return;
    try {
      await A.decidePurchase(el.dataset.id, 'rejected', deviceMemberId());
      toast('반려했어요. 요청한 사람에게 알림이 가요');
    } catch (e) {
      toast(hint(e));
    }
  },
  'buy-cancel': async (el) => {
    const ok = await confirmDialog({ title: '구매 요청을 취소할까요?', choices: [{ label: '아니요', value: false }, { label: '요청 취소', value: true, kind: 'danger' }] });
    if (!ok) return;
    try {
      await A.removePurchase(el.dataset.id);
      toast('요청을 취소했어요');
    } catch (e) {
      toast(hint(e));
    }
  },
  'buy-bought': async (el) => {
    try {
      const r = await A.setPurchaseBought(el.dataset.id, el.dataset.bought === '1');
      if (r && r.added) toast(`먹거리 탭 ${r.kind === 'snack' ? '간식' : '식재료'}에 추가했어요. (먹거리에서 수정하면 보관·유통기한을 정할 수 있어요)`);
      else if (r && r.removed) toast('먹거리에서도 뺐어요');
      else if (r && r.needSql) toast('먹거리에 넣으려면 먼저 supabase/food-ingredients.sql 을 실행해주세요');
    } catch (e) {
      toast(hint(e));
    }
  },
  'buy-delete': async (el) => {
    try {
      await A.removePurchase(el.dataset.id);
    } catch (e) {
      toast(hint(e));
    }
  },
};

export const forms = {
  buy: async (f) => {
    const fd = new FormData(f);
    const title = (fd.get('title') || '').trim();
    const by = fd.get('by');
    if (!title) return toast('무엇을 사야 하는지 적어주세요');
    if (!by) return toast('요청자를 골라주세요');
    const autoApprove = !!memberById(by)?.can_approve; // 승인 권한이 있는 사람의 요청은 바로 구매예정
    const p = { title, category: fd.get('category'), memo: (fd.get('memo') || '').trim() || null, requested_by: by };
    if (autoApprove) Object.assign(p, { status: 'approved', decided_by: by, decided_at: new Date().toISOString() });
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await A.requestPurchase(p);
      buyTab = autoApprove ? 'planned' : 'pending';
      closeSheet();
      A.refreshView();
      toast(autoApprove ? '구매예정에 올렸어요' : '요청했어요. 승인되면 구매예정으로 옮겨져요');
    } catch (e) {
      btn.disabled = false;
      toast(hint(e));
    }
  },
};
