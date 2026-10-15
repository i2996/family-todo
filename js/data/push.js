// 웹 푸시 알림 구독 (브라우저 API + Supabase 에 구독 정보 저장)
import { supabase, unwrap } from './client.js';
import * as config from '../config.js'; // 옛 config.js 에 VAPID 줄이 없어도 앱이 멈추지 않게 namespace import

const vapidKey = () => String(config.VAPID_PUBLIC_KEY || '').trim();
export const pushConfigured = () => !!vapidKey() && !vapidKey().includes('YOUR-');
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushPermission = () => (pushSupported() ? Notification.permission : 'unsupported');

function keyToBytes(b64) {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

/** 서비스 워커가 준비될 때까지 잠깐 기다림 (안 되면 안내 메시지) */
async function registration() {
  const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('앱 준비가 덜 됐어요. 새로고침한 뒤 다시 눌러주세요.')), 5000));
  return Promise.race([navigator.serviceWorker.ready, timeout]);
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  try {
    return await (await registration()).pushManager.getSubscription();
  } catch {
    return null;
  }
}

async function save(spaceId, memberId, sub) {
  const j = sub.toJSON();
  unwrap(
    await supabase
      .from('push_subscriptions')
      .upsert({ endpoint: j.endpoint, space_id: spaceId, member_id: memberId, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' })
  );
}

export async function enablePush(spaceId, memberId) {
  if (!pushSupported()) throw new Error('이 브라우저는 알림을 지원하지 않아요.');
  if (!pushConfigured()) throw new Error('알림 서버 설정(VAPID 키)이 아직 안 되어 있어요.');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('알림이 허용되지 않았어요. 브라우저의 사이트 설정에서 알림을 허용해주세요.');
  const reg = await registration();
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey()) }));
  await save(spaceId, memberId, sub);
}

export async function disablePush() {
  const sub = await currentSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  unwrap(await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint));
}

/**
 * 앱을 열 때 / 이 기기 주인이 바뀔 때 서버의 구독 정보를 최신으로 맞춘다.
 * 브라우저가 구독을 잃어버렸어도(업데이트, 사이트 데이터 삭제 등) 알림을 켜둔 기기(resubscribe)는 알아서 다시 구독한다.
 * 반환: 'existing' | 'resubscribed' | 'none'
 */
export async function syncPush(spaceId, memberId, resubscribe = false) {
  if (!pushSupported() || !pushConfigured() || Notification.permission !== 'granted' || !memberId) return 'none';
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  let result = 'existing';
  if (!sub) {
    if (!resubscribe) return 'none';
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidKey()) });
    result = 'resubscribed';
  }
  await save(spaceId, memberId, sub);
  return result;
}

/** 서버 없이 이 기기에서만 알림이 뜨는지 확인 */
export async function showLocalTest() {
  const reg = await registration();
  await reg.showNotification('우리 가족', { body: '알림이 잘 와요 🎉', icon: new URL('icons/icon-192.png', document.baseURI).href });
}
