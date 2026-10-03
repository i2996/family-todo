// 실시간 구독: 가족 공간의 어떤 테이블이든 바뀌면 onChange(tableName) 호출
// 먹거리 테이블은 별도 채널로 구독한다. food.sql 을 아직 실행 안 했어도 할 일/여행 동기화는 정상 동작.
import { supabase } from './client.js';

const CORE_TABLES = ['members', 'tasks', 'trips', 'task_completions'];
const FOOD_TABLES = ['food_items', 'food_plan'];

function open(name, sid, tables, onChange) {
  const channel = supabase.channel(name);
  for (const table of tables) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `space_id=eq.${sid}` }, () =>
      onChange(table)
    );
  }
  channel.subscribe();
  return channel;
}

export function subscribeSpace(sid, onChange) {
  const channels = [
    open(`space:${sid}`, sid, CORE_TABLES, onChange),
    open(`food:${sid}`, sid, FOOD_TABLES, onChange),
  ];
  return () => channels.forEach((c) => supabase.removeChannel(c));
}
