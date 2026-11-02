// 반복 설정 화면 조각 (가계부·일정 공용)
// 폼 안에 repeatSection() 을 넣고, 날짜 칸이 바뀌면 syncRep(form) 을 부르면 됨.
// 날짜 칸 이름은 data-date-field 로 알려줌 (가계부 entry_date, 일정 start_date)
import * as A from '../actions.js';
import { esc } from './components.js';
import { repeatLabel, repeatOccurrences, horizonOf, SHIFT_LABEL, weekName, weekOfMonth } from '../logic/ledger.js';
import { todayISO, dow, shortDate, KO_DOW } from '../logic/dates.js';

/** 반복 SQL 을 아직 안 돌렸을 때 안내 */
export const repeatNotReady = (file) =>
  `<div class="field"><span class="label">반복</span><p class="note" style="margin:0">반복을 쓰려면 Supabase 에서 <b>${esc(file)}</b> 을 한 번 실행해주세요.</p></div>`;

/**
 * 반복 설정 칸. rule: { freq, last_day, month_week, shift, end_date } (없으면 새로 만들기)
 * dateField: 시작 날짜 input 이름. noneOption: '안 함' 선택지를 보일지
 */
export function repeatSection(rule, startDate, { dateField = 'entry_date', noneOption = !rule } = {}) {
  const freq = rule?.freq || 'none';
  const shift = rule?.shift || 'none';
  const radio = (name, v, label, on) =>
    `<label class="chip pick"><input type="radio" name="${name}" value="${v}" data-change="rep-sync" ${on ? 'checked' : ''}><span>${label}</span></label>`;
  return `<div class="field lg-rep" data-date-field="${dateField}"><span class="label">반복</span>
    <div class="chips">
      ${noneOption ? radio('freq', 'none', '안 함', freq === 'none') : ''}
      ${radio('freq', 'weekly', '매주', freq === 'weekly')}
      ${radio('freq', 'monthly', '매월', freq === 'monthly')}
      ${radio('freq', 'yearly', '매년', freq === 'yearly')}
    </div>
    <div class="lg-rep-opts" ${freq === 'none' ? 'hidden' : ''}>
      <p class="rep-hint"></p>
      <div class="chips rep-mday" data-v="${rule?.last_day ? 'lastday' : rule?.month_week === -1 ? 'lastwd' : rule?.month_week ? 'nth' : 'date'}" ${freq === 'monthly' ? '' : 'hidden'}></div>
      <div class="field"><span class="label">주말·공휴일이면</span><div class="chips">
        ${['none', 'before', 'after'].map((v) => radio('shift', v, SHIFT_LABEL[v], shift === v)).join('')}
      </div></div>
      <div class="field"><span class="label">끝나는 날 (선택)</span><input type="date" name="rep_end" value="${rule?.end_date || ''}" min="${startDate}"></div>
      <p class="rep-next"></p>
    </div>
  </div>`;
}

/** 매월 기준 → { last_day, month_week } */
export function monthlyRule(freq, mday, start) {
  if (freq !== 'monthly') return { last_day: false, month_week: null };
  if (mday === 'lastday') return { last_day: true, month_week: null };
  if (mday === 'nth') return { last_day: false, month_week: weekOfMonth(start).nth };
  if (mday === 'lastwd') return { last_day: false, month_week: -1 };
  return { last_day: false, month_week: null };
}

/** 폼에서 반복 설정 읽기 → { freq, last_day, month_week, shift, end_date } (반복 안 함이면 null) */
export function readRepeat(f, start) {
  const fd = new FormData(f);
  const freq = fd.get('freq') || 'none';
  if (freq === 'none') return null;
  return { freq, ...monthlyRule(freq, fd.get('mday') || 'date', start), shift: fd.get('shift') || 'none', end_date: fd.get('rep_end') || null };
}

/** 반복 설명과 다음 날짜 미리보기를 폼 값에 맞춤 */
export function syncRep(f) {
  const box = f && f.querySelector('.lg-rep');
  if (!box) return;
  const freq = f.elements.freq?.value || 'none';
  box.querySelector('.lg-rep-opts').hidden = freq === 'none';
  const mdayBox = box.querySelector('.rep-mday');
  mdayBox.hidden = freq !== 'monthly';
  if (freq === 'none') return;
  const start = f.elements[box.dataset.dateField || 'entry_date']?.value || todayISO();
  // 매월: 시작 날짜로 고를 수 있는 기준 (25일 / 넷째 화요일 / 마지막 화요일 / 말일)
  const { nth, isLast } = weekOfMonth(start);
  const wd = KO_DOW[dow(start)];
  const opts = [
    ['date', `${Number(start.slice(8))}일`],
    ['nth', `${weekName(nth)} ${wd}요일`],
    ...(isLast ? [['lastwd', `마지막 ${wd}요일`]] : []),
    ['lastday', '말일'],
  ];
  const cur = f.elements.mday?.value || mdayBox.dataset.v || 'date';
  const sel = opts.some(([v]) => v === cur) ? cur : 'date';
  mdayBox.innerHTML = opts
    .map(([v, label]) => `<label class="chip pick"><input type="radio" name="mday" value="${v}" data-change="rep-sync" ${v === sel ? 'checked' : ''}><span>${esc(label)}</span></label>`)
    .join('');
  mdayBox.dataset.v = sel;
  const r = {
    freq,
    start_date: start,
    ...monthlyRule(freq, sel, start),
    shift: f.elements.shift.value || 'none',
    end_date: f.elements.rep_end.value || null,
  };
  box.querySelector('.rep-hint').textContent = `🔁 ${repeatLabel(r)}`;
  const today = todayISO();
  const next = repeatOccurrences(r, horizonOf(today, 14), A.ledgerHolidays())
    .filter((o) => o.entry_date >= today)
    .slice(0, 3)
    .map((o) => `${shortDate(o.entry_date)}(${KO_DOW[dow(o.entry_date)]})${o.entry_date !== o.repeat_date ? '*' : ''}`);
  box.querySelector('.rep-next').textContent = next.length
    ? `다음: ${next.join(', ')}${next.some((x) => x.endsWith('*')) ? '  (* 쉬는 날이라 옮긴 날)' : ''}`
    : '';
}

export const changes = {
  'rep-sync': (el) => syncRep(el.closest('form')),
};
