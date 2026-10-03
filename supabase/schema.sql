-- ============================================================
-- 가족 할 일 앱 - Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 통째로 붙여넣고 Run 하세요.
-- (먼저 Authentication > Sign In / Providers 에서 "Anonymous sign-ins" 를 켜야 합니다)
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- ------------------------------------------------------------
-- 1. 테이블
-- ------------------------------------------------------------

-- 가족 공간: 모든 데이터의 최상위 단위
create table if not exists public.spaces (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,               -- 가족 코드 (예: K7MQ4X)
  name        text not null default '우리 가족',
  created_at  timestamptz not null default now()
);

-- 비밀번호 해시는 별도 테이블 (RLS 정책 없음 = 클라이언트가 절대 직접 못 읽음)
create table if not exists public.space_secrets (
  space_id       uuid primary key references public.spaces(id) on delete cascade,
  password_hash  text not null
);

-- 어느 기기(익명 로그인 사용자)가 어느 가족 공간에 들어올 수 있는지
create table if not exists public.space_access (
  space_id   uuid not null references public.spaces(id) on delete cascade,
  user_id    uuid not null,                        -- auth.uid()
  joined_at  timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index if not exists space_access_user_idx on public.space_access(user_id);

-- 가족 구성원
create table if not exists public.members (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  name        text not null,
  color       text not null default '#ff8fab',
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists members_space_idx on public.members(space_id);

-- 외출 / 여행
create table if not exists public.trips (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  title       text not null,
  icon        text not null default '🏕️',
  start_date  date not null,
  end_date    date,                                 -- null 이면 하루짜리
  place       text,
  memo        text,
  created_at  timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);
create index if not exists trips_space_idx on public.trips(space_id, start_date);

-- 할 일 (반복 설정도 이 테이블 한 곳에서 관리)
create table if not exists public.tasks (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  title            text not null,
  assignee_id      uuid references public.members(id) on delete set null,
  task_date        date not null,                   -- 할 일을 하는 날 (반복이면 반복 시작일)
  start_date       date,                            -- 선택: 기간형 시작
  due_date         date,                            -- 선택: 마감
  memo             text,
  trip_id          uuid references public.trips(id) on delete set null,

  -- 반복 (repeat_type 이 null 이면 한 번만 하는 일)
  repeat_type      text check (repeat_type in ('daily','weekly','monthly','yearly')),
  repeat_interval  int  not null default 1 check (repeat_interval >= 1),
  repeat_days      smallint[],                      -- weekly 전용: 0=일 ... 6=토
  repeat_end       date,                            -- null 이면 종료 없음

  -- 한 번만 하는 일의 완료 상태 (반복 업무는 task_completions 사용)
  done             boolean not null default false,
  done_at          timestamptz,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists tasks_space_date_idx on public.tasks(space_id, task_date);
create index if not exists tasks_assignee_idx   on public.tasks(assignee_id);
create index if not exists tasks_trip_idx       on public.tasks(trip_id);

-- 반복 업무의 날짜별 완료 기록 (행이 있으면 그 날짜는 완료)
create table if not exists public.task_completions (
  task_id          uuid not null references public.tasks(id) on delete cascade,
  occurrence_date  date not null,
  space_id         uuid not null references public.spaces(id) on delete cascade,
  completed_at     timestamptz not null default now(),
  primary key (task_id, occurrence_date)
);
create index if not exists completions_space_idx on public.task_completions(space_id);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 2. 접근 확인 함수 + 가족 공간 생성/접속 함수 (RPC)
-- ------------------------------------------------------------

create or replace function public.is_space_member(sid uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.space_access
    where space_id = sid and user_id = auth.uid()
  );
$$;

create or replace function public.create_space(p_name text, p_code text, p_password text)
returns public.spaces
language plpgsql security definer set search_path = public, extensions as $$
declare s public.spaces;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if length(coalesce(p_password, '')) < 4 then raise exception 'password_too_short'; end if;

  insert into public.spaces (name, code)
  values (coalesce(nullif(trim(p_name), ''), '우리 가족'), upper(trim(p_code)))
  returning * into s;

  insert into public.space_secrets (space_id, password_hash)
  values (s.id, crypt(p_password, gen_salt('bf')));

  insert into public.space_access (space_id, user_id) values (s.id, auth.uid());
  return s;
end $$;

create or replace function public.join_space(p_code text, p_password text)
returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare sid uuid; h text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select s.id, k.password_hash into sid, h
  from public.spaces s
  join public.space_secrets k on k.space_id = s.id
  where s.code = upper(trim(p_code));

  if sid is null or h <> crypt(p_password, h) then
    raise exception 'invalid_credentials';
  end if;

  insert into public.space_access (space_id, user_id)
  values (sid, auth.uid()) on conflict do nothing;
  return sid;
end $$;

create or replace function public.change_space_password(p_space_id uuid, p_new_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_space_member(p_space_id) then raise exception 'forbidden'; end if;
  if length(coalesce(p_new_password, '')) < 4 then raise exception 'password_too_short'; end if;
  update public.space_secrets
     set password_hash = crypt(p_new_password, gen_salt('bf'))
   where space_id = p_space_id;
end $$;

revoke execute on function public.create_space(text, text, text)        from public, anon;
revoke execute on function public.join_space(text, text)                from public, anon;
revoke execute on function public.change_space_password(uuid, text)     from public, anon;
grant  execute on function public.create_space(text, text, text)        to authenticated;
grant  execute on function public.join_space(text, text)                to authenticated;
grant  execute on function public.change_space_password(uuid, text)     to authenticated;

-- ------------------------------------------------------------
-- 3. RLS: 자기가 들어온 가족 공간의 데이터만 읽고 쓸 수 있음
-- ------------------------------------------------------------

alter table public.spaces            enable row level security;
alter table public.space_secrets     enable row level security;   -- 정책 없음 = 접근 불가
alter table public.space_access      enable row level security;
alter table public.members           enable row level security;
alter table public.trips             enable row level security;
alter table public.tasks             enable row level security;
alter table public.task_completions  enable row level security;

drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select to authenticated
  using (public.is_space_member(id));

drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces for update to authenticated
  using (public.is_space_member(id)) with check (public.is_space_member(id));
revoke update on public.spaces from authenticated;
grant  update (name) on public.spaces to authenticated;      -- 이름만 수정 가능

drop policy if exists access_select_own on public.space_access;
create policy access_select_own on public.space_access for select to authenticated
  using (user_id = auth.uid());

drop policy if exists members_all on public.members;
create policy members_all on public.members for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

drop policy if exists trips_all on public.trips;
create policy trips_all on public.trips for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

drop policy if exists tasks_all on public.tasks;
create policy tasks_all on public.tasks for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

drop policy if exists completions_all on public.task_completions;
create policy completions_all on public.task_completions for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- ------------------------------------------------------------
-- 4. 실시간 동기화 (Realtime)
-- ------------------------------------------------------------

alter table public.members          replica identity full;
alter table public.trips            replica identity full;
alter table public.tasks            replica identity full;
alter table public.task_completions replica identity full;

do $$
declare t text;
begin
  foreach t in array array['members','trips','tasks','task_completions'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;   -- 이미 등록돼 있으면 무시
    end;
  end loop;
end $$;
