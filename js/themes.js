// ============================================================
// 테마 목록 — 항목을 추가하면 '설정 ⋮ → 이 기기 → 테마'에 자동으로 나와요.
//   id      : 겹치지 않는 영문 이름 (css/themes.css 의 html[data-theme='id'] 와 같아야 해요)
//   label   : 설정에 보이는 이름
//   desc    : 짧은 설명
//   swatch  : 미리보기에 쓸 색 (배경, 포인트 색들)
//   bar     : 폰 상단 상태바 색 (보통 배경색)
// 'pastel' 은 css/style.css 의 원래 색 그대로예요.
// ============================================================
export const THEMES = [
  { id: 'pastel', label: '파스텔', desc: '기본 · 포근한 크림 바탕에 파스텔', swatch: ['#f8f4ea', '#c4e5f6', '#cdeedd', '#ffdcc7', '#e2d9fb'], bar: '#f8f4ea' },
  { id: 'dark', label: '밤하늘', desc: '어두운 화면 · 밤에 눈이 편해요', swatch: ['#161a23', '#25465c', '#234a3d', '#573b2b', '#3a3259'], bar: '#161a23' },
  { id: 'nature', label: '숲', desc: '차분한 세이지 그린과 베이지', swatch: ['#eceee2', '#cde4dc', '#d5e8c9', '#efe6bd', '#efd9c2'], bar: '#eceee2' },
  { id: 'ocean', label: '바다', desc: '맑은 하늘색과 청량한 블루', swatch: ['#e8f2f8', '#c6e3f6', '#c8ecec', '#d9dcf6', '#fcdccb'], bar: '#e8f2f8' },
];
