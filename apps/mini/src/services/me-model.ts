/** 个人中心纯展示计算。连胜条按本机打卡；领场由服务端签到入账。 */

export const APP_VERSION = 'v0.3.0';
export const APP_FOOTER = '题刷刷 v0.3.0';

export type CheckinState = { last: string; streak: number };

export const EMPTY_CHECKIN: CheckinState = { last: '', streak: 0 };

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

export type WeekDot = 'past' | 'today' | 'today-on' | 'hollow';

export type WeekCell = { label: string; dot: WeekDot };

export function dayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) {
    return null;
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (dayKey(date) !== key) {
    return null;
  }
  return date;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function displayStreak(state: CheckinState, today: string): number {
  if (state.streak <= 0 || !state.last) {
    return 0;
  }
  const todayDate = parseDayKey(today);
  if (!todayDate) {
    return 0;
  }
  const yesterday = dayKey(addDays(todayDate, -1));
  if (state.last === today || state.last === yesterday) {
    return state.streak;
  }
  return 0;
}

export function applyCheckin(state: CheckinState, today: string): CheckinState {
  if (state.last === today && state.streak > 0) {
    return state;
  }
  const todayDate = parseDayKey(today);
  if (!todayDate) {
    return { last: today, streak: 1 };
  }
  const yesterday = dayKey(addDays(todayDate, -1));
  const alive = state.last === yesterday && state.streak > 0;
  return { last: today, streak: alive ? state.streak + 1 : 1 };
}

export function weekStrip(state: CheckinState, today: string): WeekCell[] {
  const todayDate = parseDayKey(today) ?? new Date();
  const weekday = todayDate.getDay();
  const monday = addDays(todayDate, weekday === 0 ? -6 : 1 - weekday);
  const streak = displayStreak(state, today);
  const lastDate = streak > 0 ? parseDayKey(state.last) : null;
  const startKey = lastDate ? dayKey(addDays(lastDate, -(streak - 1))) : '';
  const lastKey = lastDate ? state.last : '';
  return WEEK_LABELS.map((label, index) => {
    const key = dayKey(addDays(monday, index));
    const checked = Boolean(startKey && lastKey && key >= startKey && key <= lastKey);
    if (key === today) {
      return { label, dot: checked ? 'today-on' : 'today' };
    }
    if (checked) {
      return { label, dot: 'past' };
    }
    return { label, dot: 'hollow' };
  });
}

export function streakLabel(streak: number): string {
  return streak > 0 ? `已连续 ${streak} 天` : '尚未开始连续打卡';
}

export function checkinNote(checked: boolean, streak: number): string {
  if (checked) {
    return '今日已打卡 · 坚持打卡，保持连续';
  }
  if (streak > 0) {
    return '打卡保持连续天数，别断签';
  }
  return '坚持打卡，保持连续';
}

export function sumScores(items: { questionCount: number; correctCount: number }[]): {
  questions: number;
  correct: number;
} {
  return items.reduce(
    (sum, item) => ({
      questions: sum.questions + item.questionCount,
      correct: sum.correct + item.correctCount,
    }),
    { questions: 0, correct: 0 },
  );
}

export function accuracyLabel(questions: number, correct: number): string {
  if (questions <= 0) {
    return '—';
  }
  return `${Math.round((correct / questions) * 100)}%`;
}

export function countRecent(isoDates: string[], today: string): number {
  const todayDate = parseDayKey(today);
  if (!todayDate) {
    return 0;
  }
  const startKey = dayKey(addDays(todayDate, -6));
  let count = 0;
  for (const iso of isoDates) {
    const time = Date.parse(iso);
    if (!Number.isFinite(time)) {
      continue;
    }
    const key = dayKey(new Date(time));
    if (key >= startKey && key <= today) {
      count += 1;
    }
  }
  return count;
}

export function profileSubtitle(empty: boolean, certName: string): string {
  if (empty) {
    return '还没开始刷题';
  }
  const name = certName.trim();
  return name ? `备考中 · ${name}` : '备考中';
}

export function avatarChar(nick: string | null | undefined): string {
  const text = nick?.trim();
  if (!text) {
    return '我';
  }
  return Array.from(text)[0] || '我';
}

export function displayNick(nick: string | null | undefined): string {
  const text = nick?.trim();
  return text || '微信用户';
}

export function wrongMeta(count: number): string {
  return count > 0 ? '待消灭' : '暂无错题';
}

export function packMeta(count: number): string {
  return count > 0 ? `${count} 个已保存` : '还没有刷题包';
}

export function practiceMeta(count: number): string {
  return count > 0 ? `近 7 天 ${count} 次练习` : '暂无记录';
}

export function badgeLabel(count: number): string {
  if (count > 99) {
    return '99+';
  }
  return String(count);
}

export function formatCacheMb(kb: number): string {
  const safe = Number.isFinite(kb) && kb > 0 ? kb : 0;
  return `${(safe / 1024).toFixed(1)} MB`;
}

export type CenterView = {
  empty: boolean;
  subtitle: string;
  questions: number;
  accuracy: string;
  streak: number;
  checked: boolean;
  note: string;
  streakText: string;
  week: WeekCell[];
  wrongCount: number;
  wrongText: string;
  packCount: number;
  packText: string;
  practiceCount: number;
  practiceText: string;
};

export function buildCenter(input: {
  certName: string;
  packCount: number;
  questions: number;
  correct: number;
  wrongCount: number;
  practiceCount: number;
  checkin: CheckinState;
  today: string;
}): CenterView {
  const streak = displayStreak(input.checkin, input.today);
  const checked = input.checkin.last === input.today && streak > 0;
  const empty = input.packCount <= 0 && input.questions <= 0;
  return {
    empty,
    subtitle: profileSubtitle(empty, input.certName),
    questions: input.questions,
    accuracy: accuracyLabel(input.questions, input.correct),
    streak,
    checked,
    note: checkinNote(checked, streak),
    streakText: streakLabel(streak),
    week: weekStrip(input.checkin, input.today),
    wrongCount: input.wrongCount,
    wrongText: wrongMeta(input.wrongCount),
    packCount: input.packCount,
    packText: packMeta(input.packCount),
    practiceCount: input.practiceCount,
    practiceText: practiceMeta(input.practiceCount),
  };
}
