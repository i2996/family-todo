// 기기별 설정 (localStorage) - 이 기기에서만 유지되고 다른 기기와 공유되지 않음
const NS = 'familyTodo.';
const read = (k, d = null) => {
  try {
    const v = localStorage.getItem(NS + k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    if (v == null) localStorage.removeItem(NS + k);
    else localStorage.setItem(NS + k, JSON.stringify(v));
  } catch {}
};

export const prefs = {
  getSpaceId: () => read('spaceId'),
  setSpaceId: (v) => write('spaceId', v),
  getDeviceMember: () => read('deviceMember'),
  setDeviceMember: (v) => write('deviceMember', v),
  /** 할 일 화면 필터. member 가 null 이면 '이 기기 주인'을 기본값으로 사용 */
  getFilter: () => ({ member: null, period: 'today', status: 'pending', ...read('filter', {}) }),
  setFilter: (f) => write('filter', f),
  getFoodTab: () => read('foodTab', 'banchan'),
  setFoodTab: (v) => write('foodTab', v),
};
