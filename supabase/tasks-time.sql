-- 할 일 시간 지정 (선택). 여러 번 실행해도 안전해요.
alter table public.tasks add column if not exists task_time time;
