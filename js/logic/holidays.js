// 한국 공휴일 + 대체공휴일 계산 (DB/화면 모름)
// - 양력 공휴일은 규칙으로, 음력 공휴일(설날·부처님오신날·추석)은 연도별 표로 넣어둠 (LUNAR_UNTIL 년까지)
// - 임시공휴일·선거일처럼 미리 알 수 없는 날은 가족이 직접 추가 (extra)
import { addDays, dow, pad } from './dates.js';

/** 음력 공휴일 (양력 날짜). 설날·추석은 당일, 앞뒤 하루씩 함께 쉼 */
const LUNAR = {
  2025: { seol: '2025-01-29', buddha: '2025-05-05', chuseok: '2025-10-06' },
  2026: { seol: '2026-02-17', buddha: '2026-05-24', chuseok: '2026-09-25' },
  2027: { seol: '2027-02-07', buddha: '2027-05-13', chuseok: '2027-09-15' },
  2028: { seol: '2028-01-27', buddha: '2028-05-02', chuseok: '2028-10-03' },
  2029: { seol: '2029-02-13', buddha: '2029-05-20', chuseok: '2029-09-22' },
  2030: { seol: '2030-02-03', buddha: '2030-05-09', chuseok: '2030-09-12' },
};
export const LUNAR_UNTIL = 2030;

/** 이미 정해진 선거일 (법정 공휴일) */
const ELECTIONS = { '2026-06-03': '지방선거', '2028-04-12': '국회의원 선거' };

const cache = new Map();

/**
 * 그 해의 공휴일 Map(날짜 → 이름). 대체공휴일 포함.
 * 대체공휴일 규칙 (2023년~):
 *  - 설날·추석 연휴가 일요일이나 다른 공휴일과 겹치면 → 연휴 뒤 첫 평일
 *  - 어린이날이 토·일·다른 공휴일과 겹치면 → 다음 평일
 *  - 삼일절·부처님오신날·광복절·개천절·한글날·성탄절이 토·일과 겹치면 → 다음 평일
 */
export function holidaysOf(year) {
  if (cache.has(year)) return cache.get(year);
  const d = (m, dd) => `${year}-${pad(m)}-${pad(dd)}`;
  const map = new Map();
  const add = (date, name) => {
    if (!map.has(date)) map.set(date, name);
    else if (!map.get(date).includes(name)) map.set(date, `${map.get(date)}·${name}`);
  };

  const fixed = [
    [d(1, 1), '신정', null],
    [d(3, 1), '삼일절', 'weekend'],
    [d(5, 5), '어린이날', 'weekend+holiday'],
    [d(6, 6), '현충일', null],
    [d(8, 15), '광복절', 'weekend'],
    [d(10, 3), '개천절', 'weekend'],
    [d(10, 9), '한글날', 'weekend'],
    [d(12, 25), '성탄절', 'weekend'],
  ];
  const lunar = LUNAR[year];
  const groups = []; // 대체공휴일 판단용 [{ days, name, rule }]
  for (const [date, name, rule] of fixed) groups.push({ days: [date], name, rule });
  if (lunar) {
    groups.push({ days: [addDays(lunar.seol, -1), lunar.seol, addDays(lunar.seol, 1)], name: '설날', rule: 'sunday+holiday' });
    groups.push({ days: [lunar.buddha], name: '부처님오신날', rule: 'weekend' });
    groups.push({ days: [addDays(lunar.chuseok, -1), lunar.chuseok, addDays(lunar.chuseok, 1)], name: '추석', rule: 'sunday+holiday' });
  }
  for (const g of groups) for (const day of g.days) add(day, g.name);
  for (const [date, name] of Object.entries(ELECTIONS)) if (date.startsWith(`${year}-`)) add(date, name);

  // 다른 공휴일과 겹치는지: 같은 날에 이름이 둘 이상 붙은 경우
  const overlapsOther = (day) => (map.get(day) || '').includes('·');
  const isWeekend = (day) => dow(day) === 0 || dow(day) === 6;
  const subs = [];
  for (const g of groups) {
    if (!g.rule) continue;
    const count = g.days.filter((day) =>
      g.rule === 'sunday+holiday' ? dow(day) === 0 || overlapsOther(day)
      : g.rule === 'weekend+holiday' ? isWeekend(day) || overlapsOther(day)
      : isWeekend(day)
    ).length;
    let next = g.days[g.days.length - 1];
    for (let i = 0; i < count; i++) {
      do next = addDays(next, 1);
      while (isWeekend(next) || map.has(next) || subs.some((s) => s[0] === next));
      subs.push([next, `대체공휴일(${g.name})`]);
    }
  }
  for (const [date, name] of subs) add(date, name);
  cache.set(year, map);
  return map;
}

/** 공휴일 이름 (아니면 null). extra: 가족이 직접 추가한 쉬는 날 [{ date, name }] */
export function holidayName(iso, extra = []) {
  const own = extra.find((h) => h.date === iso);
  if (own) return own.name || '쉬는 날';
  return holidaysOf(Number(iso.slice(0, 4))).get(iso) || null;
}

/** 쉬는 날인지 (토·일 + 공휴일 + 직접 추가한 날) */
export const isOffDay = (iso, extra = []) => dow(iso) === 0 || dow(iso) === 6 || !!holidayName(iso, extra);

/**
 * 쉬는 날이면 앞/다음 영업일로 옮김.
 * shift: 'none' 그대로 | 'before' 앞 영업일 | 'after' 다음 영업일
 */
export function shiftToBusinessDay(iso, shift, extra = []) {
  if (!shift || shift === 'none') return iso;
  const step = shift === 'before' ? -1 : 1;
  let d = iso;
  for (let i = 0; i < 31 && isOffDay(d, extra); i++) d = addDays(d, step);
  return d;
}
