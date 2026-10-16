// 글꼴 적용: 선택한 글꼴을 불러와서 CSS 변수(--font-body / --font-head)에 넣는다. (기기별 저장)
import { FONTS } from '../fonts.js';
import { prefs } from '../prefs.js';

const STACK_TAIL = `'Malgun Gothic', 'Apple SD Gothic Neo', system-ui, sans-serif`;
const loaded = new Set();

export const listFonts = () => FONTS;
export const fontById = (id) => FONTS.find((f) => f.id === id) || FONTS[0];
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
export const fontStack = (f) => (f && f.name ? stackOf(f.name) : 'inherit');

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
    if (!f || !f.name) return root.removeProperty(prop);
    loadFont(f);
    root.setProperty(prop, stackOf(f.name));
  };
  apply('--font-body', body);
  apply('--font-head', head);
}

/** 앱을 열 때 저장된 글꼴 적용 (목록에서 지워진 글꼴이면 기본으로) */
export function applySavedFont() {
  const ok = (id) => (FONTS.some((f) => f.id === id) ? id : 'default');
  const { body, head } = prefs.getFonts();
  applyFonts({ body: ok(body), head: ok(head) });
}
