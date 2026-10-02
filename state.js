// 앱 전체 상태 저장소 (아주 단순한 구독 방식)
export const state = {
  space: null,
  members: [],
  tasks: [],
  completions: [],
  trips: [],
  tab: 'home', // 'home' | 'tasks' | 'trips'
  tripId: null, // 외출/여행 상세 화면
};

const listeners = new Set();
export const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
/** patch 없이 호출하면 화면만 다시 그린다 */
export function set(patch = {}) {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}
