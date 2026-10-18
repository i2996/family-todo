-- 구성원별 권한 체크 (해동 알림 받기 / 구매 요청 승인) — '부모' 설정을 대체합니다.
-- 여러 번 실행해도 안전하고, 예전에 '부모'로 표시해둔 사람은 두 권한이 자동으로 켜져요.

alter table public.members add column if not exists can_thaw    boolean not null default false;  -- 해동 알림 받기
alter table public.members add column if not exists can_approve boolean not null default false;  -- 구매 요청 승인

-- 예전 '부모' 표시를 새 권한으로 옮김
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'members' and column_name = 'is_parent') then
    update public.members set can_thaw = true, can_approve = true where is_parent;
  end if;
end $$;

-- 해동 할 일 자동 등록용 이름표 (food-thaw.sql 을 안 돌렸어도 여기서 같이 만들어져요)
alter table public.tasks add column if not exists source_key text;
create unique index if not exists tasks_source_key_idx on public.tasks (space_id, source_key);
