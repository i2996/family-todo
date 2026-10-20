// 서비스 계층: UI 는 DB 를 직접 부르지 않고 여기 함수만 호출한다.
// (DB 호출 → 상태 갱신 → 화면 갱신 순서를 한 곳에서 관리)
import { state, set } from './state.js';
import * as spacesDb from './data/spaces.js';
import * as membersDb from './data/members.js';
import * as tasksDb from './data/tasks.js';
import * as tripsDb from './data/trips.js';
import * as foodDb from './data/food.js';
import * as eventsDb from './data/events.js';
import * as purchasesDb from './data/purchases.js';
import * as plansDb from './data/plans.js';
import * as settingsDb from './data/settings.js';
import * as pushDb from './data/push.js';
import * as backupDb from './data/backup.js';
import { isRecurring } from './logic/recurrence.js';
import { prefs } from './prefs.js';
import { addDays, todayISO, shortDate } from './logic/dates.js';
import * as F from './logic/food.js';

const sid = () => state.space.id;

/* ---------- 불러오기 ---------- */
export async function loadAll() {
  const [members, trips, tasks, completions, food, ev, days, buy, plan, cfg] = await Promise.all([
    membersDb.listMembers(sid()),
    tripsDb.listTrips(sid()),
    tasksDb.listTasks(sid()),
    tasksDb.listCompletions(sid()),
    loadFood(),
    loadEvents(),
    loadDays(),
    loadPurchases(),
    loadPlans(),
    loadSettings(),
  ]);
  set({ members, trips, tasks, completions, ...food, ...ev, ...days, ...buy, ...plan, ...cfg });
}

/** 가족 공용 설정 테이블(space-settings.sql)이 없어도 앱은 정상 동작 (설정은 기본값) */
async function loadSettings() {
  try {
    const rows = await settingsDb.listSettings(sid());
    return { settings: Object.fromEntries(rows.map((r) => [r.key, r.value])), settingsReady: true };
  } catch (e) {
    console.warn('가족 설정을 불러오지 못했어요 (supabase/space-settings.sql 실행 필요)', e);
    return { settings: {}, settingsReady: false };
  }
}

/** 계획 테이블(plans.sql)이 없어도 나머지 앱은 정상 동작 */
async function loadPlans() {
  try {
    return { plans: await plansDb.listPlans(sid()), plansReady: true };
  } catch (e) {
    console.warn('계획 목록을 불러오지 못했어요 (supabase/plans.sql 실행 필요)', e);
    return { plans: [], plansReady: false };
  }
}

/** 구매 목록 테이블(purchases.sql)이 없어도 나머지 앱은 정상 동작 */
async function loadPurchases() {
  try {
    return { purchases: await purchasesDb.listPurchases(sid()), purchasesReady: true };
  } catch (e) {
    console.warn('구매 목록을 불러오지 못했어요 (supabase/purchases.sql 실행 필요)', e);
    return { purchases: [], purchasesReady: false };
  }
}

/** 외식 표시 테이블(food-outing.sql)이 없어도 식단은 정상 동작 */
async function loadDays() {
  try {
    return { foodDays: await foodDb.listDays(sid()), outingReady: true };
  } catch (e) {
    console.warn('외식 표시를 불러오지 못했어요 (supabase/food-outing.sql 실행 필요)', e);
    return { foodDays: [], outingReady: false };
  }
}

/** 일정 테이블(events.sql)이 아직 없어도 나머지 앱은 정상 동작하도록 따로 불러온다 */
async function loadEvents() {
  try {
    return { events: await eventsDb.listEvents(sid()), eventsReady: true };
  } catch (e) {
    console.warn('일정 데이터를 불러오지 못했어요 (supabase/events.sql 실행 필요)', e);
    return { events: [], eventsReady: false };
  }
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
    case 'events': return set(await loadEvents());
    case 'food_days': return set(await loadDays());
    case 'purchases': return set(await loadPurchases());
    case 'trip_plans': return set(await loadPlans());
    case 'space_settings': return set(await loadSettings());
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
    events: state.events.map((e) => (e.created_by === id ? { ...e, created_by: null } : e)),
    plans: state.plans.map((p) => (p.created_by === id ? { ...p, created_by: null } : p)),
    purchases: state.purchases.map((p) => ({ ...p, requested_by: p.requested_by === id ? null : p.requested_by, decided_by: p.decided_by === id ? null : p.decided_by })),
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

/** 화면만 다시 그리기 (구매 탭 전환 등) */
export const refreshView = () => set();

/* ---------- 계획 (날짜 미정 외출·여행) ---------- */
export async function addPlan(p) {
  const row = await plansDb.insertPlan(sid(), p);
  set({ plans: [...state.plans, row] });
}
export async function savePlan(id, p) {
  const row = await plansDb.updatePlan(id, p);
  set({ plans: state.plans.map((x) => (x.id === id ? row : x)) });
}
export async function removePlan(id) {
  await plansDb.deletePlan(id);
  set({ plans: state.plans.filter((x) => x.id !== id) });
}

/* ---------- 구매 목록 ---------- */
export async function requestPurchase(p) {
  const row = await purchasesDb.insertPurchase(sid(), p);
  set({ purchases: [...state.purchases, row] });
  return row;
}
const patchPurchase = async (id, patch) => {
  const prev = state.purchases;
  set({ purchases: prev.map((x) => (x.id === id ? { ...x, ...patch } : x)) }); // 먼저 화면에 반영
  try {
    const row = await purchasesDb.updatePurchase(id, patch);
    set({ purchases: state.purchases.map((x) => (x.id === id ? { ...x, ...row } : x)) });
  } catch (e) {
    set(await loadPurchases());
    throw e;
  }
};
/** 승인/반려 (status: 'approved' | 'rejected'). 요청한 사람에게 알림이 가요 */
export const decidePurchase = (id, status, byMemberId) =>
  patchPurchase(id, { status, decided_by: byMemberId, decided_at: new Date().toISOString() });
/** 구매 목록 카테고리 → 먹거리 종류 (식재료·간식만 먹거리로 들어감) */
const FOOD_KIND_OF = { grocery: 'ingredient', snack: 'snack' };
/** 메모가 '2' 또는 '2팩'처럼 단순할 때만 수량으로 사용, 아니면 1 */
const qtyFromMemo = (memo) => {
  const m = String(memo || '').match(/^\s*(\d{1,2})\s*(개|팩|봉|봉지|병|캔|통|박스|입|판)?\s*$/);
  return m ? Math.max(1, parseInt(m[1], 10)) : 1;
};

/**
 * 구매 완료 체크 / 되돌리기.
 * 식재료·간식은 구매 완료하면 먹거리 탭(식재료/간식)에 자동으로 들어가고, 되돌리면 그 항목도 뺌.
 * 반환: { added, kind } | { removed } | { needSql } | null
 */
export async function setPurchaseBought(id, bought) {
  await patchPurchase(id, { status: bought ? 'bought' : 'approved' });
  const p = state.purchases.find((x) => x.id === id);
  const kind = p && FOOD_KIND_OF[p.category];
  if (!kind || !state.foodReady) return null;
  const linked = p.food_item_id && state.foodItems.some((i) => i.id === p.food_item_id);
  if (bought) {
    if (linked) return null; // 이미 먹거리에 들어가 있음
    try {
      const row = await addFoodItem({
        kind,
        name: p.title,
        servings: qtyFromMemo(p.memo),
        storage: kind === 'snack' ? 'room' : 'fridge',
        delivered_date: todayISO(),
        shelf_life_days: null,
      });
      await patchPurchase(id, { food_item_id: row.id }).catch(() => {}); // 연결 칸이 없어도 등록 자체는 유지
      return { added: true, kind };
    } catch (e) {
      if (/food_items_kind/.test(String(e && e.message))) return { needSql: true };
      throw e;
    }
  }
  if (linked) {
    await removeFoodItem(p.food_item_id);
    await patchPurchase(id, { food_item_id: null }).catch(() => {});
    return { removed: true };
  }
  return null;
}
export async function removePurchase(id) {
  await purchasesDb.deletePurchase(id);
  set({ purchases: state.purchases.filter((x) => x.id !== id) });
}

/* ---------- 일정 ---------- */
export async function addEvent(p) {
  const row = await eventsDb.insertEvent(sid(), p);
  set({ events: [...state.events, row] });
}
export async function saveEvent(id, p) {
  const row = await eventsDb.updateEvent(id, p);
  set({ events: state.events.map((e) => (e.id === id ? row : e)) });
}
export async function removeEvent(id) {
  await eventsDb.deleteEvent(id);
  set({ events: state.events.filter((e) => e.id !== id) });
}

/* ---------- 먹거리 (반찬 · 간식) ---------- */
export async function addFoodItem(p) {
  const row = await foodDb.insertFood(sid(), p);
  set({ foodItems: [...state.foodItems, row] });
  return row;
}
export async function saveFoodItem(id, p) {
  const row = await foodDb.updateFood(id, p);
  set({ foodItems: state.foodItems.map((i) => (i.id === id ? row : i)) });
  afterPlanChange(); // 보관(냉장/냉동)이 바뀌면 해동 할 일도 달라짐
}
export async function removeFoodItem(id) {
  await foodDb.deleteFood(id);
  set({ foodItems: state.foodItems.filter((i) => i.id !== id), foodPlan: state.foodPlan.filter((r) => r.item_id !== id) });
  afterPlanChange();
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
/**
 * 그 날 식단의 반찬을 한 번에 '먹음' 처리: 반찬마다 남은 끼분 -1 (0이 되면 목록에서 삭제), 식단에는 '먹음' 표시.
 * 반환: { count: 처리한 반찬 수, removed: 다 먹어서 지운 반찬 수 }
 */
export async function eatDay(date) {
  const rows = state.foodPlan.filter((r) => r.plan_date === date && !r.eaten && state.foodItems.some((i) => i.id === r.item_id));
  if (!rows.length) return { count: 0, removed: 0 };
  const ids = rows.map((r) => r.item_id);
  const before = state.foodItems.filter((i) => ids.includes(i.id));
  const removedIds = before.filter((i) => i.servings <= 1).map((i) => i.id);
  const keptIds = ids.filter((id) => !removedIds.includes(id));
  set({
    foodItems: state.foodItems
      .filter((i) => !removedIds.includes(i.id))
      .map((i) => (keptIds.includes(i.id) ? { ...i, servings: i.servings - 1 } : i)),
    foodPlan: state.foodPlan
      .filter((r) => !removedIds.includes(r.item_id))
      .map((r) => (r.plan_date === date && keptIds.includes(r.item_id) ? { ...r, eaten: true } : r)),
  });
  try {
    await Promise.all([
      ...before.map((i) => (i.servings <= 1 ? foodDb.deleteFood(i.id) : foodDb.setServings(i.id, i.servings - 1))),
      keptIds.length ? foodDb.markPlanEaten(date, keptIds, true) : null,
    ]);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
  if (removedIds.length) afterPlanChange();
  return { count: rows.length, removed: removedIds.length };
}

/** 하루치 '먹음' 취소: 남은 끼분을 다시 +1 하고 표시를 지움 (이미 다 먹어서 삭제된 반찬은 되돌릴 수 없음) */
export async function undoEatDay(date) {
  const rows = state.foodPlan.filter((r) => r.plan_date === date && r.eaten);
  if (!rows.length) return 0;
  const ids = rows.map((r) => r.item_id);
  const before = state.foodItems.filter((i) => ids.includes(i.id));
  set({
    foodItems: state.foodItems.map((i) => (ids.includes(i.id) ? { ...i, servings: i.servings + 1 } : i)),
    foodPlan: state.foodPlan.map((r) => (r.plan_date === date && ids.includes(r.item_id) ? { ...r, eaten: false } : r)),
  });
  try {
    await Promise.all([...before.map((i) => foodDb.setServings(i.id, i.servings + 1)), foodDb.markPlanEaten(date, ids, false)]);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
  return rows.length;
}

/* ---------- 냉동 반찬 해동 → '해동 알림 받기' 권한자에게 할 일 자동 등록 ---------- */
const thawKey = (itemId, mealDate) => `thaw:${itemId}:${mealDate}`;
/** member-perms.sql 이 적용돼 있는지 (구성원 정보에 can_thaw 칸이 있으면 적용된 것) */
export const thawSupported = () => state.members.some((m) => 'can_thaw' in m);
export const hasThawers = () => state.members.some((m) => m.can_thaw);

/**
 * 식단에서 '다음 날 냉동 반찬이 있는 날'마다 "❄️ OO 냉장 해동" 할 일을 만든다 (담당: '해동 알림 받기' 권한자, 아무도 없으면 온 가족).
 * 식단이 바뀌어 필요 없어진 해동 할 일은(아직 안 끝낸 것만) 지운다.
 */
/** 냉장 해동 할 일 자동 등록이 켜져 있는지 (설정이 없으면 켬) */
export const thawAutoOn = () => state.settings.thaw_auto?.on !== false;
const isThawTask = (t) => t.source_key && t.source_key.startsWith('thaw:');
/** 지금 지울 수 있는 해동 할 일 (아직 안 끝낸 오늘 이후 것) */
export const pendingThawTasks = () => state.tasks.filter((t) => isThawTask(t) && !t.done && t.task_date >= todayISO());

/** 켜기/끄기. 끌 때 removeExisting 이면 이미 등록된 해동 할 일도 지움 */
export async function setThawAuto(on, { removeExisting = false } = {}) {
  const before = state.settings;
  set({ settings: { ...state.settings, thaw_auto: { on } } });
  try {
    await settingsDb.saveSetting(sid(), 'thaw_auto', { on });
  } catch (e) {
    set({ settings: before });
    throw e;
  }
  if (!on && removeExisting) {
    const ids = pendingThawTasks().map((t) => t.id);
    if (ids.length) {
      await tasksDb.deleteTasks(ids);
      set({ tasks: state.tasks.filter((t) => !ids.includes(t.id)) });
    }
  }
  if (on) await syncThawTasks();
}

export async function syncThawTasks() {
  if (!state.space || !thawSupported() || !thawAutoOn()) return;
  const today = todayISO();
  const items = state.foodItems.filter((i) => i.kind === 'banchan');
  const plan = F.resolvePlan(items, state.foodPlan, today, outDates());
  const desired = new Map();
  for (let i = 1; i < plan.length; i++) {
    for (const dish of plan[i].dishes) {
      if (!dish.frozen) continue;
      desired.set(thawKey(dish.id, plan[i].date), {
        title: `❄️ ${dish.name} 냉장 해동`,
        task_date: plan[i - 1].date, // 먹기 전날에 냉장실로 옮기기
        memo: `${shortDate(plan[i].date)} 식단에 쓸 냉동 반찬이에요`,
      });
    }
  }
  const existing = state.tasks.filter((t) => t.source_key && t.source_key.startsWith('thaw:'));
  const have = new Set(existing.map((t) => t.source_key));
  const stale = existing.filter((t) => !desired.has(t.source_key) && !t.done && t.task_date >= today);
  const create = [...desired].filter(([k]) => !have.has(k));
  if (!create.length && !stale.length) return;

  const thawers = state.members.filter((m) => m.can_thaw).map((m) => m.id);
  const me = state.members.some((m) => m.id === prefs.getDeviceMember()) ? prefs.getDeviceMember() : null;
  if (create.length) {
    await tasksDb.upsertAutoTasks(
      sid(),
      create.map(([source_key, v]) => ({
        ...v,
        source_key,
        assignee_ids: thawers, // 권한자에게만 (알림도 담당자에게만 가요)
        ...(pushDb.pushConfigured() ? { created_by: me } : {}),
      }))
    );
  }
  if (stale.length) await tasksDb.deleteTasks(stale.map((t) => t.id));
  set({ tasks: await tasksDb.listTasks(sid()) });
}
const afterPlanChange = () => syncThawTasks().catch((e) => console.warn('해동 할 일 동기화 실패', e));

/** 외식하는 날 모음 */
export const outDates = () => new Set(state.foodDays.filter((d) => d.kind === 'out').map((d) => d.plan_date));

/** 그 날 식단의 (안 먹은) 반찬을 다음 날로 미룸. 다음 날이 외식이면 그다음 날로. 반환: { count, target } */
export async function postponeDay(date) {
  const outs = outDates();
  let target = addDays(date, 1);
  for (let i = 0; i < 14 && outs.has(target); i++) target = addDays(target, 1);
  const rows = state.foodPlan.filter((r) => r.plan_date === date && !r.eaten && state.foodItems.some((i) => i.id === r.item_id));
  if (!rows.length) return { count: 0, target };
  const ids = rows.map((r) => r.item_id);
  const have = new Set(state.foodPlan.filter((r) => r.plan_date === target).map((r) => r.item_id));
  set({
    foodPlan: [
      ...state.foodPlan.filter((r) => !(r.plan_date === date && ids.includes(r.item_id))),
      ...ids.filter((id) => !have.has(id)).map((id) => ({ item_id: id, plan_date: target, space_id: sid(), eaten: false })),
    ],
  });
  try {
    await foodDb.movePlan(sid(), date, target, ids);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
  afterPlanChange();
  return { count: rows.length, target };
}

/** 외식하는 날 표시/해제. 표시하면 그 날 반찬은 다음 날로 미뤄짐 */
export async function setOuting(date, out) {
  set({ foodDays: [...state.foodDays.filter((d) => d.plan_date !== date), ...(out ? [{ plan_date: date, kind: 'out', space_id: sid() }] : [])] });
  try {
    await foodDb.setDayOut(sid(), date, out);
  } catch (e) {
    set(await loadDays());
    throw e;
  }
  return out ? postponeDay(date) : { count: 0, target: null };
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
  afterPlanChange();
}
export async function removePlanEntry(itemId, date) {
  set({ foodPlan: state.foodPlan.filter((r) => !(r.item_id === itemId && r.plan_date === date)) });
  try {
    await foodDb.deletePlan(itemId, date);
  } catch (e) {
    set(await loadFood());
    throw e;
  }
  afterPlanChange();
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
  afterPlanChange();
}

/* ---------- 알림 (웹 푸시) ---------- */
export const pushSupported = pushDb.pushSupported;
export const pushConfigured = pushDb.pushConfigured;
export const pushPermission = pushDb.pushPermission;
export const pushSubscribed = async () => !!(await pushDb.currentSubscription());
export async function enablePush(memberId) {
  await pushDb.enablePush(sid(), memberId);
  prefs.setPushWanted(true); // 켜둔 기기는 구독이 사라져도 자동으로 다시 구독
}
export async function disablePush() {
  prefs.setPushWanted(false); // 직접 끈 기기는 자동으로 다시 켜지지 않게
  await pushDb.disablePush();
}
export async function syncPush(memberId) {
  const wanted = prefs.getPushWanted();
  const r = await pushDb.syncPush(sid(), memberId, wanted === true);
  if (wanted === null && r === 'existing') prefs.setPushWanted(true); // 이미 켜져 있던 기기는 '켬'으로 기억
}
export const testPush = () => pushDb.showLocalTest();

/* ---------- 백업 / 복원 ---------- */
export const exportBackup = () => backupDb.exportAll(state.space);
export const downloadBackup = backupDb.downloadJson;
export async function restoreBackup(data) {
  await backupDb.importAll(sid(), data, { includeFood: state.foodReady, includeEvents: state.eventsReady, includePurchases: state.purchasesReady, includePlans: state.plansReady });
  await loadAll();
}
