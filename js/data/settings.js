import { supabase, unwrap } from './client.js';

export const listSettings = async (sid) => unwrap(await supabase.from('space_settings').select('*').eq('space_id', sid));

export const saveSetting = async (sid, key, value) =>
  unwrap(
    await supabase
      .from('space_settings')
      .upsert({ space_id: sid, key, value, updated_at: new Date().toISOString() }, { onConflict: 'space_id,key' })
  );
