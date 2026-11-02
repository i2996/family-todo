-- ============================================================
-- 가계부 반복 (매주·매월·매년) + 주말·공휴일이면 앞/다음 영업일로 옮기기
-- 먼저 ledger.sql 이 실행돼 있어야 해요. 여러 번 실행해도 안전해요.
-- 반복 규칙은 만든 사람(그 사람 PIN 을 푼 기기)만 보고 고칠 수 있어요.
-- 반복으로 만들어진 내역은 규칙에서 정한 '보는 사람' 대로 보여요.
-- ============================================================

create table if not exists public.ledger_repeats (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  kind         text not null default 'expense' check (kind in ('expense', 'income')),
  amount       bigint not null check (amount >= 0),
  category     text not null default '기타' check (char_length(category) <= 20),
  memo         text check (char_length(memo) <= 200),
  created_by   uuid references public.members(id) on delete cascade,
  is_public    boolean not null default false,
  shared_with  uuid[] not null default '{}',
  freq         text not null check (freq in ('weekly', 'monthly', 'yearly')),
  start_date   date not null,                 -- 첫 날짜 (요일·날짜 기준)
  end_date     date,                          -- 끝나는 날 (없으면 계속)
  last_day     boolean not null default false, -- 매월 말일
  shift        text not null default 'none' check (shift in ('none', 'before', 'after')),  -- 쉬는 날이면 그대로/앞 영업일/다음 영업일
  skip_dates   date[] not null default '{}',  -- 하나만 지운 날 (다시 만들지 않음)
  created_at   timestamptz not null default now()
);
create index if not exists ledger_repeats_space_idx on public.ledger_repeats(space_id);

alter table public.ledger_repeats enable row level security;
drop policy if exists ledger_repeats_own on public.ledger_repeats;
create policy ledger_repeats_own on public.ledger_repeats for all to authenticated
  using (public.is_space_member(space_id) and public.ledger_is_me(created_by))
  with check (public.is_space_member(space_id) and public.ledger_is_me(created_by));

-- 내역 ↔ 반복 규칙 연결
alter table public.ledger_entries add column if not exists repeat_id uuid references public.ledger_repeats(id) on delete set null;
alter table public.ledger_entries add column if not exists repeat_date date;             -- 원래 날짜 (옮기기 전)
alter table public.ledger_entries add column if not exists repeat_locked boolean not null default false;  -- 하나만 따로 고친 내역
create unique index if not exists ledger_entries_repeat_uq on public.ledger_entries(repeat_id, repeat_date);
