-- ============================================================
-- 먹거리(반찬 + 간식) 추가 스키마
-- schema.sql 을 실행한 뒤, SQL Editor 에 이 파일을 통째로 붙여넣고 Run 하세요.
-- 여러 번 실행해도 안전합니다.
-- ============================================================

-- 반찬/간식 재고
create table if not exists public.food_items (
  id               uuid primary key default gen_random_uuid(),
  space_id         uuid not null references public.spaces(id) on delete cascade,
  kind             text not null default 'banchan' check (kind in ('banchan', 'snack')),
  name             text not null,
  servings         int  not null default 1 check (servings >= 0),   -- 반찬: 남은 끼분 / 간식: 남은 개수
  storage          text not null default 'fridge' check (storage in ('room', 'fridge', 'frozen')),
  delivered_date   date not null default current_date,               -- 배달일 / 구입일
  shelf_life_days  int check (shelf_life_days is null or shelf_life_days >= 0),  -- null 이면 기한 없음
  created_at       timestamptz not null default now()
);
create index if not exists food_items_space_idx on public.food_items(space_id, kind);

-- 주간 식단: 어느 날 어떤 반찬을 먹을지 (반찬만 사용)
create table if not exists public.food_plan (
  item_id    uuid not null references public.food_items(id) on delete cascade,
  plan_date  date not null,
  space_id   uuid not null references public.spaces(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, plan_date)
);
create index if not exists food_plan_space_idx on public.food_plan(space_id, plan_date);

alter table public.food_items enable row level security;
alter table public.food_plan  enable row level security;

drop policy if exists food_items_all on public.food_items;
create policy food_items_all on public.food_items for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

drop policy if exists food_plan_all on public.food_plan;
create policy food_plan_all on public.food_plan for all to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));

alter table public.food_items replica identity full;
alter table public.food_plan  replica identity full;

do $$
declare t text;
begin
  foreach t in array array['food_items', 'food_plan'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
