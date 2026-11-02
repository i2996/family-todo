-- ============================================================
-- 일정 반복 (매주·매월·매년) + 주말·공휴일이면 앞/다음 영업일
-- 먼저 events.sql 이 실행돼 있어야 해요. 여러 번 실행해도 안전해요.
-- 반복 일정은 한 줄로 저장되고, 날짜는 앱이 규칙대로 계산해서 달력에 보여줘요.
-- ============================================================

alter table public.events add column if not exists repeat_freq text
  check (repeat_freq is null or repeat_freq in ('weekly', 'monthly', 'yearly'));      -- 없으면 반복 안 함
alter table public.events add column if not exists repeat_end date;                     -- 끝나는 날 (없으면 계속)
alter table public.events add column if not exists repeat_last_day boolean not null default false;  -- 매월 말일
alter table public.events add column if not exists repeat_month_week smallint           -- 매월 n번째(1~5)/마지막(-1) ○요일
  check (repeat_month_week is null or repeat_month_week = -1 or repeat_month_week between 1 and 5);
alter table public.events add column if not exists repeat_shift text not null default 'none'
  check (repeat_shift in ('none', 'before', 'after'));                                  -- 쉬는 날이면 그대로/앞/다음 영업일
alter table public.events add column if not exists repeat_skip date[] not null default '{}';  -- 하나만 지운(따로 바꾼) 날 (원래 날짜)
