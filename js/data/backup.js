// JSON 백업 / 복원
import { supabase, unwrap } from './client.js';
import * as membersDb from './members.js';
import * as tasksDb from './tasks.js';
import * as tripsDb from './trips.js';
import * as foodDb from './food.js';

export async function exportAll(space) {
  const sid = space.id;
  const [members, trips, tasks, completions] = await Promise.all([
    membersDb.listMembers(sid),
    tripsDb.listTrips(sid),
    tasksDb.listTasks(sid),
    tasksDb.listCompletions(sid),
  ]);
  let food = {};
  try {
    const [food_items, food_plan] = await Promise.all([foodDb.listFood(sid), foodDb.listPlan(sid)]);
    food = { food_items, food_plan };
  } catch {
    /* food.sql 을 아직 안 돌린 경우: 먹거리는 빼고 백업 */
  }
  return {
    app: 'family-todo',
    version: 1,
    exported_at: new Date().toISOString(),
    space: { name: space.name },
    members,
    trips,
    tasks,
    task_completions: completions,
    ...food,
  };
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, obj[k] ?? null]));

/** 현재 공간의 데이터를 모두 지우고 백업 내용으로 교체 (id 는 새로 발급해서 충돌 방지) */
export async function importAll(sid, data, { includeFood = false } = {}) {
  if (!data || data.app !== 'family-todo' || !Array.isArray(data.members) || !Array.isArray(data.tasks)) {
    throw new Error('가족 할 일 백업 파일이 아니에요.');
  }
  const memberMap = new Map();
  const tripMap = new Map();
  const taskMap = new Map();

  const members = data.members.map((m, i) => {
    const id = crypto.randomUUID();
    memberMap.set(m.id, id);
    return { id, space_id: sid, name: m.name, color: m.color || '#b9a4f0', sort_order: m.sort_order ?? i };
  });
  const trips = (data.trips || []).map((t) => {
    const id = crypto.randomUUID();
    tripMap.set(t.id, id);
    return { id, space_id: sid, ...pick(t, ['title', 'icon', 'start_date', 'end_date', 'place', 'memo']) };
  });
  const tasks = data.tasks.map((t) => {
    const id = crypto.randomUUID();
    taskMap.set(t.id, id);
    return {
      id,
      space_id: sid,
      ...pick(t, [
        'title', 'task_date', 'start_date', 'due_date', 'memo', 'repeat_type', 'repeat_days', 'repeat_end', 'done_at',
      ]),
      repeat_interval: t.repeat_interval || 1,
      done: !!t.done,
      assignee_id: memberMap.get(t.assignee_id) || null,
      trip_id: tripMap.get(t.trip_id) || null,
    };
  });
  const completions = (data.task_completions || [])
    .filter((c) => taskMap.has(c.task_id))
    .map((c) => ({
      task_id: taskMap.get(c.task_id),
      space_id: sid,
      occurrence_date: c.occurrence_date,
      completed_at: c.completed_at || new Date().toISOString(),
    }));

  // 기존 데이터 삭제 (tasks 삭제 시 completions 도 함께 삭제됨)
  unwrap(await supabase.from('tasks').delete().eq('space_id', sid));
  unwrap(await supabase.from('trips').delete().eq('space_id', sid));
  unwrap(await supabase.from('members').delete().eq('space_id', sid));

  if (members.length) unwrap(await supabase.from('members').insert(members));
  if (trips.length) unwrap(await supabase.from('trips').insert(trips));
  if (tasks.length) unwrap(await supabase.from('tasks').insert(tasks));
  if (completions.length) unwrap(await supabase.from('task_completions').insert(completions));

  // 먹거리: 백업에 먹거리 데이터가 있을 때만 교체 (옛 백업이면 지금 먹거리는 그대로 둠)
  if (includeFood && Array.isArray(data.food_items)) {
    const foodMap = new Map();
    const foodItems = data.food_items.map((f) => {
      const id = crypto.randomUUID();
      foodMap.set(f.id, id);
      return {
        id,
        space_id: sid,
        kind: f.kind || 'banchan',
        name: f.name,
        servings: f.servings ?? 1,
        storage: f.storage || 'fridge',
        delivered_date: f.delivered_date,
        shelf_life_days: f.shelf_life_days ?? null,
      };
    });
    const foodPlan = (data.food_plan || [])
      .filter((p) => foodMap.has(p.item_id))
      .map((p) => ({ item_id: foodMap.get(p.item_id), plan_date: p.plan_date, space_id: sid }));
    unwrap(await supabase.from('food_items').delete().eq('space_id', sid));
    if (foodItems.length) unwrap(await supabase.from('food_items').insert(foodItems));
    if (foodPlan.length) unwrap(await supabase.from('food_plan').insert(foodPlan));
  }
}
