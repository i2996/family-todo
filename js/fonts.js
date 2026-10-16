// ============================================================
// 글꼴 목록 — 여기에 항목만 추가하면 '설정 ⋮ → 글꼴'에 자동으로 나와요.
//
// 항목 모양:
//   id      : 겹치지 않는 영문 이름 (기기에 저장되는 값)
//   label   : 설정에 보이는 이름
//   name    : CSS font-family 이름 (아래 둘 중 하나로 불러온 글꼴 이름)
//   url     : (선택) 글꼴 파일 주소. woff2 / woff / ttf / otf
//             - 내 사이트에 올린 파일이면  'fonts/내글꼴.woff2'  (index.html 이 있는 곳 기준)
//             - 웹에 있는 파일이면 https://... 전체 주소
//   stylesheet : (선택) 구글 폰트처럼 글꼴 CSS 주소를 줄 때 (url 대신 사용)
//   weight  : (선택) 글꼴 굵기. 기본 'normal'
//   head    : (선택) 제목에만 다른 글꼴을 쓰고 싶을 때 그 글꼴의 name
//
// css/style.css 의 @font-face 로 이미 불러온 글꼴은 url 없이 name 만 적으면 돼요.
// ============================================================
export const FONTS = [
  { id: 'default', label: '기본', name: null }, // css/style.css 의 기본 글꼴 그대로

  // style.css 에 @font-face 로 이미 들어 있는 글꼴 (이름은 마음대로 바꿔도 돼요)
  { id: 'gothic', label: '나눔스퀘어', name: 'Nanum Square', stylesheet: 'https://cdn.rawgit.com/moonspam/NanumSquare/master/nanumsquare.css' }
  { id: 'nostalgic', label: '그리운X국한박 사랑스러운', name: 'NostalgicGukhanbakLovely' },
  { id: 'beloved', label: '그리운 묘은또박체', name: 'BelovedMyoeunttobak' },

  // ↓ 새 글꼴 추가 예시 (앞의 // 를 지우고 고쳐 쓰세요)
  // { id: 'myfont', label: '내 글꼴', name: 'MyFont', url: 'fonts/MyFont.woff2' },
  // { id: 'gothic', label: '나눔고딕', name: 'Nanum Gothic', stylesheet: 'https://fonts.googleapis.com/css2?family=Nanum+Gothic&display=swap' },
];
