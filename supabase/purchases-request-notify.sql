-- 새 구매 요청이 오면 승인 권한자에게 알림 (purchases.sql 을 이미 실행한 경우 이것만 실행하세요)
-- 먼저 push-events.sql 이 실행돼 있어야 해요. 여러 번 실행해도 안전해요.

-- 새 구매 요청(승인 대기)이 올라오면 승인 권한이 있는 사람에게 알림
create or replace function public.notify_purchase_requested() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  if new.status = 'pending' and new.requested_by is not null then
    begin
      perform public.call_notify(jsonb_build_object('kind', 'purchase_request', 'row', to_jsonb(new)));
    exception when others then
      null;   -- 알림이 실패해도 요청 저장은 절대 막지 않음
    end;
  end if;
  return new;
end $$;

drop trigger if exists purchases_notify_insert on public.purchases;
create trigger purchases_notify_insert after insert on public.purchases
  for each row execute function public.notify_purchase_requested();
