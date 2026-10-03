// 첫 화면: 가족 공간 만들기 / 코드+비밀번호로 들어가기
import { esc, toast, errMsg } from './components.js';
import * as spacesDb from '../data/spaces.js';

let mode = 'join';
let ctx = { prefillCode: '', onEnter: null };
let created = null;

export function renderGate({ prefillCode = '', onEnter }) {
  ctx = { prefillCode, onEnter };
  mode = prefillCode ? 'join' : 'join';
  draw();
}

const root = () => document.getElementById('root');

function draw() {
  if (created) return drawCreated();
  root().innerHTML = `<main class="gate">
    <div class="gate-logo">🏠</div>
    <h1>우리집 할 일</h1>
    <p class="gate-sub">가족이 같이 쓰는 할 일 공간</p>
    <div class="seg wide" role="tablist">
      <button class="${mode === 'join' ? 'on' : ''}" data-act="gate-mode" data-v="join">들어가기</button>
      <button class="${mode === 'create' ? 'on' : ''}" data-act="gate-mode" data-v="create">새로 만들기</button>
    </div>
    ${
      mode === 'join'
        ? `<form data-form="gate-join" autocomplete="off">
            <label class="field"><span class="label">가족 코드</span>
              <input name="code" class="big-input code-input" required maxlength="10" placeholder="K7MQ4X" value="${esc(ctx.prefillCode)}" autocapitalize="characters"></label>
            <label class="field"><span class="label">비밀번호</span>
              <input name="pw" type="password" class="big-input" required placeholder="가족 공간 비밀번호" autocomplete="current-password"></label>
            <button class="btn primary wide" type="submit">들어가기</button>
          </form>`
        : `<form data-form="gate-create" autocomplete="off">
            <label class="field"><span class="label">공간 이름</span>
              <input name="name" class="big-input" maxlength="20" placeholder="예: 김씨네 가족" ></label>
            <label class="field"><span class="label">비밀번호 (4자 이상)</span>
              <input name="pw" type="password" class="big-input" required minlength="4" autocomplete="new-password"></label>
            <button class="btn primary wide" type="submit">가족 공간 만들기</button>
          </form>`
    }
  </main>`;
}

function drawCreated() {
  const link = `${location.origin}${location.pathname}?code=${created.code}`;
  root().innerHTML = `<main class="gate">
    <div class="gate-logo">🎉</div>
    <h1>가족 공간이 만들어졌어요</h1>
    <p class="gate-sub">가족에게 이 코드와 비밀번호를 알려주세요</p>
    <div class="code-box big"><b>${esc(created.code)}</b></div>
    <button class="btn wide" data-act="gate-copy-link" data-link="${esc(link)}">초대 링크 복사</button>
    <button class="btn primary wide" data-act="gate-start">시작하기</button>
  </main>`;
}

export const actions = {
  'gate-mode': (el) => {
    mode = el.dataset.v;
    draw();
  },
  'gate-copy-link': async (el) => {
    try {
      await navigator.clipboard.writeText(el.dataset.link);
      toast('링크를 복사했어요');
    } catch {
      window.prompt('링크를 복사하세요', el.dataset.link);
    }
  },
  'gate-start': () => {
    const id = created.id;
    created = null;
    ctx.onEnter(id);
  },
};

export const forms = {
  'gate-join': async (f) => {
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      const id = await spacesDb.joinSpace(f.elements.code.value, f.elements.pw.value);
      ctx.onEnter(id);
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  },
  'gate-create': async (f) => {
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      created = await spacesDb.createSpace(f.elements.name.value, f.elements.pw.value);
      draw();
    } catch (e) {
      btn.disabled = false;
      toast(errMsg(e));
    }
  },
};
