// 실시간 구독: 가족 공간의 어떤 테이블이든 바뀌면 onChange(tableName) 호출
import { supabase } from './client.js';

const TABLES = ['members', 'tasks', 'trips', 'task_completions'];

export function subscribeSpace(sid, onChange, onStatus) {
  const channel = supabase.channel(`space:${sid}`);
  for (const table of TABLES) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `space_id=eq.${sid}` }, () =>
      onChange(table)
    );
  }
  channel.subscribe((status) => onStatus && onStatus(status));
  return () => supabase.removeChannel(channel);
}
