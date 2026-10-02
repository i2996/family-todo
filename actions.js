// 서비스 계층: UI 는 DB 를 직접 부르지 않고 여기 함수만 호출한다.
// (DB 호출 → 상태 갱신 → 화면 갱신 순서를 한 곳에서 관리)
import { state, set } from './state.js';
import * as spacesDb from './data/spaces.js';
import * as membersDb from './data/members.js';
import * as tasksDb from './data/tasks.js';
import * as tripsDb from './data/trips.js';
import * as backupDb from './data/backup.js';
import { isRecurring } from './logic/recurrence.js';

const sid = () => state.space.id;

/* ---------- 불러오기 ---------- */
export async function loadAll() {
  const [members, trips, tasks, completions] = await Promise.all([
    membersDb.listMembers(sid()),
    tripsDb.listTrips(sid()),
    tasksDb.listTasks(sid()),
    tasksDb.listCompletions(sid()),
  ]);
  set({ members, trips, tasks, completions });
}

export async function refresh(table) {
  if (!state.space) return;
  switch (table) {
    case 'members': return set({ members: await membersDb.listMembers(sid()) });
    case 'trips': return set({ trips: await tripsDb.listTrips(sid()) });
    case 'tasks': return set({ tasks: await tasksDb.listTasks(sid()) });
    case 'task_completions': return set({ completions: await tasksDb.listCompletions(sid()) });
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
    ['나', '#b57bff'], ['남편', '#4f9dff'], ['첫째', '#3fc380'], ['둘째', '#ff9f43'],
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
    tasks: state.tasks.map((t) => (t.assignee_id === id ? { ...t, assignee_id: null } : t)),
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

/** 체크 토글 - 화면은 먼저 바꾸고(낙관적 업데이트) 실패하면 서버 상태로 되돌린다 */
export async function toggleOccurrence(taskId, date) {
  const t = state.tasks.find((x) => x.id === taskId);
  if (!t) return;
  try {
    if (isRecurring(t)) {
      const exists = state.completions.some((c) => c.task_id === taskId && c.occurrence_date === date);
      const done = !exists;
      set({
        completions: done
          ? [...state.completions, { task_id: taskId, occurrence_date: date, space_id: sid() }]
          : state.completions.filter((c) => !(c.task_id === taskId && c.occurrence_date === date)),
      });
      await tasksDb.setOccurrenceDone(sid(), taskId, date, done);
    } else {
      const done = !t.done;
      set({ tasks: state.tasks.map((x) => (x.id === taskId ? { ...x, done } : x)) });
      await tasksDb.setSingleDone(taskId, done);
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

/* ---------- 백업 / 복원 ---------- */
export const exportBackup = () => backupDb.exportAll(state.space);
export const downloadBackup = backupDb.downloadJson;
export async function restoreBackup(data) {
  await backupDb.importAll(sid(), data);
  await loadAll();
}
