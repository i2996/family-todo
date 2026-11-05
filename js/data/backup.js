// JSON 백업 / 복원
import { supabase, unwrap } from './client.js';
import * as membersDb from './members.js';
import * as tasksDb from './tasks.js';
import * as tripsDb from './trips.js';
import * as foodDb from './food.js';
import * as eventsDb from './events.js';
import * as purchasesDb from './purchases.js';
import * as plansDb from './plans.js';
import * as settingsDb from './settings.js';

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
    try {
      food.food_days = await foodDb.listDays(sid);
    } catch {
      /* food-outing.sql 을 아직 안 돌린 경우 */
    }
  } catch {
    /* food.sql 을 아직 안 돌린 경우: 먹거리는 빼고 백업 */
  }
  let ev = {};
  try {
    ev = { events: await eventsDb.listEvents(sid) };
  } catch {
    /* events.sql 을 아직 안 돌린 경우: 일정은 빼고 백업 */
  }
  let plan = {};
  try {
    plan = { trip_plans: await plansDb.listPlans(sid) };
  } catch {
    /* plans.sql 을 아직 안 돌린 경우 */
  }
  let buy = {};
  try {
    buy = { purchases: await purchasesDb.listPurchases(sid) };
  } catch {
    /* purchases.sql 을 아직 안 돌린 경우 */
  }
  let cfg = {};
  try {
    // 가족 공용 설정 (직접 추가한 공휴일, 해동 알림 설정 등). 구성원 id 는 들어 있지 않아요
    cfg = { space_settings: (await settingsDb.listSettings(sid)).map((r) => ({ key: r.key, value: r.value })) };
  } catch {
    /* space-settings.sql 을 아직 안 돌린 경우 */
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
    ...ev,
    ...buy,
    ...plan,
    ...cfg,
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
export async function importAll(sid, data, { includeFood = false, includeEvents = false, includePurchases = false, includePlans = false, includeSettings = false } = {}) {
  if (!data || data.app !== 'family-todo' || !Array.isArray(data.members) || !Array.isArray(data.tasks)) {
    throw new Error('가족 할 일 백업 파일이 아니에요.');
  }
  const memberMap = new Map();
  const tripMap = new Map();
  const taskMap = new Map();

  const members = data.members.map((m, i) => {
    const id = crypto.randomUUID();
    memberMap.set(m.id, id);
    const thaw = m.can_thaw ?? m.is_parent; // 예전 백업의 '부모' 표시는 두 권한으로 이어받음
    const approve = m.can_approve ?? m.is_parent;
    return { id, space_id: sid, name: m.name, color: m.color || '#b9a4f0', sort_order: m.sort_order ?? i, ...(thaw ? { can_thaw: true } : {}), ...(approve ? { can_approve: true } : {}), ...(m.can_ledger === false ? { can_ledger: false } : {}) };
  });
  const trips = (data.trips || []).map((t) => {
    const id = crypto.randomUUID();
    tripMap.set(t.id, id);
    return {
      id,
      space_id: sid,
      ...pick(t, ['title', 'icon', 'start_date', 'end_date', 'place', 'memo']),
      ...(includeEvents ? { created_by: memberMap.get(t.created_by) || null } : {}),
    };
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
      ...(t.task_time ? { task_time: t.task_time } : {}), // 시간 (tasks-time.sql 적용 후 백업에만 있음)
      ...(Array.isArray(t.remind_offsets) && t.remind_offsets.length ? { remind_offsets: t.remind_offsets } : {}), // 시간 맞춘 알림
      ...(t.source_key ? { source_key: t.source_key } : {}),
      done: !!t.done,
      assignee_ids: (Array.isArray(t.assignee_ids) ? t.assignee_ids : t.assignee_id ? [t.assignee_id] : [])
        .map((id) => memberMap.get(id))
        .filter(Boolean),
      done_by: memberMap.get(t.done_by) || null,
      trip_id: tripMap.get(t.trip_id) || null,
    };
  });
  const completions = (data.task_completions || [])
    .filter((c) => taskMap.has(c.task_id))
    .map((c) => ({
      task_id: taskMap.get(c.task_id),
      space_id: sid,
      occurrence_date: c.occurrence_date,
      done_by: memberMap.get(c.done_by) || null,
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
      .map((p) => ({ item_id: foodMap.get(p.item_id), plan_date: p.plan_date, space_id: sid, ...(p.eaten ? { eaten: true } : {}) }));
    unwrap(await supabase.from('food_items').delete().eq('space_id', sid));
    if (foodItems.length) unwrap(await supabase.from('food_items').insert(foodItems));
    if (foodPlan.length) unwrap(await supabase.from('food_plan').insert(foodPlan));
    if (Array.isArray(data.food_days)) {
      try {
        unwrap(await supabase.from('food_days').delete().eq('space_id', sid));
        const days = data.food_days.map((d) => ({ space_id: sid, plan_date: d.plan_date, kind: d.kind || 'out' }));
        if (days.length) unwrap(await supabase.from('food_days').insert(days));
      } catch {
        /* food-outing.sql 을 아직 안 돌린 경우: 외식 표시는 건너뜀 */
      }
    }
  }

  // 일정: 백업에 일정이 들어 있을 때만 교체
  if (includeEvents && Array.isArray(data.events)) {
    const rows = data.events.map((ev) => ({
      id: crypto.randomUUID(),
      space_id: sid,
      title: ev.title,
      start_date: ev.start_date,
      end_date: ev.end_date ?? null,
      start_time: ev.start_time ?? null,
      place: ev.place ?? null,
      memo: ev.memo ?? null,
      created_by: memberMap.get(ev.created_by) || null,
      // 공유 대상 (events-share.sql 적용 후 백업에만 있음)
      ...(Array.isArray(ev.shared_with) ? { shared_with: ev.shared_with.map((m) => memberMap.get(m)).filter(Boolean) } : {}),
      ...(Array.isArray(ev.remind_offsets) && ev.remind_offsets.length ? { remind_offsets: ev.remind_offsets } : {}), // 시간 맞춘 알림
      // 반복 (events-repeat.sql 적용 후 백업에만 있음)
      ...(ev.repeat_freq
        ? {
            repeat_freq: ev.repeat_freq, repeat_end: ev.repeat_end ?? null, repeat_last_day: !!ev.repeat_last_day,
            repeat_month_week: ev.repeat_month_week ?? null, repeat_shift: ev.repeat_shift || 'none', repeat_skip: ev.repeat_skip || [],
          }
        : {}),
    }));
    unwrap(await supabase.from('events').delete().eq('space_id', sid));
    if (rows.length) unwrap(await supabase.from('events').insert(rows));
  }

  // 구매 목록: 백업에 들어 있을 때만 교체
  if (includePurchases && Array.isArray(data.purchases)) {
    const rows = data.purchases.map((p) => ({
      id: crypto.randomUUID(),
      space_id: sid,
      title: p.title,
      category: p.category || 'etc',
      memo: p.memo ?? null,
      status: p.status || 'pending',
      requested_by: memberMap.get(p.requested_by) || null,
      decided_by: memberMap.get(p.decided_by) || null,
      decided_at: p.decided_at ?? null,
    }));
    unwrap(await supabase.from('purchases').delete().eq('space_id', sid));
    if (rows.length) unwrap(await supabase.from('purchases').insert(rows));
  }

  // 계획(날짜 미정 외출·여행): 백업에 들어 있을 때만 교체
  if (includePlans && Array.isArray(data.trip_plans)) {
    const rows = data.trip_plans.map((p) => ({
      id: crypto.randomUUID(),
      space_id: sid,
      title: p.title,
      memo: p.memo ?? null,
      created_by: memberMap.get(p.created_by) || null,
    }));
    unwrap(await supabase.from('trip_plans').delete().eq('space_id', sid));
    if (rows.length) unwrap(await supabase.from('trip_plans').insert(rows));
  }

  // 가족 공용 설정: 백업에 들어 있을 때만 교체
  if (includeSettings && Array.isArray(data.space_settings)) {
    const now = new Date().toISOString();
    const rows = data.space_settings.filter((r) => r && r.key).map((r) => ({ space_id: sid, key: r.key, value: r.value ?? null, updated_at: now }));
    unwrap(await supabase.from('space_settings').delete().eq('space_id', sid));
    if (rows.length) unwrap(await supabase.from('space_settings').insert(rows));
  }
}
