// 글꼴 적용: 선택한 글꼴을 불러와서 CSS 변수(--font-body / --font-head)에 넣는다. (기기별 저장)
import { FONTS } from '../fonts.js';
import { THEMES } from '../themes.js';
import { prefs } from '../prefs.js';

const STACK_TAIL = `'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif`;
const loaded = new Set();

// 기기에 기본으로 들어 있는 글꼴(시스템 글꼴). fonts.js 를 건드리지 않아도 목록에 항상 들어가요.
// (fonts.js 에 id 가 'system' 인 항목을 직접 만들면 그걸 우선 사용)
const SYSTEM_FONT = {
  id: 'system',
  label: '시스템 글꼴 (기기 기본)',
  stack: "system-ui, -apple-system, 'Segoe UI', 'Malgun Gothic', 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif",
};
/** '기본' 바로 아래에 시스템 글꼴을 끼워 넣은 전체 글꼴 목록 */
function allFonts() {
  if (FONTS.some((f) => f.id === SYSTEM_FONT.id)) return FONTS;
  const i = FONTS.findIndex((f) => f.id === 'default');
  return [...FONTS.slice(0, i + 1), SYSTEM_FONT, ...FONTS.slice(i + 1)];
}
export const listFonts = () => allFonts();
export const fontById = (id) => allFonts().find((f) => f.id === id) || allFonts()[0];
/** 지금 쓰는 글꼴: { body: 내용, head: 제목 } */
export const currentFonts = () => {
  const { body, head } = prefs.getFonts();
  return { body: fontById(body), head: fontById(head) };
};
export function fontSummary() {
  const { body, head } = currentFonts();
  return body.id === head.id ? body.label : `내용 ${body.label} · 제목 ${head.label}`;
}

const quote = (n) => `'${String(n).replace(/'/g, '')}'`;
const stackOf = (name) => `${quote(name)}, ${STACK_TAIL}`;
/** 글꼴 하나의 CSS font-family 값 (stack 이 있으면 그대로, name 이면 따옴표+대체 글꼴, 기본이면 inherit) */
const familyOf = (f) => (f.stack ? f.stack : stackOf(f.name));
export const fontStack = (f) => (f && (f.stack || f.name) ? familyOf(f) : 'inherit');

const formatOf = (url) => {
  const ext = (url.split('?')[0].split('.').pop() || '').toLowerCase();
  return { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' }[ext] || 'woff2';
};

/** 글꼴 파일/CSS 를 문서에 한 번만 등록 (설정 화면 미리보기에서도 사용) */
export function loadFont(f) {
  if (!f || !f.name || loaded.has(f.id)) return;
  loaded.add(f.id);
  if (f.stylesheet) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = f.stylesheet;
    document.head.appendChild(link);
  }
  if (f.url) {
    const style = document.createElement('style');
    style.textContent = `@font-face{font-family:${quote(f.name)};src:url('${f.url}') format('${formatOf(f.url)}');font-weight:${f.weight || 'normal'};font-display:swap}`;
    document.head.appendChild(style);
  }
}

/** 내용(--font-body)과 제목(--font-head)을 각각 적용. '기본'이면 style.css 에 정해둔 글꼴 그대로 */
export function applyFonts({ body, head }) {
  const root = document.documentElement.style;
  const apply = (prop, id) => {
    const f = fontById(id);
    if (!f || (!f.name && !f.stack)) return root.removeProperty(prop);
    loadFont(f);
    root.setProperty(prop, familyOf(f));
  };
  apply('--font-body', body);
  apply('--font-head', head);
}

/** 앱을 열 때 저장된 글꼴 적용 (목록에서 지워진 글꼴이면 기본으로) */
export function applySavedFont() {
  const ok = (id) => (allFonts().some((f) => f.id === id) ? id : 'default');
  const { body, head } = prefs.getFonts();
  applyFonts({ body: ok(body), head: ok(head) });
}

/* ---------- 테마 (색 모음): <html data-theme='…'> 로 css/themes.css 가 색 변수를 바꿈 ---------- */
export const listThemes = () => THEMES;
export const themeById = (id) => THEMES.find((t) => t.id === id) || THEMES[0];
export const currentTheme = () => themeById(prefs.getTheme());

export function applyTheme(id) {
  const t = themeById(id);
  const root = document.documentElement;
  if (t.id === THEMES[0].id) delete root.dataset.theme; // 기본(파스텔)은 style.css 그대로
  else root.dataset.theme = t.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.bar); // 폰 상단 상태바 색
}

export const applySavedTheme = () => applyTheme(prefs.getTheme());
