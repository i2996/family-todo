// 먹거리: [반찬] 주간 식단 + 재고 / [간식] 보관 장소별 재고
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg } from './components.js';
import * as F from '../logic/food.js';
import { todayISO, addDays, shortDate, dow, KO_DOW, diffDays } from '../logic/dates.js';

const STORAGE = { room: '실온', fridge: '냉장', frozen: '냉동' };
const STORAGE_ICON = { room: '🏠', fridge: '❄️', frozen: '🧊' };
const UNIT = { banchan: '끼분', snack: '개' };

const subTab = () => (prefs.getFoodTab() === 'snack' ? 'snack' : 'banchan');
const itemsOf = (kind) => state.foodItems.filter((i) => i.kind === kind);
const badge = (s) => `<span class="badge ${s}">${STORAGE[s] || s}</span>`;

function itemRow(it, today) {
  const st = F.expiryStatus(it, today);
  return `<li class="food-item">
    <div class="fi-main">
      <div class="fi-name">${esc(it.name)} ${badge(it.storage)}</div>
      <div class="fi-meta">${it.kind === 'banchan' ? '배달일' : '구입일'} ${shortDate(it.delivered_date)}</div>
    </div>
    <div class="fi-serv">남은 ${it.servings}${UNIT[it.kind]}</div>
    <span class="exp ${st.cls}">${st.text}</span>
    <div class="fi-actions">
      <button class="chip sm" data-act="food-eat" data-id="${it.id}">먹음</button>
      <button class="chip sm" data-act="food-edit" data-id="${it.id}">수정</button>
    </div>
  </li>`;
}

/* ---------- 반찬 ---------- */
function banchanView(today) {
  const items = itemsOf('banchan');
  if (!items.length) {
    return `<p class="empty big">아직 등록된 반찬이 없어요.<br>배달 온 반찬을 등록하면 이번 주 식단을 짜드려요 🍚</p>`;
  }
  const plan = F.resolvePlan(items, state.foodPlan, today);
  const hasPlan = plan.some((d) => d.dishes.length);
  const missed = F.missedItems(items, plan, today);

  const week = plan
    .map((d, i) => {
      const assigned = new Set(d.dishes.map((x) => x.id));
      const addable = items.filter((it) => !assigned.has(it.id));
      return `<div class="food-day${i === 0 ? ' today' : ''}">
        <div class="food-day-label"><b>${i === 0 ? '오늘' : shortDate(d.date)}</b><span>${KO_DOW[dow(d.date)]}</span></div>
        <div class="food-day-body">
          ${
            d.dishes.length
              ? `<div class="dishes">${d.dishes
                  .map(
                    (x) => `<span class="dish${x.urgent ? ' urgent' : ''}">${x.frozen ? '🧊 ' : ''}${esc(x.name)}
                      <button data-act="plan-remove" data-date="${d.date}" data-item="${x.id}" aria-label="${esc(x.name)} 빼기">×</button></span>`
                  )
                  .join('')}</div>`
              : '<span class="food-empty">—</span>'
          }
          ${d.thaw.length ? `<div class="thaw">❄️→냉장 해동: ${d.thaw.map(esc).join(', ')}</div>` : ''}
          ${
            addable.length
              ? `<select class="add-select" data-change="plan-add" data-date="${d.date}" aria-label="${shortDate(d.date)} 반찬 추가">
                  <option value="">+ 반찬 추가</option>${addable.map((it) => `<option value="${it.id}">${esc(it.name)}</option>`).join('')}</select>`
              : ''
          }
        </div>
      </div>`;
    })
    .join('');

  const sorted = F.sortByExpiry(items, today);
  return `
  <div class="sec-head"><h2>이번 주 식단</h2><button class="chip sm" data-act="food-regen">${hasPlan ? '자동으로 다시 짜기' : '자동으로 짜기'}</button></div>
  ${hasPlan ? '' : '<p class="food-note">아직 이번 주 식단이 없어요. 위 버튼을 누르면 유통기한이 급한 반찬부터 알아서 나눠줘요.</p>'}
  <div class="food-week">${week}</div>
  ${missed.length ? `<p class="food-warn">참고: ${missed.map((m) => esc(m.name)).join(', ')}은(는) 이번 주 안에 유통기한이 끝나는데 아직 계획에 없어요.</p>` : ''}

  <div class="sec-head" style="margin-top:26px"><h2>냉장고 · 냉동실 반찬</h2><span class="muted">${items.length}개</span></div>
  <ul class="food-list">${sorted.map((it) => itemRow(it, today)).join('')}</ul>`;
}

/* ---------- 간식 ---------- */
function snackView(today) {
  const items = itemsOf('snack');
  if (!items.length) return `<p class="empty big">아직 등록된 간식이 없어요.<br>아래 버튼으로 간식을 등록해보세요 🍪</p>`;

  const soon = items.filter((it) => {
    const d = F.daysLeft(it, today);
    return d !== null && d <= 2;
  });
  const groups = ['room', 'fridge', 'frozen']
    .map((s) => ({ s, list: F.sortByExpiry(items.filter((it) => it.storage === s), today) }))
    .filter((g) => g.list.length);

  return `
  ${soon.length ? `<p class="food-warn">곧 기한이 끝나요: ${soon.map((i) => esc(i.name)).join(', ')}</p>` : ''}
  ${groups
    .map(
      (g) => `<section class="day-group">
        <h3 class="day-head">${STORAGE_ICON[g.s]} ${STORAGE[g.s]} <small>${g.list.length}개</small></h3>
        <ul class="food-list">${g.list.map((it) => itemRow(it, today)).join('')}</ul></section>`
    )
    .join('')}`;
}

export function renderFood() {
  if (!state.foodReady) {
    return `<section class="page-head"><h1>먹거리</h1></section>
      <p class="empty big">먹거리 기능을 쓰려면 Supabase 에서<br><b>supabase/food.sql</b> 을 한 번 실행해주세요.<br><small>(SQL Editor 에 붙여넣고 Run)</small></p>`;
  }
  const sub = subTab();
  const today = todayISO();
  return `
  <section class="page-head"><h1>먹거리</h1></section>
  <div class="seg wide" role="tablist" aria-label="먹거리 종류">
    <button class="${sub === 'banchan' ? 'on' : ''}" data-act="food-sub" data-v="banchan">🍚 반찬</button>
    <button class="${sub === 'snack' ? 'on' : ''}" data-act="food-sub" data-v="snack">🍪 간식</button>
  </div>
  ${sub === 'banchan' ? banchanView(today) : snackView(today)}
  <button class="fab" data-act="food-add">+ ${sub === 'banchan' ? '반찬' : '간식'} 등록</button>`;
}

/* ---------- 등록/수정 폼 ---------- */
export function openFoodForm({ kind, item = null }) {
  const it = item;
  const isB = kind === 'banchan';
  const storages = isB ? ['fridge', 'frozen'] : ['room', 'fridge', 'frozen'];
  const cur = it?.storage || (isB ? 'fridge' : 'room');
  const delivered = it?.delivered_date || todayISO();
  const expires = it ? F.expiryOf(it) : null;

  const body = `<form data-form="food" data-kind="${kind}" data-id="${it ? it.id : ''}" autocomplete="off">
    <input class="big-input" name="name" required maxlength="40" placeholder="${isB ? '반찬 이름 (예: 멸치볶음)' : '간식 이름 (예: 요거트)'}" value="${esc(it?.name)}">
    <div class="grid2">
      <div class="field"><span class="label">${isB ? '남은 끼분' : '개수'}</span>
        <input type="number" name="servings" min="1" max="99" required value="${it?.servings ?? 1}"></div>
      ${
        isB
          ? `<div class="field"><span class="label">보관 가능일</span><input type="number" name="shelf" min="1" max="365" required value="${it?.shelf_life_days ?? 7}"></div>`
          : `<div class="field"><span class="label">유통기한 (모르면 비움)</span><input type="date" name="expires" value="${expires || ''}"></div>`
      }
    </div>
    <div class="field"><span class="label">보관</span>
      <div class="chips">${storages
        .map((s) => `<label class="chip pick"><input type="radio" name="storage" value="${s}" ${s === cur ? 'checked' : ''}><span>${STORAGE_ICON[s]} ${STORAGE[s]}</span></label>`)
        .join('')}</div></div>
    ${
      isB
        ? `<div class="field"><span class="label">배달일</span><input type="date" name="delivered_date" required value="${delivered}"></div>`
        : `<input type="hidden" name="delivered_date" value="${delivered}">`
    }
    <div class="form-actions">
      ${it ? `<button type="button" class="btn danger" data-act="food-delete" data-id="${it.id}">삭제</button>` : ''}
      <button type="submit" class="btn primary">${it ? '저장' : '등록'}</button>
    </div></form>`;

  openSheet({
    title: `${isB ? '반찬' : '간식'} ${it ? '수정' : '등록'}`,
    body,
    onMount: (el) => !it && setTimeout(() => el.querySelector('[name=name]').focus(), 60),
  });
}

export const actions = {
  'food-sub': (el) => {
    prefs.setFoodTab(el.dataset.v);
    set();
  },
  'food-add': () => openFoodForm({ kind: subTab() }),
  'food-edit': (el) => {
    const item = state.foodItems.find((i) => i.id === el.dataset.id);
    if (item) openFoodForm({ kind: item.kind, item });
  },
  'food-delete': async (el) => {
    const item = state.foodItems.find((i) => i.id === el.dataset.id);
    const ok = await confirmDialog({
      title: `${item ? item.name : '이 항목'}을(를) 삭제할까요?`,
      choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      await A.removeFoodItem(el.dataset.id);
      closeSheet();
      toast('삭제했어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'food-eat': async (el) => {
    try {
      if ((await A.eatFoodItem(el.dataset.id)) === 'removed') toast('다 먹었어요! 목록에서 지웠어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'plan-remove': async (el) => {
    try {
      await A.removePlanEntry(el.dataset.item, el.dataset.date);
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'food-regen': async () => {
    const today = todayISO();
    const to = addDays(today, 6);
    const items = itemsOf('banchan').filter((i) => i.servings > 0);
    if (!items.length) return toast('먼저 반찬을 등록해주세요');
    if (state.foodPlan.some((r) => r.plan_date >= today && r.plan_date <= to)) {
      const ok = await confirmDialog({
        title: '식단을 다시 짤까요?',
        message: '지금 식단(직접 바꾼 것 포함)이 새로 짠 식단으로 바뀌어요.',
        choices: [{ label: '취소', value: false }, { label: '다시 짜기', value: true }],
      });
      if (!ok) return;
    }
    try {
      await A.regeneratePlan(today, to, F.autoAssign(items, today));
      toast('이번 주 식단을 짰어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
};

export const changes = {
  'plan-add': async (el) => {
    if (!el.value) return;
    try {
      await A.addPlanEntry(el.dataset.date, el.value);
    } catch (e) {
      toast(errMsg(e));
    }
  },
};

export const forms = {
  food: async (f) => {
    const fd = new FormData(f);
    const kind = f.dataset.kind;
    const isB = kind === 'banchan';
    const name = (fd.get('name') || '').trim();
    const servings = parseInt(fd.get('servings'), 10);
    const delivered = fd.get('delivered_date') || todayISO();
    if (!name) return toast('이름을 입력해주세요');
    if (!(servings >= 1)) return toast('수량은 1 이상이어야 해요');

    let shelf = null;
    if (isB) {
      shelf = parseInt(fd.get('shelf'), 10);
      if (!(shelf >= 1)) return toast('보관 가능일을 1일 이상으로 입력해주세요');
    } else if (fd.get('expires')) {
      shelf = diffDays(delivered, fd.get('expires'));
      if (shelf < 0) return toast('유통기한이 구입일보다 빠를 수 없어요');
    }
    const p = { kind, name, servings, storage: fd.get('storage'), delivered_date: delivered, shelf_life_days: shelf };

    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (f.dataset.id) await A.saveFoodItem(f.dataset.id, p);
      else await A.addFoodItem(p);
      closeSheet();
      toast(f.dataset.id ? '저장했어요' : '등록했어요');
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  },
};
