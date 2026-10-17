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
export const setSingleDone = async (id, done, doneBy = null) =>
  unwrap(
    await supabase
      .from('tasks')
      .update({ done, done_at: done ? new Date().toISOString() : null, done_by: done ? doneBy : null })
      .eq('id', id)
  );

/** 반복 업무의 특정 날짜 완료/해제 (doneBy: 완료한 구성원) */
export async function setOccurrenceDone(sid, taskId, date, done, doneBy = null) {
  if (done) {
    return unwrap(
      await supabase.from('task_completions').upsert({ task_id: taskId, occurrence_date: date, space_id: sid, done_by: doneBy })
    );
  }
  return unwrap(await supabase.from('task_completions').delete().eq('task_id', taskId).eq('occurrence_date', date));
}

/** 자동으로 만드는 할 일(source_key 로 구분): 이미 있으면 건너뜀 (여러 기기가 동시에 만들어도 중복 없음) */
export const upsertAutoTasks = async (sid, rows) =>
  unwrap(
    await supabase
      .from('tasks')
      .upsert(rows.map((r) => ({ ...r, space_id: sid })), { onConflict: 'space_id,source_key', ignoreDuplicates: true })
  );

export const deleteTasks = async (ids) => unwrap(await supabase.from('tasks').delete().in('id', ids));
