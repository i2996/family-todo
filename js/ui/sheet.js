// 아래에서 올라오는 시트(넓은 화면에선 가운데 팝업) + 확인 대화상자
import { esc } from './components.js';

const root = () => document.getElementById('sheet-root');
let backFn = null;

export function openSheet({ title, body, back = null, onMount = null }) {
  backFn = back;
  const r = root();
  r.innerHTML = `<div class="backdrop" data-act="sheet-close"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="sheet-head">
        ${back ? '<button class="icon-btn" data-act="sheet-back" aria-label="뒤로">‹</button>' : '<span></span>'}
        <h2>${esc(title)}</h2>
        <button class="icon-btn" data-act="sheet-close" aria-label="닫기">✕</button>
      </header>
      <div class="sheet-body">${body}</div>
    </section>`;
  r.classList.add('open');
  document.body.classList.add('no-scroll');
  if (onMount) onMount(r.querySelector('.sheet-body'));
}

export function closeSheet() {
  const r = root();
  r.classList.remove('open');
  r.innerHTML = '';
  backFn = null;
  document.body.classList.remove('no-scroll');
}

export function confirmDialog({ title, message = '', choices }) {
  return new Promise((resolve) => {
    const d = document.getElementById('dialog-root');
    d.innerHTML = `<div class="backdrop dim"></div>
      <div class="dialog" role="alertdialog" aria-modal="true">
        <h3>${esc(title)}</h3>
        ${message ? `<p>${esc(message)}</p>` : ''}
        <div class="dialog-actions">
          ${choices.map((c, i) => `<button class="btn ${c.kind || ''}" data-choice="${i}">${esc(c.label)}</button>`).join('')}
        </div>
      </div>`;
    d.classList.add('open');
    const done = (v) => {
      d.classList.remove('open');
      d.innerHTML = '';
      resolve(v);
    };
    d.querySelectorAll('[data-choice]').forEach((b) =>
      b.addEventListener('click', () => done(choices[Number(b.dataset.choice)].value))
    );
    d.querySelector('.backdrop').addEventListener('click', () => done(null));
  });
}

export const actions = {
  'sheet-close': () => closeSheet(),
  'sheet-back': () => backFn && backFn(),
};
