-- ============================================================
-- 가계부 + 구성원별 PIN 잠금
--  - 구성원마다 4자리 PIN 을 만들고, PIN 을 맞힌 기기만 "이 기기 = 그 사람"으로 서버에 기록돼요.
--  - 가계부 내역은 서버(RLS)가 걸러서 보여줘요: 온 가족 공개 / 작성자 / 공유받은 사람만.
--  - PIN 은 암호화(bcrypt)해서 앱에서 읽을 수 없는 표에 저장돼요. 5번 틀리면 5분간 잠겨요.
-- SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- ============================================================

create extension if not exists pgcrypto with schema extensions;

-- 구성원 PIN (앱에서 직접 읽기/쓰기 불가 — 아래 함수로만 다룸)
create table if not exists public.member_pins (
  member_id     uuid primary key references public.members(id) on delete cascade,
  space_id      uuid not null references public.spaces(id) on delete cascade,
  pin_hash      text not null,
  failed_count  int not null default 0,
  locked_until  timestamptz,
  updated_at    timestamptz not null default now()
);
alter table public.member_pins enable row level security;
-- 정책 없음 = 앱에서 접근 불가

-- 어떤 기기(익명 사용자)가 어떤 구성원으로 PIN 을 풀었는지
create table if not exists public.member_devices (
  user_id     uuid not null references auth.users(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  space_id    uuid not null references public.spaces(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, space_id)
);
alter table public.member_devices enable row level security;
drop policy if exists member_devices_own on public.member_devices;
create policy member_devices_own on public.member_devices for select to authenticated
  using (user_id = auth.uid());

-- 가계부 내역
create table if not exists public.ledger_entries (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces(id) on delete cascade,
  entry_date   date not null default current_date,
  kind         text not null default 'expense' check (kind in ('expense', 'income')),
  amount       bigint not null check (amount >= 0),
  category     text not null default '기타' check (char_length(category) <= 20),
  memo         text check (char_length(memo) <= 200),
  created_by   uuid references public.members(id) on delete set null,   -- 작성자(주인)
  is_public    boolean not null default false,                           -- 온 가족 공개
  shared_with  uuid[] not null default '{}',                             -- 함께 볼 구성원
  created_at   timestamptz not null default now()
);
create index if not exists ledger_space_date_idx on public.ledger_entries(space_id, entry_date);

-- 이 기기가 PIN 을 푼 구성원인지 (RLS 에서 사용)
create or replace function public.ledger_is_me(p_member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_member is not null and exists (
    select 1 from public.member_devices d where d.user_id = auth.uid() and d.member_id = p_member);
$$;

create or replace function public.ledger_is_me_any(p_members uuid[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_devices d where d.user_id = auth.uid() and d.member_id = any(p_members));
$$;

alter table public.ledger_entries enable row level security;
drop policy if exists ledger_select on public.ledger_entries;
drop policy if exists ledger_insert on public.ledger_entries;
drop policy if exists ledger_update on public.ledger_entries;
drop policy if exists ledger_delete on public.ledger_entries;
-- 보기: 같은 가족 + (온 가족 공개 / 작성자 / 공유받은 사람)
create policy ledger_select on public.ledger_entries for select to authenticated
  using (public.is_space_member(space_id)
         and (is_public or public.ledger_is_me(created_by) or public.ledger_is_me_any(shared_with)));
-- 쓰기/고치기/지우기: 작성자 본인(그 사람 PIN 을 푼 기기)만
create policy ledger_insert on public.ledger_entries for insert to authenticated
  with check (public.is_space_member(space_id) and public.ledger_is_me(created_by));
create policy ledger_update on public.ledger_entries for update to authenticated
  using (public.is_space_member(space_id) and public.ledger_is_me(created_by))
  with check (public.is_space_member(space_id) and public.ledger_is_me(created_by));
create policy ledger_delete on public.ledger_entries for delete to authenticated
  using (public.is_space_member(space_id) and public.ledger_is_me(created_by));

alter table public.ledger_entries replica identity full;
do $$
begin
  alter publication supabase_realtime add table public.ledger_entries;
exception when duplicate_object then null;
end $$;

-- ---------- PIN 함수 ----------

-- 가족 구성원별 PIN 이 있는지 + 이 기기가 누구로 풀려 있는지
create or replace function public.ledger_status(p_space uuid)
returns table (member_id uuid, has_pin boolean, is_me boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_space_member(p_space) then raise exception 'not a member'; end if;
  return query
    select m.id,
           exists (select 1 from public.member_pins p where p.member_id = m.id),
           exists (select 1 from public.member_devices d where d.member_id = m.id and d.user_id = auth.uid())
      from public.members m where m.space_id = p_space;
end $$;

-- PIN 확인 (틀린 횟수 기록을 남기려고 오류 대신 결과 문자열을 돌려줌)
-- 결과: 'ok' | 'wrong' | 'locked' | 'no_pin'
create or replace function public.ledger_check_pin(p_member uuid, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare r public.member_pins;
begin
  select * into r from public.member_pins where member_id = p_member for update;
  if not found then return 'no_pin'; end if;
  if not public.is_space_member(r.space_id) then raise exception 'not a member'; end if;
  if r.locked_until is not null and r.locked_until > now() then return 'locked'; end if;
  if r.pin_hash = crypt(coalesce(p_pin, ''), r.pin_hash) then
    update public.member_pins set failed_count = 0, locked_until = null where member_id = p_member;
    return 'ok';
  end if;
  update public.member_pins
     set failed_count = case when r.failed_count + 1 >= 5 then 0 else r.failed_count + 1 end,
         locked_until = case when r.failed_count + 1 >= 5 then now() + interval '5 minutes' else null end
   where member_id = p_member;
  return case when r.failed_count + 1 >= 5 then 'locked' else 'wrong' end;
end $$;

-- 이 기기를 그 구성원으로 기록 (기기 하나 = 한 사람)
create or replace function public.ledger_bind(p_member uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.member_devices (user_id, member_id, space_id)
  select auth.uid(), m.id, m.space_id from public.members m where m.id = p_member
  on conflict (user_id, space_id) do update set member_id = excluded.member_id, created_at = now();
$$;
revoke execute on function public.ledger_bind(uuid) from public, anon, authenticated;

-- PIN 으로 열기
create or replace function public.ledger_unlock(p_member uuid, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
declare res text;
begin
  res := public.ledger_check_pin(p_member, p_pin);
  if res = 'ok' then perform public.ledger_bind(p_member); end if;
  return res;
end $$;

-- PIN 만들기/바꾸기. 처음 만들 땐 p_old 없이, 바꿀 땐 지금 PIN 필요.
-- 바꾸면 다른 기기에서 열려 있던 것은 모두 잠겨요.
-- 결과: 'ok' | 'wrong' | 'locked' | 'bad_pin'
create or replace function public.ledger_set_pin(p_member uuid, p_pin text, p_old text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v_space uuid; res text;
begin
  select space_id into v_space from public.members where id = p_member;
  if v_space is null or not public.is_space_member(v_space) then raise exception 'not a member'; end if;
  if p_pin is null or p_pin !~ '^[0-9]{4}$' then return 'bad_pin'; end if;
  if exists (select 1 from public.member_pins where member_id = p_member) then
    res := public.ledger_check_pin(p_member, p_old);
    if res <> 'ok' then return res; end if;
    update public.member_pins set pin_hash = crypt(p_pin, gen_salt('bf')), failed_count = 0, locked_until = null, updated_at = now()
     where member_id = p_member;
    delete from public.member_devices where member_id = p_member and user_id <> auth.uid();
  else
    insert into public.member_pins (member_id, space_id, pin_hash) values (p_member, v_space, crypt(p_pin, gen_salt('bf')));
  end if;
  perform public.ledger_bind(p_member);
  return 'ok';
end $$;

-- 이 기기 잠그기
create or replace function public.ledger_lock(p_space uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.member_devices where user_id = auth.uid() and space_id = p_space;
$$;

revoke execute on function public.ledger_check_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.ledger_status(uuid) to authenticated;
grant execute on function public.ledger_unlock(uuid, text) to authenticated;
grant execute on function public.ledger_set_pin(uuid, text, text) to authenticated;
grant execute on function public.ledger_lock(uuid) to authenticated;
