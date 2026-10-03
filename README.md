# 우리 가족 (가족 할 일 분담 앱)

가족 구성원에게 할 일을 배정하고, 누가 무엇을 했는지 한눈에 보는 PWA. 빌드 과정 없이 정적 파일만으로 동작합니다.

## 설치 순서

1. **Supabase 프로젝트 만들기** (무료 플랜 가능)
2. **Authentication → Sign In / Providers → Anonymous sign-ins 켜기** (회원가입 없이 기기별 자동 세션을 쓰기 위해 필요)
3. **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run → 이어서 `supabase/food.sql` 도 붙여넣고 Run (먹거리 탭용, 안 돌려도 나머지 기능은 동작)
4. **Project Settings → API** 의 `Project URL` 과 `anon public key` 를 `js/config.js` 에 입력
5. 폴더 전체를 **폴더 구조 그대로** **GitHub Pages / Netlify / Vercel** 등 HTTPS 정적 호스팅에 올리기 (PWA 설치와 공유 기능은 HTTPS 필요)
   - `js/data/food.js` 와 `js/logic/food.js` 처럼 **이름이 같아도 폴더가 다른 파일**이 있어요. 한 폴더에 합치면 앱이 시작되지 않아요.
   - 앱이 8초 안에 시작되지 않으면 어떤 파일이 없는지 알려주는 점검 화면이 나와요.
6. 폰에서 열어 **가족 공간 만들기** → 가족에게 코드(또는 초대 링크)와 비밀번호 전달 → 홈 화면에 추가

로컬 테스트: `python3 -m http.server 8000` 후 `http://localhost:8000`

## 파일 구조 (UI ↔ 서비스 ↔ DB 3계층)

```
index.html / manifest.webmanifest / sw.js     PWA 껍데기
css/style.css                                 전체 스타일 (좁은 화면=하단 탭, 600px 이상=오른쪽 세로 탭)
js/config.js                                  Supabase 주소/키
js/app.js                                     시작점: 세션 → 가족 공간 열기 → 실시간 구독 → 이벤트 연결
js/state.js                                   앱 상태 저장소
js/prefs.js                                   기기별 설정(localStorage): 이 기기 주인, 마지막 필터, 가족 공간
js/actions.js                                 서비스 계층: UI 는 여기만 호출 (DB 호출 → 상태 갱신)
js/data/        ← DB 접근 코드 (Supabase 를 아는 유일한 곳)
  client.js  spaces.js  members.js  tasks.js  trips.js  food.js(반찬·간식 DB)  realtime.js  backup.js
js/logic/       ← 순수 계산 (DB/화면 모름, 테스트 쉬움)
  dates.js  recurrence.js(반복 규칙)  filters.js(담당자·기간·완료 조합)  share.js(공유 텍스트)
  food.js(유통기한 상태 · 주간 식단 자동 배정)
js/ui/          ← 화면
  layout.js(탭/껍데기) home.js tasks.js trips.js food.js(먹거리 화면) taskForm.js settings.js gate.js sheet.js components.js
supabase/schema.sql                           테이블 + 보안(RLS) + 실시간 설정
supabase/food.sql                             먹거리(반찬·간식) 테이블 추가분
supabase/multi-assign.sql                     담당자 여러 명 + 완료한 사람 기록
supabase/push.sql, functions/notify-task/     새 할 일 알림(웹 푸시) — 설정은 supabase/PUSH-SETUP.md
```

## DB 구조

| 테이블 | 역할 |
|---|---|
| `spaces` | 가족 공간 (코드, 이름) |
| `space_secrets` | 비밀번호 해시 (클라이언트 접근 불가) |
| `space_access` | 어떤 기기(익명 사용자)가 어떤 공간에 들어왔는지 |
| `members` | 가족 구성원 (이름, 색상, 순서) |
| `trips` | 외출/여행 (제목, 기간, 장소, 메모, 아이콘) |
| `tasks` | 할 일 + 반복 설정(`repeat_*`) + 담당자(`assignee_id`) + 여행 연결(`trip_id`) |
| `task_completions` | 반복 업무의 날짜별 완료 기록 |
| `food_items` | 반찬/간식 재고 (`kind`: banchan/snack, 수량, 보관 장소, 배달·구입일, 보관 가능일) |
| `food_plan` | 반찬 주간 식단 (어느 날 어떤 반찬) |

- 모든 데이터 테이블에 `space_id` 가 있어 한 DB 에서 여러 가족 공간을 안전하게 분리합니다.
- 반복 업무는 날짜별 행을 미리 만들지 않고, 앱이 규칙(`repeat_type/interval/days/end`)으로 날짜별 할 일을 계산해 보여줍니다. 완료한 날짜만 `task_completions` 에 기록됩니다.
- 접근 방식: 코드+비밀번호를 `join_space()` 함수가 검증 → 통과한 기기만 `space_access` 에 등록 → RLS 가 그 공간 데이터만 허용.

## 확장할 때

- 새 기능의 테이블 → `data/xxx.js` (DB) → `actions.js` (상태 연결) → `ui/xxx.js` (화면) 순서로 추가
- 새 반복 규칙 → `logic/recurrence.js` 의 `occursOn()` 에 케이스 추가
- 새 필터 → `logic/filters.js`

## 알아둘 점

- 비밀번호 5회 이상 오입력 제한은 넣지 않았습니다. 가족 코드는 무작위 6자리이므로, 비밀번호는 4자리 숫자보다 길게 쓰는 것을 권장합니다.
- 브라우저 데이터를 지우면 그 기기는 코드+비밀번호를 다시 입력해야 합니다. (가족 데이터는 유지)
- 앱을 수정해 다시 올릴 때는 `sw.js` 의 `VERSION` 값을 올려야 폰에 새 파일이 반영됩니다.

## 먹거리 탭

- **반찬**: 배달 온 반찬 등록(냉장/냉동·끼분·보관 가능일) → 오늘부터 7일 식단 자동 배정. 유통기한이 오늘/내일인 반찬은 하루 제한(3개)을 넘어도 반드시 포함, 날짜별로 반찬을 직접 빼고 넣을 수 있고, 다음 날 냉동 반찬이 있으면 전날에 해동 안내가 나와요.
- **간식**: 보관 장소(실온/냉장/냉동)별 재고 + 남은 개수 + 유통기한. `먹음`을 누르면 1개씩 줄고 0이 되면 목록에서 사라져요.
- 식단은 자동 생성을 앱을 열 때마다 하지 않고 버튼을 눌렀을 때만 만들어요. (여러 가족이 동시에 열어도 식단이 뒤섞이지 않게)
- 알림 기능(.ics)은 넣지 않았어요.

## 새 할 일 알림

- 나에게 배정된 할 일(온 가족 할 일 포함)이 새로 생기거나, 내가 담당자로 새로 추가되면 폰에 알림이 와요.
- 설정은 한 번만: `supabase/PUSH-SETUP.md` 를 따라 하세요. (알림을 안 쓰면 설정 없이 그대로 사용해도 돼요.)
- 앱에서는 `설정 ⋮ → 알림` 에서 기기별로 켜고 끌 수 있어요.
