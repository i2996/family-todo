-- ============================================================
-- 구매 목록 (구매 요청 → 승인 권한자가 승인 → 구매예정) + 승인 결과 알림
-- 먼저 push-events.sql 이 실행돼 있어야 알림이 가요 (알림 없이도 목록은 동작).
-- SQL Editor 에 통째로 붙여넣고 Run. 여러 번 실행해도 안전해요.
-- ============================================================

create table if not exists public.purchases (
  id            uuid primary key default gen_random_uuid(),
  space_id      uuid not null references public.spaces(id) on delete cascade,
  title         text not null,
  category      text not null default 'etc' check (category in ('supplies', 'snack', 'grocery', 'etc')),  -- 생필품·간식·식재료·기타
  memo          text,
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'bought')),
  requested_by  uuid references public.members(id) on delete set null,   -- 요청한 사람
  decided_by    uuid references public.members(id) on delete set null,   -- 승인/반려한 사람
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists purchases_space_idx on public.purchases(space_id, status);

alter table public.purchases enable row level security;
drop policy if exists purchases_all on public.purchases;
create policy purchases_all on public.purchases for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

alter table public.purchases replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.purchases;
exception when duplicate_object then null;
end $$;

-- 승인/반려되면 요청한 사람에게 알림 (본인이 직접 처리한 경우는 제외)
create or replace function public.notify_purchase_decided() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if old.status = 'pending' and new.status in ('approved', 'rejected')
     and new.requested_by is not null and new.requested_by is distinct from new.decided_by then
    begin
      perform public.call_notify(jsonb_build_object('kind', 'purchase', 'row', to_jsonb(new)));
    exception when others then
      null;   -- 알림이 실패해도 승인 처리는 절대 막지 않음
    end;
  end if;
  return new;
end $$;

drop trigger if exists purchases_notify_update on public.purchases;
create trigger purchases_notify_update after update of status on public.purchases
  for each row execute function public.notify_purchase_decided();
