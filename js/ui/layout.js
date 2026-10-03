// 앱 껍데기: 상단 바 + 화면 영역 + 탭(좁은 화면=하단, 넓은 화면=오른쪽 세로)
import { state, set, subscribe } from '../state.js';
import { esc } from './components.js';
import { renderHome } from './home.js';
import { renderTasks } from './tasks.js';
import { renderTrips } from './trips.js';
import { renderFood } from './food.js';

const TABS = [
  { id: 'home', ico: '🏠', label: '홈' },
  { id: 'tasks', ico: '✅', label: '할 일' },
  { id: 'trips', ico: '🗓', label: '일정/여행' },
  { id: 'food', ico: '🍱', label: '먹거리' },
];

export function mountShell() {
  document.getElementById('root').innerHTML = `
    <div class="app">
      <header class="topbar">
        <h1 class="brand" id="brand"></h1>
        <button class="icon-btn" data-act="open-menu" aria-label="설정">⋮</button>
      </header>
      <main id="view"></main>
      <nav class="nav" aria-label="메인 메뉴">
        ${TABS.map((t) => `<button class="nav-item" data-act="tab" data-tab="${t.id}"><span class="ico">${t.ico}</span><span class="lbl">${t.label}</span></button>`).join('')}
      </nav>
    </div>`;
  subscribe(render);
  render();
}

export function render() {
  const view = document.getElementById('view');
  if (!view || !state.space) return;
  document.body.dataset.tab = state.tab; // CSS 가 탭마다 포인트 색을 바꿈
  document.getElementById('brand').textContent = `👨🏻‍👩🏻‍👧🏻‍👦🏻 ${state.space.name}`;
  const screens = { home: renderHome, tasks: renderTasks, trips: renderTrips, food: renderFood };
  view.innerHTML = (screens[state.tab] || renderHome)();
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab));
}

export const actions = {
  tab: (el) => {
    set({ tab: el.dataset.tab, tripId: null });
    window.scrollTo(0, 0);
  },
};
