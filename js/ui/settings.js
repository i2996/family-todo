// 설정/관리: 구성원, 가족 공간, 이 기기 설정, 백업/복원 (우측 상단 ⋮ 메뉴)
import { state, set } from '../state.js';
import { prefs } from '../prefs.js';
import * as A from '../actions.js';
import { openSheet, closeSheet, confirmDialog } from './sheet.js';
import { esc, toast, errMsg, PALETTE, memberById } from './components.js';
import { todayISO } from '../logic/dates.js';
import { shareText } from '../logic/share.js';

export const inviteLink = () => `${location.origin}${location.pathname}?code=${state.space.code}`;

export function openMenu() {
  const item = (act, ico, title, sub) =>
    `<button class="menu-item" data-act="${act}"><span class="m-ico">${ico}</span><span><b>${title}</b><small>${sub}</small></span><span class="go">›</span></button>`;
  openSheet({
    title: '설정',
    body: `<div class="menu">
      ${item('menu-members', '👨‍👩‍👧‍👦', '가족 구성원', '이름과 색상 관리')}
      ${item('menu-device', '📱', '이 기기는 누구 거예요?', '열자마자 내 할 일이 보여요')}
      ${item('menu-space', '🔑', '가족 공간', '가족 코드 · 초대 링크 · 비밀번호')}
      ${item('menu-backup', '💾', '데이터 백업', 'JSON 파일로 내려받기')}
      ${item('menu-restore', '♻️', '데이터 복원', '백업 파일로 되돌리기')}
      <input type="file" id="restore-input" accept=".json,application/json" hidden data-change="restore-file">
    </div>`,
  });
}

/* ---------- 구성원 ---------- */
export function openMembers() {
  openSheet({
    title: '가족 구성원',
    back: openMenu,
    body: `<ul class="member-list">
      ${state.members
        .map(
          (m) => `<li><i class="dot lg" style="--mc:${esc(m.color)}"></i><b>${esc(m.name)}</b>
            <button class="chip sm" data-act="member-edit" data-id="${m.id}">수정</button></li>`
        )
        .join('') || '<li class="empty">아직 구성원이 없어요</li>'}
      </ul>
      <button class="btn primary wide" data-act="member-add">+ 구성원 추가</button>`,
  });
}

export function openMemberForm(member = null) {
  const m = member;
  const color = m?.color || PALETTE[state.members.length % PALETTE.length];
  openSheet({
    title: m ? '구성원 수정' : '구성원 추가',
    back: openMembers,
    body: `<form data-form="member" data-id="${m ? m.id : ''}" autocomplete="off">
      <input class="big-input" name="name" required maxlength="12" placeholder="이름 (예: 남편)" value="${esc(m?.name)}">
      <div class="field"><span class="label">색상</span>
        <input type="hidden" name="color" value="${esc(color)}">
        <div class="swatches">
          ${PALETTE.map((c) => `<button type="button" class="swatch${c === color ? ' on' : ''}" style="--mc:${c}" data-act="pick-color" data-c="${c}" aria-label="${c}"></button>`).join('')}
          <label class="swatch custom" title="직접 고르기">+<input type="color" value="${esc(color)}" data-change="member-color"></label>
        </div>
      </div>
      <div class="form-actions">
        ${m ? `<button type="button" class="btn danger" data-act="member-delete" data-id="${m.id}">삭제</button>` : ''}
        <button type="submit" class="btn primary">${m ? '저장' : '추가'}</button>
      </div></form>`,
    onMount: (el) => !m && setTimeout(() => el.querySelector('[name=name]').focus(), 60),
  });
}

/* ---------- 이 기기 ---------- */
function openDevice() {
  const cur = prefs.getDeviceMember();
  openSheet({
    title: '이 기기는 누구 거예요?',
    back: openMenu,
    body: `<p class="note">앱을 열면 이 사람의 할 일이 먼저 보여요. 이 설정은 이 기기에만 저장돼요.</p>
      <div class="chips">${state.members
        .map((m) => `<button class="chip${cur === m.id ? ' on' : ''}" style="--mc:${esc(m.color)}" data-act="device-pick" data-v="${m.id}"><i class="dot"></i>${esc(m.name)}</button>`)
        .join('')}
        <button class="chip" data-act="device-pick" data-v="">정하지 않음</button></div>`,
  });
}

/* ---------- 가족 공간 ---------- */
function openSpace() {
  const s = state.space;
  openSheet({
    title: '가족 공간',
    back: openMenu,
    body: `<form data-form="space-name" class="inline-form">
        <div class="field"><span class="label">공간 이름</span>
          <div class="row"><input name="name" maxlength="20" value="${esc(s.name)}"><button class="btn" type="submit">저장</button></div></div>
      </form>
      <div class="field"><span class="label">가족 코드</span>
        <div class="code-box"><b>${esc(s.code)}</b><button class="chip sm" data-act="space-copy-code">복사</button></div></div>
      <button class="btn wide" data-act="space-share">초대 링크 공유하기</button>
      <p class="note">가족은 링크를 열고 비밀번호만 입력하면 들어올 수 있어요.</p>
      <form data-form="space-password" class="inline-form">
        <div class="field"><span class="label">비밀번호 변경</span>
          <div class="row"><input type="password" name="pw" minlength="4" placeholder="새 비밀번호 (4자 이상)" autocomplete="new-password"><button class="btn" type="submit">변경</button></div></div>
      </form>
      <button class="btn danger wide" data-act="space-leave">이 기기에서 나가기</button>`,
  });
}

/* ---------- 백업 / 복원 ---------- */
async function doBackup(prefix = 'family-todo') {
  const data = await A.exportBackup();
  A.downloadBackup(data, `${prefix}-${todayISO()}.json`);
}

export const actions = {
  'open-menu': openMenu,
  'menu-members': openMembers,
  'menu-device': openDevice,
  'menu-space': openSpace,
  'member-add': () => openMemberForm(),
  'member-edit': (el) => openMemberForm(memberById(el.dataset.id)),
  'pick-color': (el) => {
    const f = el.closest('form');
    f.elements.color.value = el.dataset.c;
    f.querySelectorAll('.swatch').forEach((s) => s.classList.toggle('on', s === el));
  },
  'member-delete': async (el) => {
    const m = memberById(el.dataset.id);
    const n = state.tasks.filter((t) => (t.assignee_ids || []).includes(m.id)).length;
    const ok = await confirmDialog({
      title: `${m.name} 님을 삭제할까요?`,
      message: n ? `담당했던 할 일 ${n}개에서 이 사람이 빠져요. 혼자 담당했던 할 일은 '온 가족' 할 일이 돼요.` : '',
      choices: [{ label: '취소', value: false }, { label: '삭제', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      await A.removeMember(m.id);
      if (prefs.getDeviceMember() === m.id) prefs.setDeviceMember(null);
      openMembers();
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'device-pick': (el) => {
    prefs.setDeviceMember(el.dataset.v || null);
    prefs.setFilter({ ...prefs.getFilter(), member: null }); // 필터 기본값도 새 주인 기준으로
    set();
    closeSheet();
    toast('이 기기 설정을 바꿨어요');
  },
  'space-copy-code': async () => {
    try {
      await navigator.clipboard.writeText(state.space.code);
      toast('가족 코드를 복사했어요');
    } catch {
      toast(`가족 코드: ${state.space.code}`);
    }
  },
  'space-share': async () => {
    await shareText(`[가족 할 일] 우리 가족 공간에 들어오세요!\n${inviteLink()}\n가족 코드: ${state.space.code}\n(비밀번호는 따로 알려드릴게요)`);
  },
  'space-leave': async () => {
    const ok = await confirmDialog({
      title: '이 기기에서 나갈까요?',
      message: '데이터는 지워지지 않아요. 다시 들어오려면 가족 코드와 비밀번호가 필요해요.',
      choices: [{ label: '취소', value: false }, { label: '나가기', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    prefs.setSpaceId(null);
    prefs.setDeviceMember(null);
    prefs.setFilter(null);
    location.href = location.pathname;
  },
  'menu-backup': async () => {
    try {
      await doBackup();
      toast('백업 파일을 내려받았어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'menu-restore': () => document.getElementById('restore-input').click(),
};

export const changes = {
  'member-color': (el) => {
    const f = el.closest('form');
    f.elements.color.value = el.value;
    f.querySelectorAll('.swatch').forEach((s) => s.classList.remove('on'));
  },
  'restore-file': async (el) => {
    const file = el.files[0];
    el.value = '';
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
      if (data.app !== 'family-todo') throw new Error();
    } catch {
      return toast('가족 할 일 백업 파일이 아니에요');
    }
    const ok = await confirmDialog({
      title: '이 백업으로 복원할까요?',
      message: `현재 데이터는 모두 사라지고 백업 내용(할 일 ${data.tasks?.length ?? 0}개)으로 바뀌어요. 복원 전에 현재 데이터를 자동으로 백업 파일로 내려받아요.`,
      choices: [{ label: '취소', value: false }, { label: '복원하기', value: true, kind: 'danger' }],
    });
    if (!ok) return;
    try {
      await doBackup('family-todo-복원전');
      await A.restoreBackup(data);
      closeSheet();
      toast('복원했어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
};

export const forms = {
  member: async (f) => {
    const name = f.elements.name.value.trim();
    if (!name) return toast('이름을 입력해주세요');
    const p = { name, color: f.elements.color.value };
    try {
      if (f.dataset.id) await A.saveMember(f.dataset.id, p);
      else await A.addMember(p);
      openMembers();
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'space-name': async (f) => {
    try {
      await A.renameSpace(f.elements.name.value.trim() || '우리 가족');
      toast('이름을 바꿨어요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'space-password': async (f) => {
    const pw = f.elements.pw.value;
    if (pw.length < 4) return toast('비밀번호는 4자 이상으로 해주세요');
    try {
      await A.changePassword(pw);
      f.reset();
      toast('비밀번호를 바꿨어요. 다른 가족에게도 알려주세요');
    } catch (e) {
      toast(errMsg(e));
    }
  },
};
