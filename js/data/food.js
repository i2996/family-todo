import { supabase, unwrap } from './client.js';

export const listFood = async (sid) =>
  unwrap(await supabase.from('food_items').select('*').eq('space_id', sid).order('created_at'));

export const insertFood = async (sid, p) =>
  unwrap(await supabase.from('food_items').insert({ ...p, space_id: sid }).select().single());

export const updateFood = async (id, p) => unwrap(await supabase.from('food_items').update(p).eq('id', id).select().single());

export const setServings = async (id, servings) => unwrap(await supabase.from('food_items').update({ servings }).eq('id', id));

export const deleteFood = async (id) => unwrap(await supabase.from('food_items').delete().eq('id', id));

/* ---- 주간 식단 ---- */
export const listPlan = async (sid) => unwrap(await supabase.from('food_plan').select('*').eq('space_id', sid));

export const insertPlan = async (sid, date, itemId) =>
  unwrap(
    await supabase
      .from('food_plan')
      .upsert({ space_id: sid, plan_date: date, item_id: itemId }, { onConflict: 'item_id,plan_date', ignoreDuplicates: true })
  );

export const deletePlan = async (itemId, date) =>
  unwrap(await supabase.from('food_plan').delete().eq('item_id', itemId).eq('plan_date', date));

/** [from, to] 기간의 식단을 지우고 새로 채우기 */
export async function replacePlan(sid, from, to, rows) {
  unwrap(await supabase.from('food_plan').delete().eq('space_id', sid).gte('plan_date', from).lte('plan_date', to));
  if (rows.length) unwrap(await supabase.from('food_plan').insert(rows.map((r) => ({ ...r, space_id: sid }))));
}
