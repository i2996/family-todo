// 가계부 탭: 월별 수입·지출 + 달력(전체/수입/지출) + 분류별 합계 + 날짜별 내역.
// 구성원마다 PIN 을 만들고, 기기에서 한 번 열면 그 사람에게 보이는 내역이 계속 보인다 (서버가 걸러줌).
import { state, set } from '../state.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, memberById, deviceMemberId } from './components.js';
import { EXPENSE_CATS, INCOME_CATS, catIcon, won, compactWon, parseAmount, inMonth, summarize, byCategory, byMode, dailyTotals, byDate, visibilityOf } from '../logic/ledger.js';
import { todayISO, parts, pad, labelDate, longDate, addDays, startOfWeekSun, eachDay, KO_DOW } from '../logic/dates.js';

const view = { y: null, m: null, mode: 'all', selected: null }; // mode: 'all' | 'income' | 'expense', selected: 고른 날짜(없으면 달 전체)
const MODES = [
  { id: 'all', label: '전체' },
  { id: 'income', label: '수입' },
  { id: 'expense', label: '지출' },
];

const PIN_MSG = {
  wrong: 'PIN 이 틀렸어요',
  locked: '여러 번 틀려서 5분 동안 잠겼어요. 잠시 후 다시 해주세요',
  no_pin: '아직 PIN 이 없어요. 먼저 만들어주세요',
  bad_pin: 'PIN 은 숫자 4자리로 해주세요',
};

const dotName = (id) => {
  const m = memberById(id);
  return m ? `<i class="dot" style="--mc:${esc(m.color)}"></i>${esc(m.name)}` : '';
};

function visLabel(e) {
  const v = visibilityOf(e);
  if (v === 'public') return '🏠 온 가족';
  if (v === 'private') return '🔒 나만';
  const names = e.shared_with.map(memberById).filter(Boolean).map((m) => m.name);
  return `👥 ${esc(names.join(', ') || '공유')}`;
}

function entryRow(e, me) {
  const mine = !!me && e.created_by === me;
  const sign = e.kind === 'income' ? '+' : '-';
  const inner = `<span class="lg-ico">${catIcon(e.kind, e.category)}</span>
    <span class="lg-body">
      <b>${esc(e.memo || e.category)}</b>
      <small>${esc(e.category)}${e.created_by && !mine ? ` · ${dotName(e.created_by)}` : ''} · ${visLabel(e)}</small>
    </span>
    <span class="lg-amt ${e.kind}">${sign}${won(e.amount)}</span>`;
  return `<li class="lg-item">${
    mine ? `<button class="lg-main" data-act="ledger-edit" data-id="${e.id}">${inner}</button>` : `<div class="lg-main">${inner}</div>`
  }</li>`;
}

function lockBar(me) {
  if (me) {
    return `<div class="lg-lock on">
      <span>🔓 ${dotName(me)}(으)로 보는 중</span>
      <span class="lg-lock-acts"><button class="chip sm" data-act="ledger-pin-change">PIN 바꾸기</button><button class="chip sm" data-act="ledger-lock">잠그기</button></span>
    </div>`;
  }
  return `<div class="lg-lock">
    <span>🔒 내 가계부를 보려면 PIN 을 입력하세요</span>
    <button class="chip sm lg-open" data-act="ledger-unlock">열기</button>
  </div>`;
}

export function renderLedger() {
  if (!state.ledgerReady) {
    return `<section class="page-head"><h1>가계부</h1></section>
      <p class="empty big">가계부를 쓰려면 Supabase 에서<br><b>supabase/ledger.sql</b> 을 한 번 실행해주세요.<br><small>(SQL Editor 에 붙여넣고 Run)</small></p>`;
  }
  if (view.y == null) [view.y, view.m] = parts(todayISO());
  const me = A.ledgerMe();
  const ym = `${view.y}-${pad(view.m)}`;
  const month = inMonth(state.ledger, ym);
  const sum = summarize(month);
  const catKind = view.mode === 'income' ? 'income' : 'expense';
  const cats = byCategory(month, catKind);
  const max = cats[0]?.amount || 1;
  const today = todayISO();

  const catHtml = cats.length
    ? `<ul class="lg-cats">${cats
        .map(
          (c) => `<li><span class="lg-cat-name">${catIcon(catKind, c.category)} ${esc(c.category)}</span>
          <span class="lg-bar"><i style="width:${Math.max(4, Math.round((c.amount / max) * 100))}%"></i></span>
          <span class="lg-cat-amt">${won(c.amount)}</span></li>`
        )
        .join('')}</ul>`
    : '';

  // 달력: 칸마다 그날 수입(+)/지출(-) 합계
  const gridStart = startOfWeekSun(`${ym}-01`);
  const totals = dailyTotals(inMonth(state.ledger, ym));
  const cells = eachDay(gridStart, addDays(gridStart, 41))
    .map((d) => {
      const other = d.slice(0, 7) !== ym;
      const t = !other && totals.get(d);
      const inc = t && view.mode !== 'expense' && t.income ? `<span class="lg-c income">+${compactWon(t.income)}</span>` : '';
      const exp = t && view.mode !== 'income' && t.expense ? `<span class="lg-c expense">-${compactWon(t.expense)}</span>` : '';
      return `<button class="day${other ? ' other' : ''}${d === today ? ' today' : ''}${d === view.selected ? ' sel' : ''}"
        data-act="ledger-pick" data-date="${d}" aria-label="${longDate(d)}${t ? ` 수입 ${won(t.income)} 지출 ${won(t.expense)}` : ''}">
        <span class="n">${Number(d.slice(8))}</span>${inc}${exp}
      </button>`;
    })
    .join('');

  // 목록: 날짜를 골랐으면 그날만, 아니면 달 전체 (보기 방식으로 거름)
  const shown = byMode(view.selected ? month.filter((e) => e.entry_date === view.selected) : month, view.mode);
  const modeName = view.mode === 'all' ? '' : ` ${MODES.find((x) => x.id === view.mode).label}`;
  const groups = byDate(shown)
    .map(
      (g) => `<div class="lg-day"><h3 class="lg-day-head"><span>${labelDate(g.date, today)}${labelDate(g.date, today).includes('월') ? '' : ` · ${Number(g.date.slice(8))}일`}</span></h3>
      <ul class="lg-list">${g.items.map((e) => entryRow(e, me)).join('')}</ul></div>`
    )
    .join('');

  return `
  <section class="page-head"><h1>가계부</h1></section>
  ${lockBar(me)}
  <div class="cal-head">
    <button class="icon-btn" data-act="ledger-prev" aria-label="이전 달">‹</button>
    <strong>${view.y}년 ${view.m}월</strong>
    <button class="icon-btn" data-act="ledger-next" aria-label="다음 달">›</button>
    <button class="chip sm" data-act="ledger-this">이번 달</button>
  </div>
  <div class="lg-sum">
    <div><small>수입</small><b class="income">${won(sum.income)}</b></div>
    <div><small>지출</small><b class="expense">${won(sum.expense)}</b></div>
    <div><small>남은 돈</small><b>${sum.balance < 0 ? '-' : ''}${won(Math.abs(sum.balance))}</b></div>
  </div>
  <div class="seg wide lg-mode" role="tablist">${MODES.map(
    (x) => `<button class="${view.mode === x.id ? 'on' : ''}" data-act="ledger-mode" data-v="${x.id}" role="tab" aria-selected="${view.mode === x.id}">${x.label}</button>`
  ).join('')}</div>
  <div class="cal-grid lg-cal">
    ${KO_DOW.map((d, i) => `<span class="dow${i === 0 ? ' sun' : ''}">${d}</span>`).join('')}${cells}
  </div>
  ${catHtml}
  <div class="sec-head" style="margin-top:20px"><h2>${view.selected ? `${labelDate(view.selected, today)}${labelDate(view.selected, today).includes('월') ? '' : ` (${Number(view.selected.slice(5, 7))}/${Number(view.selected.slice(8))})`}` : '이 달'}${modeName} 내역</h2>
    ${view.selected ? '<button class="chip sm" data-act="ledger-pick-clear">달 전체 보기</button>' : `<span class="muted">${shown.length}개</span>`}</div>
  ${groups || `<p class="empty">${!me && !state.ledger.length ? '보이는 내역이 없어요. PIN 으로 열면 내 가계부가 보여요' : view.selected ? `이 날은${modeName} 내역이 없어요` : `이 달에는${modeName} 내역이 없어요`}</p>`}
  <p class="note lg-note">내 내역만 고칠 수 있어요. 보는 사람을 '나만'으로 한 내역은 다른 가족 휴대폰에는 보이지 않아요.</p>
  <button class="fab" data-act="ledger-add" aria-label="내역 추가">+</button>`;
}

/* ---------- PIN 열기 / 만들기 ---------- */
function openUnlock({ then = null } = {}) {
  if (!state.members.length) return toast('먼저 가족 구성원을 등록해주세요');
  const pre = deviceMemberId() || '';
  openSheet({
    title: '가계부 열기',
    body: `<form data-form="ledger-unlock" autocomplete="off" data-then="${then || ''}">
      <div class="field" style="margin-top:0"><span class="label">누구예요?</span>
        <div class="chips">${state.members
          .map(
            (m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="radio" name="who" value="${m.id}" data-change="ledger-who" ${pre === m.id ? 'checked' : ''} required><span><i class="dot"></i>${esc(m.name)}</span></label>`
          )
          .join('')}</div></div>
      <div class="field"><span class="label pin-label">PIN (숫자 4자리)</span>
        <input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required class="pin-input" autocomplete="off"></div>
      <div class="field pin-confirm" hidden><span class="label">PIN 한 번 더</span>
        <input type="password" name="pin2" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" class="pin-input" autocomplete="off"></div>
      <p class="note pin-hint">한 번 열면 이 휴대폰에서는 계속 열려 있어요. (잠그기를 누르기 전까지)</p>
      <div class="form-actions"><button type="submit" class="btn primary">열기</button></div>
    </form>`,
    onMount: (el) => {
      syncWho(el.querySelector('form'));
      setTimeout(() => el.querySelector(pre ? '[name=pin]' : '[name=who]')?.focus(), 60);
    },
  });
}

/** 고른 사람이 PIN 이 없으면 '만들기' 모드로 */
function syncWho(f) {
  const who = f.elements.who.value;
  const create = !!who && !A.hasPin(who);
  f.querySelector('.pin-confirm').hidden = !create;
  f.elements.pin2.required = create;
  f.querySelector('.pin-label').textContent = create ? '새 PIN 만들기 (숫자 4자리)' : 'PIN (숫자 4자리)';
  f.querySelector('.pin-hint').textContent = create
    ? '처음이에요! 다른 가족이 모르는 숫자 4자리로 만들어주세요. 한 번 열면 이 휴대폰에서는 계속 열려 있어요.'
    : '한 번 열면 이 휴대폰에서는 계속 열려 있어요. (잠그기를 누르기 전까지)';
  f.querySelector('[type=submit]').textContent = create ? 'PIN 만들고 열기' : '열기';
}

function openPinChange(me) {
  openSheet({
    title: 'PIN 바꾸기',
    body: `<form data-form="ledger-pin" autocomplete="off">
      <p class="note" style="margin-top:0">${dotName(me)}의 PIN 을 바꿔요. 바꾸면 다른 휴대폰에서 열려 있던 내 가계부는 잠겨요.</p>
      <div class="field"><span class="label">지금 PIN</span><input type="password" name="old" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required class="pin-input"></div>
      <div class="field"><span class="label">새 PIN</span><input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required class="pin-input"></div>
      <div class="field"><span class="label">새 PIN 한 번 더</span><input type="password" name="pin2" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required class="pin-input"></div>
      <div class="form-actions"><button type="submit" class="btn primary">바꾸기</button></div>
    </form>`,
    onMount: (el) => setTimeout(() => el.querySelector('[name=old]').focus(), 60),
  });
}

/* ---------- 내역 추가/수정 폼 ---------- */
function openEntryForm(entry = null) {
  const me = A.ledgerMe();
  if (!me) return openUnlock({ then: 'add' });
  const e = entry;
  const kind = e?.kind || 'expense';
  const vis = e ? visibilityOf(e) : 'private';
  const shared = e?.shared_with || [];
  const catChips = (list, k) =>
    `<div class="chips cat-${k}" ${kind === k ? '' : 'hidden'}>${list
      .map(
        (c, i) => `<label class="chip pick"><input type="radio" name="cat_${k}" value="${c.id}" ${(e && e.kind === k ? e.category === c.id : i === 0) ? 'checked' : ''}><span>${c.icon} ${esc(c.id)}</span></label>`
      )
      .join('')}</div>`;
  const others = state.members.filter((m) => m.id !== me);
  openSheet({
    title: e ? '내역 수정' : '내역 추가',
    body: `<form data-form="ledger" data-id="${e ? e.id : ''}" autocomplete="off">
      <div class="seg wide lg-kind">
        <label><input type="radio" name="kind" value="expense" data-change="ledger-kind" ${kind === 'expense' ? 'checked' : ''}><span>지출</span></label>
        <label><input type="radio" name="kind" value="income" data-change="ledger-kind" ${kind === 'income' ? 'checked' : ''}><span>수입</span></label>
      </div>
      <div class="lg-amt-field"><input class="big-input" name="amount" inputmode="numeric" required maxlength="16" placeholder="금액" value="${e ? Number(e.amount).toLocaleString('ko-KR') : ''}" data-change="ledger-amount"><span>원</span></div>
      <div class="field"><span class="label">분류</span>${catChips(EXPENSE_CATS, 'expense')}${catChips(INCOME_CATS, 'income')}</div>
      <div class="grid2">
        <div class="field"><span class="label">날짜</span><input type="date" name="entry_date" required value="${e?.entry_date || view.selected || todayISO()}"></div>
        <div class="field"><span class="label">내용 (선택)</span><input name="memo" maxlength="200" placeholder="예: 마트 장보기" value="${esc(e?.memo)}"></div>
      </div>
      <div class="field"><span class="label">보는 사람</span>
        <div class="chips">
          <label class="chip pick"><input type="radio" name="vis" value="private" data-change="ledger-vis" ${vis === 'private' ? 'checked' : ''}><span>🔒 나만</span></label>
          ${others.length ? `<label class="chip pick"><input type="radio" name="vis" value="some" data-change="ledger-vis" ${vis === 'some' ? 'checked' : ''}><span>👥 선택</span></label>` : ''}
          <label class="chip pick"><input type="radio" name="vis" value="public" data-change="ledger-vis" ${vis === 'public' ? 'checked' : ''}><span>🏠 온 가족</span></label>
        </div>
        <div class="chips lg-share" ${vis === 'some' ? '' : 'hidden'} style="margin-top:8px">${others
          .map((m) => `<label class="chip pick" style="--mc:${esc(m.color)}"><input type="checkbox" name="share" value="${m.id}" ${shared.includes(m.id) ? 'checked' : ''}><span><i class="dot"></i>${esc(m.name)}</span></label>`)
          .join('')}</div>
      </div>
      <div class="form-actions">
        ${e ? `<button type="button" class="btn danger" data-act="ledger-delete" data-id="${e.id}">삭제</button>` : ''}
        <button type="submit" class="btn primary">${e ? '저장' : '추가'}</button>
      </div></form>`,
    onMount: (el) => !e && setTimeout(() => el.querySelector('[name=amount]').focus(), 60),
  });
}

/** 쓰기가 거절되면(다른 기기에서 PIN 을 바꿔 잠긴 경우 등) 다시 열도록 안내 */
async function writeError(err) {
  if (err && (err.code === '42501' || String(err.message).includes('row-level security'))) {
    await A.reloadLedger().catch(() => {});
    return toast('이 휴대폰의 가계부가 잠겼어요. PIN 으로 다시 열어주세요');
  }
  toast(errMsg(err));
}

const shiftMonth = (n) => {
  const d = new Date(view.y, view.m - 1 + n, 1);
  view.y = d.getFullYear();
  view.m = d.getMonth() + 1;
  view.selected = null;
  set();
};

export const actions = {
  'ledger-prev': () => shiftMonth(-1),
  'ledger-next': () => shiftMonth(1),
  'ledger-this': () => {
    [view.y, view.m] = parts(todayISO());
    view.selected = null;
    set();
  },
  'ledger-mode': (el) => {
    view.mode = el.dataset.v;
    set();
  },
  'ledger-pick': (el) => {
    const d = el.dataset.date;
    if (view.selected === d) view.selected = null; // 같은 날을 다시 누르면 달 전체
    else {
      view.selected = d;
      const [y, m] = parts(d);
      view.y = y;
      view.m = m;
    }
    set();
  },
  'ledger-pick-clear': () => {
    view.selected = null;
    set();
  },
  'ledger-unlock': () => openUnlock(),
  'ledger-add': () => openEntryForm(),
  'ledger-edit': (el) => {
    const e = state.ledger.find((x) => x.id === el.dataset.id);
    if (e) openEntryForm(e);
  },
  'ledger-pin-change': () => {
    const me = A.ledgerMe();
    if (me) openPinChange(me);
  },
  'ledger-lock': async () => {
    try {
      await A.lockLedger();
      toast('잠갔어요. 다시 보려면 PIN 을 입력하세요');
    } catch (err) {
      toast(errMsg(err));
    }
  },
  'ledger-delete': async (el) => {
    const ok = await confirmDialog({ title: '이 내역을 삭제할까요?', choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }] });
    if (!ok) return;
    try {
      await A.removeLedger(el.dataset.id);
      closeSheet();
      toast('삭제했어요');
    } catch (err) {
      writeError(err);
    }
  },
};

export const changes = {
  'ledger-who': (el) => syncWho(el.closest('form')),
  'ledger-kind': (el) => {
    const f = el.closest('form');
    const k = f.elements.kind.value;
    f.querySelector('.cat-expense').hidden = k !== 'expense';
    f.querySelector('.cat-income').hidden = k !== 'income';
  },
  'ledger-vis': (el) => {
    const f = el.closest('form');
    f.querySelector('.lg-share').hidden = f.elements.vis.value !== 'some';
  },
  'ledger-amount': (el) => {
    const n = parseAmount(el.value);
    if (!Number.isNaN(n)) el.value = n.toLocaleString('ko-KR');
  },
};

const pinOk = (s) => /^\d{4}$/.test(s || '');

export const forms = {
  'ledger-unlock': async (f) => {
    const fd = new FormData(f);
    const who = fd.get('who');
    const pin = String(fd.get('pin') || '');
    if (!who) return toast('누구인지 골라주세요');
    if (!pinOk(pin)) return toast(PIN_MSG.bad_pin);
    const create = !A.hasPin(who);
    if (create && pin !== String(fd.get('pin2') || '')) return toast('두 PIN 이 서로 달라요');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = create ? await A.setLedgerPin(who, pin) : await A.unlockLedger(who, pin);
      if (r !== 'ok') {
        btn.disabled = false;
        f.elements.pin.value = '';
        if (r === 'wrong' || r === 'locked') {
          // 다른 기기에서 먼저 PIN 을 만든 경우 등: 상태를 새로 받아서 화면을 맞춤
          await A.reloadLedger().catch(() => {});
          syncWho(f);
        }
        return toast(PIN_MSG[r] || errMsg(r));
      }
      const then = f.dataset.then;
      closeSheet();
      toast(create ? 'PIN 을 만들었어요. 이제 이 휴대폰에서 내 가계부가 보여요' : '열었어요');
      if (then === 'add') setTimeout(() => openEntryForm(), 250);
    } catch (err) {
      btn.disabled = false;
      toast(errMsg(err));
    }
  },
  'ledger-pin': async (f) => {
    const fd = new FormData(f);
    const [old, pin, pin2] = ['old', 'pin', 'pin2'].map((k) => String(fd.get(k) || ''));
    if (!pinOk(old) || !pinOk(pin)) return toast(PIN_MSG.bad_pin);
    if (pin !== pin2) return toast('새 PIN 두 개가 서로 달라요');
    const me = A.ledgerMe();
    if (!me) return toast('먼저 가계부를 열어주세요');
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const r = await A.setLedgerPin(me, pin, old);
      if (r !== 'ok') {
        btn.disabled = false;
        return toast(r === 'wrong' ? '지금 PIN 이 틀렸어요' : PIN_MSG[r] || errMsg(r));
      }
      closeSheet();
      toast('PIN 을 바꿨어요');
    } catch (err) {
      btn.disabled = false;
      toast(errMsg(err));
    }
  },
  ledger: async (f) => {
    const me = A.ledgerMe();
    if (!me) {
      closeSheet();
      return openUnlock({ then: 'add' });
    }
    const fd = new FormData(f);
    const kind = fd.get('kind') === 'income' ? 'income' : 'expense';
    const amount = parseAmount(fd.get('amount'));
    if (Number.isNaN(amount) || amount <= 0) return toast('금액을 숫자로 입력해주세요');
    const vis = fd.get('vis') || 'private';
    const share = vis === 'some' ? fd.getAll('share').filter(Boolean) : [];
    if (vis === 'some' && !share.length) return toast('함께 볼 사람을 골라주세요');
    const p = {
      kind,
      amount,
      category: fd.get(`cat_${kind}`) || '기타',
      entry_date: fd.get('entry_date') || todayISO(),
      memo: (fd.get('memo') || '').trim() || null,
      is_public: vis === 'public',
      shared_with: share,
      created_by: me,
    };
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      if (f.dataset.id) await A.saveLedger(f.dataset.id, p);
      else await A.addLedger(p);
      [view.y, view.m] = parts(p.entry_date); // 방금 적은 달이 보이게
      if (view.selected && view.selected !== p.entry_date) view.selected = p.entry_date;
      closeSheet();
      set();
      toast(f.dataset.id ? '저장했어요' : '추가했어요');
    } catch (err) {
      btn.disabled = false;
      writeError(err);
    }
  },
};
