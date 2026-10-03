// 먹거리 계산: 유통기한 상태, 주간 식단 자동 배정, 표시용 식단 만들기 (DB/화면 모름)
import { addDays, diffDays } from './dates.js';

export const MAX_DISHES_PER_DAY = 3;

export const expiryOf = (it) => (it.shelf_life_days != null ? addDays(it.delivered_date, it.shelf_life_days) : null);
export const daysLeft = (it, today) => {
  const e = expiryOf(it);
  return e ? diffDays(today, e) : null;
};

export function expiryStatus(it, today) {
  const d = daysLeft(it, today);
  if (d === null) return { cls: 'ok', text: '기한 없음' };
  if (d < 0) return { cls: 'urgent', text: '기한 지남' };
  if (d <= 1) return { cls: 'urgent', text: d === 0 ? '오늘까지' : '내일까지' };
  if (d <= 2) return { cls: 'soon', text: `${d}일 남음` };
  return { cls: 'ok', text: `${d}일 남음` };
}

export const sortByExpiry = (items, today) =>
  items.slice().sort((a, b) => (daysLeft(a, today) ?? 99999) - (daysLeft(b, today) ?? 99999));

/**
 * 오늘부터 7일치 반찬을 자동 배정한다. 반환: { 'YYYY-MM-DD': [itemId, ...] }
 * - 유통기한이 오늘/내일인 반찬은 하루 제한(기본 3개)을 넘어도 반드시 포함
 * - 그 외에는 어제 먹은 반찬을 피하고 무작위로 섞음
 */
export function autoAssign(items, today, rng = Math.random) {
  const pool = items
    .filter((it) => it.servings > 0)
    .map((it) => ({ id: it.id, remaining: it.servings, expiry: expiryOf(it) || addDays(today, 365), jitter: rng() }));

  const total = pool.reduce((s, p) => s + p.remaining, 0);
  const base = total === 0 ? 0 : Math.min(MAX_DISHES_PER_DAY, Math.max(1, Math.round(total / 7)));
  const byKey = {};
  let last = new Set();

  for (let offset = 0; offset < 7; offset++) {
    const day = addDays(today, offset);
    const urgentOf = (p) => (diffDays(day, p.expiry) <= 1 ? 0 : 1);
    const cands = pool.filter((p) => p.remaining > 0 && diffDays(day, p.expiry) >= 0);

    cands.sort((a, b) => {
      const ua = urgentOf(a), ub = urgentOf(b);
      if (ua !== ub) return ua - ub;
      if (ua === 0) return diffDays(day, a.expiry) - diffDays(day, b.expiry);
      return a.jitter - b.jitter;
    });

    let ordered = [...cands];
    if (offset > 0 && ordered.length > base) {
      // 임박한 것은 항상 앞에 두고, 나머지는 어제 안 먹은 것 우선 + 무작위
      ordered.sort((a, b) => {
        const ua = urgentOf(a), ub = urgentOf(b);
        if (ua !== ub) return ua - ub;
        const ra = last.has(a.id) ? 1 : 0, rb = last.has(b.id) ? 1 : 0;
        if (ra !== rb) return ra - rb;
        return rng() - 0.5;
      });
    }

    const urgentCount = ordered.filter((p) => urgentOf(p) === 0).length;
    const picked = ordered.slice(0, Math.max(base, urgentCount));
    picked.forEach((p) => (p.remaining -= 1));
    last = new Set(picked.map((p) => p.id));
    byKey[day] = picked.map((p) => p.id);
  }
  return byKey;
}

/** 저장된 식단 행(plan_date, item_id)을 오늘부터 7일치 표시용으로 변환 + 다음 날 냉동 반찬 해동 안내 */
export function resolvePlan(items, planRows, today) {
  const byId = new Map(items.map((it) => [it.id, it]));
  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const dishes = planRows
      .filter((r) => r.plan_date === date && byId.has(r.item_id))
      .map((r) => {
        const it = byId.get(r.item_id);
        const e = expiryOf(it);
        return { id: it.id, name: it.name, urgent: e ? diffDays(date, e) <= 1 : false, frozen: it.storage === 'frozen' };
      });
    days.push({ date, dishes, thaw: [] });
  }
  for (let i = 0; i < days.length - 1; i++) {
    days[i].thaw = [...new Set(days[i + 1].dishes.filter((d) => d.frozen).map((d) => d.name))];
  }
  return days;
}

/** 이번 주 안에 유통기한이 끝나는데 어느 날에도 배정되지 않은 반찬 */
export function missedItems(items, plan, today) {
  const assigned = new Set(plan.flatMap((d) => d.dishes.map((x) => x.id)));
  return items.filter((it) => {
    const d = daysLeft(it, today);
    return d !== null && d >= 0 && d <= 6 && !assigned.has(it.id);
  });
}
