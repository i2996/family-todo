// 시간 맞춘 알림 예약표 (reminders.sql). 보내는 건 서버가 1분마다 함
import { supabase, unwrap } from './client.js';

/** 아직 안 보낸 앞으로의 알림 */
export const listPending = async (sid, nowIso) =>
  unwrap(await supabase.from('reminders').select('*').eq('space_id', sid).is('sent_at', null).gt('fire_at', nowIso));

/** 넣기 (이미 있는 것은 건너뜀: 여러 기기가 동시에 맞춰도 중복 없음) */
export async function insertMany(sid, rows) {
  for (let i = 0; i < rows.length; i += 500)
    unwrap(
      await supabase
        .from('reminders')
        .upsert(rows.slice(i, i + 500).map((r) => ({ ...r, space_id: sid })), { onConflict: 'ref_id,occ_date,offset_min', ignoreDuplicates: true })
    );
}

export async function deleteIds(ids) {
  for (let i = 0; i < ids.length; i += 200) unwrap(await supabase.from('reminders').delete().in('id', ids.slice(i, i + 200)));
}
