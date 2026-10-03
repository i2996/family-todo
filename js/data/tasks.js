import { supabase, unwrap } from './client.js';

export const listTasks = async (sid) =>
  unwrap(await supabase.from('tasks').select('*').eq('space_id', sid).order('task_date').order('created_at'));

export const listCompletions = async (sid) =>
  unwrap(await supabase.from('task_completions').select('*').eq('space_id', sid));

export const insertTask = async (sid, p) =>
  unwrap(await supabase.from('tasks').insert({ ...p, space_id: sid }).select().single());

export const updateTask = async (id, p) => unwrap(await supabase.from('tasks').update(p).eq('id', id).select().single());

export const deleteTask = async (id) => unwrap(await supabase.from('tasks').delete().eq('id', id));

export const deleteTasksOfTrip = async (tripId) => unwrap(await supabase.from('tasks').delete().eq('trip_id', tripId));

/** 한 번만 하는 일 완료/해제 */
export const setSingleDone = async (id, done) =>
  unwrap(await supabase.from('tasks').update({ done, done_at: done ? new Date().toISOString() : null }).eq('id', id));

/** 반복 업무의 특정 날짜 완료/해제 */
export async function setOccurrenceDone(sid, taskId, date, done) {
  if (done) {
    return unwrap(
      await supabase.from('task_completions').upsert({ task_id: taskId, occurrence_date: date, space_id: sid })
    );
  }
  return unwrap(await supabase.from('task_completions').delete().eq('task_id', taskId).eq('occurrence_date', date));
}
