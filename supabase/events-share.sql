-- 일정 공유 대상 지정 (여러 번 실행해도 안전해요)
-- shared_with 가 비어 있으면(null 또는 빈 배열) 지금처럼 온 가족에게 보이고,
-- 구성원 id 를 넣으면 작성자와 그 사람들에게만 보여요.
-- 먼저 events.sql 이 실행돼 있어야 해요.

alter table public.events add column if not exists shared_with uuid[];
