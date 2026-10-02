// 카카오톡 등 공유용 텍스트 + 공유 실행
import { labelDate, todayISO } from './dates.js';

export function buildShareText(occ, member) {
  const t = occ.task;
  const lines = ['[가족 할 일]', t.title, `담당: ${member ? member.name : '미정'}`, `날짜: ${labelDate(occ.date, todayISO())}`];
  if (t.memo) lines.push(`메모: ${t.memo}`);
  return lines.join('\n');
}

/** @returns 'shared' | 'copied' | 'cancelled' */
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    window.prompt('아래 내용을 복사해서 보내주세요', text);
    return 'copied';
  }
}
