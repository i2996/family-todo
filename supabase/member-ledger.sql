-- 구성원 권한: 가계부 탭 보기 (끄면 그 사람 폰에서 가계부 탭이 사라져요). 여러 번 실행해도 안전해요.
alter table public.members add column if not exists can_ledger boolean not null default true;
