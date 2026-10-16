-- 식단의 '외식하는 날' 표시 (여러 번 실행해도 안전)
create table if not exists public.food_days (
  space_id    uuid not null references public.spaces(id) on delete cascade,
  plan_date   date not null,
  kind        text not null default 'out' check (kind in ('out')),
  created_at  timestamptz not null default now(),
  primary key (space_id, plan_date)
);

alter table public.food_days enable row level security;
drop policy if exists food_days_all on public.food_days;
create policy food_days_all on public.food_days for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

alter table public.food_days replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.food_days;
exception when duplicate_object then null;
end $$;
