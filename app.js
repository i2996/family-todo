// 앱 시작점: 세션 확인 → 가족 공간 열기 → 실시간 구독 → 이벤트 연결
import { isConfigured, ensureSession } from './data/client.js';
import { getSpace } from './data/spaces.js';
import { subscribeSpace } from './data/realtime.js';
import { prefs } from './prefs.js';
import { state, set } from './state.js';
import * as A from './actions.js';
import { toast, errMsg, memberById } from './ui/components.js';
import { buildShareText, shareText } from './logic/share.js';
import { mountShell, actions as layoutActions } from './ui/layout.js';
import { renderGate, actions as gateActions, forms as gateForms } from './ui/gate.js';
import { actions as sheetActions } from './ui/sheet.js';
import { actions as homeActions } from './ui/home.js';
import { actions as tasksActions } from './ui/tasks.js';
import { actions as tripActions, forms as tripForms } from './ui/trips.js';
import { openTaskForm, actions as formActions, forms as taskForms, changes as formChanges } from './ui/taskForm.js';
import { actions as settingsActions, forms as settingsForms, changes as settingsChanges } from './ui/settings.js';
import { occFor } from './ui/components.js';

/* ---------- 공통 액션 (할 일 체크/수정/공유/추가) ---------- */
const coreActions = {
  toggle: async (el) => {
    try {
      await A.toggleOccurrence(el.dataset.task, el.dataset.date);
    } catch (e) {
      toast(errMsg(e));
    }
  },
  'edit-task': (el) => openTaskForm({ task: state.tasks.find((t) => t.id === el.dataset.task) }),
  'add-task': (el) => openTaskForm({ date: el.dataset.date || null }),
  'share-task': async (el) => {
    const t = state.tasks.find((x) => x.id === el.dataset.task);
    if (!t) return;
    const text = buildShareText(occFor(t, el.dataset.date), memberById(t.assignee_id));
    if ((await shareText(text)) === 'copied') toast('내용을 복사했어요. 카톡에 붙여넣기 하세요');
  },
};

const actions = {
  ...layoutActions, ...gateActions, ...sheetActions, ...homeActions, ...tasksActions,
  ...tripActions, ...formActions, ...settingsActions, ...coreActions,
};
const forms = { ...gateForms, ...tripForms, ...taskForms, ...settingsForms };
const changes = { ...formChanges, ...settingsChanges };

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  const fn = el && actions[el.dataset.act];
  if (fn) fn(el, e);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.task-body[data-act]')) {
    e.preventDefault();
    actions[e.target.dataset.act](e.target, e);
  }
  if (e.key === 'Escape') actions['sheet-close']();
});
document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-change]');
  const fn = el && changes[el.dataset.change];
  if (fn) fn(el, e);
});
document.addEventListener('submit', (e) => {
  const f = e.target.closest('form[data-form]');
  if (!f) return;
  e.preventDefault();
  const fn = forms[f.dataset.form];
  if (fn) fn(f);
});

/* ---------- 가족 공간 열기 + 실시간 ---------- */
let unsubscribe = null;
const pending = new Set();
let timer = null;
function onRemoteChange(table) {
  pending.add(table);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const list = [...pending];
    pending.clear();
    list.forEach((t) => A.refresh(t).catch(console.error));
  }, 200);
}

async function openSpace(spaceId) {
  const space = await getSpace(spaceId);
  prefs.setSpaceId(space.id);
  set({ space });
  await A.loadAll();
  mountShell();
  if (unsubscribe) unsubscribe();
  unsubscribe = subscribeSpace(space.id, onRemoteChange);
}

// 폰을 다시 켜서 앱으로 돌아오면 최신 상태로 맞추고, 날짜가 바뀌었으면 화면도 갱신
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.space) A.loadAll().catch(() => {});
});

/* ---------- 시작 ---------- */
function showMessage(html) {
  document.getElementById('root').innerHTML = `<main class="gate">${html}</main>`;
}

async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

  if (!isConfigured) {
    return showMessage(`<div class="gate-logo">🛠️</div><h1>설정이 필요해요</h1>
      <p class="gate-sub"><code>js/config.js</code> 에 Supabase 주소와 키를 넣어주세요.<br>자세한 방법은 README.md 를 확인하세요.</p>`);
  }
  try {
    await ensureSession();
  } catch (e) {
    return showMessage(`<div class="gate-logo">😢</div><h1>접속하지 못했어요</h1>
      <p class="gate-sub">${errMsg(e)}<br>Supabase 에서 Anonymous sign-ins 가 켜져 있는지 확인해주세요.</p>`);
  }

  const onEnter = async (id) => {
    try {
      await openSpace(id);
    } catch (e) {
      toast(errMsg(e));
    }
  };
  const saved = prefs.getSpaceId();
  if (saved) {
    try {
      return await openSpace(saved);
    } catch {
      prefs.setSpaceId(null); // 접근 권한이 없어졌으면 처음부터
    }
  }
  const code = new URLSearchParams(location.search).get('code') || '';
  renderGate({ prefillCode: code.toUpperCase(), onEnter });
}

boot();
