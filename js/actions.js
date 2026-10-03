// 서비스 계층: UI 는 DB 를 직접 부르지 않고 여기 함수만 호출한다.
// (DB 호출 → 상태 갱신 → 화면 갱신 순서를 한 곳에서 관리)
import { state, set } from './state.js';
import * as spacesDb from './data/spaces.js';
import * as membersDb from './data/members.js';
import * as tasksDb from './data/tasks.js';
import * as tripsDb from './data/trips.js';
import * as foodDb from './data/food.js';
import * as backupDb from './data/backup.js';
import { isRecurring } from './logic/recurrence.js';

const sid = () => state.space.id;

/* ---------- 불러오기 ---------- */
export async function loadAll() {
  const [members, trips, tasks, completions, food] = await Promise.all([
    membersDb.listMembers(sid()),
    tripsDb.listTrips(sid()),
    tasksDb.listTasks(sid()),
    tasksDb.listCompletions(sid()),
    loadFood(),
  ]);
  set({ members, trips, tasks, completions, ...food });
}

/** 먹거리 테이블(food.sql)이 아직 없어도 나머지 앱은 정상 동작하도록 따로 불러온다 */
async function loadFood() {
  try {
    const [foodItems, foodPlan] = await Promise.all([foodDb.listFood(sid()), foodDb.listPlan(sid())]);
    return { foodItems, foodPlan, foodReady: true };
  } catch (e) {
    console.warn('먹거리 데이터를 불러오지 못했어요 (supabase/food.sql 실행 필요)', e);
    return { foodItems: [], foodPlan: [], foodReady: false };
  }
}

export async function refresh(table) {
  if (!state.space) return;
  switch (table) {
    case 'members': return set({ members: await membersDb.listMembers(sid()) });
    case 'trips': return set({ trips: await tripsDb.listTrips(sid()) });
    case 'tasks': return set({ tasks: await tasksDb.listTasks(sid()) });
    case 'task_completions': return set({ completions: await tasksDb.listCompletions(sid()) });
    case 'food_items':
    case 'food_plan': return set(await loadFood());
    default: return loadAll();
  }
}

/* ---------- 가족 공간 ---------- */
export async function renameSpace(name) {
  set({ space: await spacesDb.renameSpace(sid(), name) });
}
export const changePassword = (pw) => spacesDb.changePassword(sid(), pw);

/* ---------- 구성원 ---------- */
export async function addMember(p) {
  const sort_order = state.members.length ? Math.max(...state.members.map((m) => m.sort_order)) + 1 : 0;
  const row = await membersDb.insertMember(sid(), { ...p, sort_order });
  set({ members: [...state.members, row] });
}
export async function addDefaultMembers() {
  const defaults = [
    ['나', '#b9a4f0'], ['남편', '#7fbfe8'], ['첫째', '#6fcfb0'], ['둘째', '#f5a97a'],
  ];
  for (const [name, color] of defaults) await addMember({ name, color });
}
export async function saveMember(id, p) {
  const row = await membersDb.updateMember(id, p);
  set({ members: state.members.map((m) => (m.id === id ? row : m)) });
}
export async function removeMember(id) {
  await membersDb.deleteMember(id);
  set({
    members: state.members.filter((m) => m.id !== id),
    tasks: state.tasks.map((t) => ({
      ...t,
      assignee_ids: (t.assignee_ids || []).filter((x) => x !== id),
      done_by: t.done_by === id ? null : t.done_by,
    })),
    completions: state.completions.map((c) => (c.done_by === id ? { ...c, done_by: null } : c)),
  });
}

/* ---------- 할 일 ---------- */
export async function addTask(p) {
  const row = await tasksDb.insertTask(sid(), p);
  set({ tasks: [...state.tasks, row] });
}
export async function saveTask(id, p) {
  const row = await tasksDb.updateTask(id, p);
  set({ tasks: state.tasks.map((t) => (t.id === id ? row : t)) });
}
export async function removeTask(id) {
  await tasksDb.deleteTask(id);
  set({ tasks: state.tasks.filter((t) => t.id !== id), completions: state.completions.filter((c) => c.task_id !== id) });
}

/** 체크 토글 - 화면은 먼저 바꾸고(낙관적 업데이트) 실패하면 서버 상태로 되돌린다. doneBy: 체크한 사람 */
export async function toggleOccurrence(taskId, date, doneBy = null) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  try {
    if (isRecurring(t)) {
      const exists = state.completions.some((c) => c.task_id === taskId && c.occurrence_date === date);
      const done = !exists;
      set({
        completions: done
          ? [...state.completions, { task_id: taskId, occurrence_date: date, space_id: sid(), done_by: doneBy }]
          : state.completions.filter((c) => !(c.task_id === taskId && c.occurrence_date === date)),
      });
      await tasksDb.setOccurrenceDone(sid(), taskId, date, done, doneBy);
    } else {
      const done = !t.done;
      set({ tasks: state.tasks.map((x) => (x.id === taskId ? { ...x, done, done_by: done ? doneBy : null } : x)) });
      await tasksDb.setSingleDone(taskId, done, doneBy);
    }
  } catch (e) {
    await loadAll();
    throw e;
  }
}

/* ---------- 외출 / 여행 ---------- */
export async function addTrip(p) {
  const row = await tripsDb.insertTrip(sid(), p);
  set({ trips: [...state.trips, row].sort((a, b) => a.start_date.localeCompare(b.start_date)) });
  return row;
}
export async function saveTrip(id, p) {
  const row = await tripsDb.updateTrip(id, p);
  set({ trips: state.trips.map((t) => (t.id === id ? row : t)).sort((a, b) => a.start_date.localeCompare(b.start_date)) });
}
export async function removeTrip(id, { deleteTasks }) {
  if (deleteTasks) await tasksDb.deleteTasksOfTrip(id);
  await tripsDb.deleteTrip(id);
  set({
    trips: state.trips.filter((t) => t.id !== id),
    tasks: deleteTasks
      ? state.tasks.filter((t) => t.trip_id !== id)
      : state.tasks.map((t) => (t.trip_id === id ? { ...t, trip_id: null } : t)),
    tripId: state.tripId === id ? null : state.tripId,
  });
}

/* ---------- 먹거리 (반찬 · 간식) ---------- */
export async function addFoodItem(p) {
  const row = await foodDb.insertFood(sid(), p);
  set({ foodItems: [...state.foodItems, row] });
}
export async function saveFoodItem(id, p) {
  const row = await foodDb.updateFood(id, p);
  set({ foodItems: state.foodItems.map((i) => (i.id === id ? row : i)) });
}
export async function removeFoodItem(id) {
  await foodDb.deleteFood(id);
  set({ foodItems: state.foodItems.filter((i) => i.id !== id), foodPlan: state.foodPlan.filter((r) => r.item_id !== id) });
}
/** '먹음' - 1끼/1개 줄이고, 0이 되면 목록에서 지운다. 반환: 'ok' | 'removed' */
export async function eatFoodItem(id) {
  const it = state.foodItems.find((i) => i.id === id);
  if (!it) return 'none';
  if (it.servings <= 1) {
    await removeFoodItem(id);
    return 'removed';
  }
  set({ foodItems: state.foodItems.map((i) => (i.id === id ? { ...i, servings: i.servings - 1 } : i)) });
  try {
    await foodDb.setServings(id, it.servings - 1);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
  return 'ok';
}
export async function addPlanEntry(date, itemId) {
  if (state.foodPlan.some((r) => r.item_id === itemId && r.plan_date === date)) return;
  set({ foodPlan: [...state.foodPlan, { item_id: itemId, plan_date: date, space_id: sid() }] });
  try {
    await foodDb.insertPlan(sid(), date, itemId);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
}
export async function removePlanEntry(itemId, date) {
  set({ foodPlan: state.foodPlan.filter((r) => !(r.item_id === itemId && r.plan_date === date)) });
  try {
    await foodDb.deletePlan(itemId, date);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
}
/** [from, to] 기간의 식단을 byKey({날짜: [itemId...]}) 로 통째로 교체 */
export async function regeneratePlan(from, to, byKey) {
  const rows = Object.entries(byKey).flatMap(([plan_date, ids]) => ids.map((item_id) => ({ plan_date, item_id })));
  await foodDb.replacePlan(sid(), from, to, rows);
  set({
    foodPlan: [
      ...state.foodPlan.filter((r) => r.plan_date < from || r.plan_date > to),
      ...rows.map((r) => ({ ...r, space_id: sid() })),
    ],
  });
}

/* ---------- 백업 / 복원 ---------- */
export const exportBackup = () => backupDb.exportAll(state.space);
export const downloadBackup = backupDb.downloadJson;
export async function restoreBackup(data) {
  await backupDb.importAll(sid(), data, { includeFood: state.foodReady });
  await loadAll();
}
