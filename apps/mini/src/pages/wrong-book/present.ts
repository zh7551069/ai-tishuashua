import type { QuizTypeCode, WrongBookItem, WrongItemStatus } from '@tishuashua/shared';

export type StatusFilter = WrongItemStatus | 'all';

export const CELEBRATE_KEY = 'tishuashua.wrong-book.celebrate-day';

export function localDayKey(date: Date): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isSameLocalDay(iso: string, now: Date): boolean {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return false;
  }
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

/** 含当天，向前数 `days` 个 24 小时。无效时间不进「近 30 天」。 */
export function isWithinDays(iso: string, days: number, now: Date): boolean {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return false;
  }
  return date.getTime() >= now.getTime() - days * 24 * 60 * 60 * 1000;
}

/** Bridge 卡片日期：`10月28日`，不补零、不带时刻。 */
export function formatWrongDate(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return iso;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

export function knowledgeLine(item: WrongBookItem): string {
  const name = item.kpNames?.map((value) => value.trim()).find(Boolean);
  return name ? `${item.certName} · ${name}` : item.certName;
}

export function typeClass(type: QuizTypeCode | null): string {
  if (type === 'multi') {
    return 'wb-type wb-type-multi';
  }
  if (type === 'judge') {
    return 'wb-type wb-type-judge';
  }
  return 'wb-type';
}

export function inScope(
  item: WrongBookItem,
  certId: string,
  recent: boolean,
  keyword: string,
  now: Date,
): boolean {
  if (certId !== 'all' && item.certId !== certId) {
    return false;
  }
  if (recent && !isWithinDays(item.updatedAt, 30, now)) {
    return false;
  }
  if (!keyword) {
    return true;
  }
  return item.stem.includes(keyword) || item.certName.includes(keyword);
}
