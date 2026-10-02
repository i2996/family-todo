// Supabase 클라이언트 + 익명 세션 (회원가입 없이 기기마다 자동 발급)
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../config.js';

export const isConfigured =
  SUPABASE_URL && !SUPABASE_URL.includes('YOUR-PROJECT') && SUPABASE_ANON_KEY && !SUPABASE_ANON_KEY.includes('YOUR-ANON');

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
      realtime: { params: { eventsPerSecond: 10 } },
    })
  : null;

export async function ensureSession() {
  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user;
  const res = await supabase.auth.signInAnonymously();
  if (res.error) throw res.error;
  return res.data.user;
}

export function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}
