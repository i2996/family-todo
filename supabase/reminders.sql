-- ============================================================
-- 시간 맞춘 알림 (할 일·일정): 정각 / 10분 전 / 30분 전 / 1시간 전 / 하루 전
--  - 앱이 30일 앞까지의 알림 예약표(reminders)를 만들어 두면,
--    서버가 1분마다 시간이 된 알림을 보내요 (pg_cron → call_notify → notify-task 함수).
--  - 이미 완료한 할 일은 보내지 않아요. 30분 넘게 늦은 알림은 보내지 않고 넘겨요.
-- 먼저 push-events.sql(알림 기능), tasks-time.sql, events.sql 이 실행돼 있어야 해요.
-- notify-task 함수도 새 버전으로 다시 배포해야 알림 문구가 나와요.
-- SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- ============================================================

-- 할 일·일정마다 고른 알림 (분 단위: 0=정각, 10, 30, 60, 1440=하루 전). 비어 있으면 알림 없음
alter table public.tasks  add column if not exists remind_offsets smallint[];
alter table public.events add column if not exists remind_offsets smallint[];

-- 알림 예약표
create table if not exists public.reminders (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces(id) on delete cascade,
  ref_kind    text not null check (ref_kind in ('task', 'event')),
  ref_id      uuid not null,                                            -- 할 일 또는 일정 id
  task_id     uuid references public.tasks(id) on delete cascade,
  event_id    uuid references public.events(id) on delete cascade,
  occ_date    date not null,                                            -- 그 할 일·일정의 날짜
  offset_min  smallint not null default 0,                              -- 몇 분 전 알림인지
  fire_at     timestamptz not null,                                     -- 보낼 시각
  title       text not null,
  at_time     text,                                                     -- 'HH:MM'
  recipients  uuid[] not null default '{}',                             -- 받을 사람 (비면 온 가족)
  sent_at     timestamptz,                                              -- 보낸(또는 넘긴) 시각
  created_at  timestamptz not null default now()
);
create unique index if not exists reminders_uq on public.reminders(ref_id, occ_date, offset_min);
create index if not exists reminders_due_idx on public.reminders(fire_at) where sent_at is null;

alter table public.reminders enable row level security;
drop policy if exists reminders_all on public.reminders;
create policy reminders_all on public.reminders for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

-- 시간이 된 알림 보내기 (1분마다 실행)
create or replace function public.send_due_reminders() returns integer
language plpgsql security definer set search_path = public as $$
declare
  r public.reminders;
  n integer := 0;
begin
  -- 30분 넘게 늦은 알림은 보내지 않고 넘김 (서버가 잠깐 멈췄을 때 한꺼번에 오는 것 방지)
  update public.reminders set sent_at = now() where sent_at is null and fire_at < now() - interval '30 minutes';

  for r in
    select * from public.reminders where sent_at is null and fire_at <= now() order by fire_at for update skip locked
  loop
    update public.reminders set sent_at = now() where id = r.id;
    -- 이미 끝낸 할 일은 보내지 않음
    if r.task_id is not null and (
         exists (select 1 from public.tasks t where t.id = r.task_id and t.repeat_type is null and t.done)
      or exists (select 1 from public.task_completions c where c.task_id = r.task_id and c.occurrence_date = r.occ_date)
    ) then
      continue;
    end if;
    -- 이미 샀거나 반려된 구매 요청은 보내지 않음 (purchases-due.sql 을 돌린 뒤에만 해당)
    if (to_jsonb(r) ->> 'purchase_id') is not null and exists (
      select 1 from public.purchases p where p.id = (to_jsonb(r) ->> 'purchase_id')::uuid and p.status in ('bought', 'rejected')
    ) then
      continue;
    end if;
    begin
      perform public.call_notify(jsonb_build_object('kind', 'reminder', 'row', to_jsonb(r)));
      n := n + 1;
    exception when others then
      raise warning 'reminder notify failed: %', sqlerrm;  -- 알림이 실패해도 다음 알림은 계속
    end;
  end loop;

  -- 일주일 지난 기록 정리
  delete from public.reminders where sent_at is not null and sent_at < now() - interval '7 days';
  return n;
end $$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

-- 1분마다 실행 (Supabase 의 pg_cron)
create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('family-reminders');
exception when others then
  null;  -- 처음 실행이면 지울 예약이 없음
end $$;
select cron.schedule('family-reminders', '* * * * *', 'select public.send_due_reminders()');
