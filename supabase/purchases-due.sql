-- ============================================================
-- 구매 요청 '필요한 날' + 전날 저녁 알림
--  - purchases.need_date: 언제까지 필요한지 (선택)
--  - 필요한 날 전날 저녁 8시에 승인 권한자·요청자에게 알림 (이미 샀거나 반려된 건 안 보냄)
-- 먼저 purchases.sql, reminders.sql 이 실행돼 있어야 해요. 여러 번 실행해도 안전해요.
-- ============================================================

alter table public.purchases add column if not exists need_date date;

-- 알림 예약표에 구매 요청도 넣을 수 있게
alter table public.reminders add column if not exists purchase_id uuid references public.purchases(id) on delete cascade;
alter table public.reminders drop constraint if exists reminders_ref_kind_check;
alter table public.reminders add constraint reminders_ref_kind_check check (ref_kind in ('task', 'event', 'purchase'));

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
