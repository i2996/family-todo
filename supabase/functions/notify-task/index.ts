// 새 할 일이 배정되면 해당 가족의 폰으로 웹 푸시 알림을 보내는 함수
// DB 트리거(supabase/push.sql)가 호출한다. 배포: npx supabase functions deploy notify-task --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';
import { pickRecipients, buildMessage } from './logic.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method not allowed' }, 405);
  // DB 트리거만 호출할 수 있게 비밀 문자열 확인 (WEBHOOK_SECRET)
  if (req.headers.get('x-webhook-secret') !== Deno.env.get('WEBHOOK_SECRET')) return json({ ok: false, error: 'forbidden' }, 403);

  const body = await req.json();
  const task = body.row ?? body.task; // 새 형식(row: 일정·여행 포함) / 옛 형식(task)
  if (!task || !task.space_id) return json({ ok: false, error: 'no task' }, 400);

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
  const { data: members, error: mErr } = await supabase.from('members').select('id,name').eq('space_id', task.space_id);
  if (mErr) return json({ ok: false, error: mErr.message }, 500);

  const recipients = pickRecipients({ kind: body.kind, task, added: body.added, memberIds: members.map((m) => m.id) });
  if (!recipients.length) return json({ ok: true, sent: 0, note: 'no recipients' });

  const { data: subs, error: sErr } = await supabase
    .from('push_subscriptions')
    .select('endpoint,p256dh,auth')
    .eq('space_id', task.space_id)
    .in('member_id', recipients);
  if (sErr) return json({ ok: false, error: sErr.message }, 500);
  if (!subs.length) return json({ ok: true, sent: 0, note: 'no subscriptions' });

  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com',
    Deno.env.get('VAPID_PUBLIC_KEY'),
    Deno.env.get('VAPID_PRIVATE_KEY'),
  );
  // 구매 요청 알림은 '처리한 사람(decided_by)', 나머지는 '만든 사람(created_by)'을 문구에 표시
  const creator = members.find((m) => m.id === (body.kind === 'purchase' ? task.decided_by : task.created_by));
  const payload = JSON.stringify(buildMessage({ kind: body.kind, task, creatorName: creator ? creator.name : null }));

  let sent = 0;
  const dead = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
        sent++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) dead.push(s.endpoint); // 알림을 껐거나 앱을 지운 기기
        else console.error('push failed', e.statusCode, e.body);
      }
    }),
  );
  if (dead.length) await supabase.from('push_subscriptions').delete().in('endpoint', dead);
  return json({ ok: true, sent, removed: dead.length });
});
