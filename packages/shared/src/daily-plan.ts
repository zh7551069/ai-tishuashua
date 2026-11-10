/**
 * 首页每日练习计划的读模型与纯函数。
 * 小程序经 barrel 加载本文件。不要在这里 import node: 或写 SQL。
 */

export const DAILY_PLAN_WEEK_STARTS_ON = 'monday' as const;

export const DAILY_PLAN_CTA_LABEL = '开始今日刷题练习';

export const DAILY_PLAN_EMPTY_HINT = '创建刷题包后，即可开始今日练习';

export const DAILY_PLAN_GREETING = '你好，备考人';

export const DAILY_PLAN_ENCOURAGEMENT = '今天的每一次练习，都在积累进步';

export const DAILY_PLAN_MULTI_PACE = '按自己的节奏，一包包进步。';

export const DAILY_PLAN_WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'] as const;

const WEEKDAY_NAMES = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'] as const;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface DailyPlanItem {
  knowledgePointId: string;
  name: string;
  done: boolean;
  completedAt: string | null;
}

export interface DailyPlanActivePack {
  packId: string;
  name: string;
  domainName: string;
  certName: string;
  unavailable: boolean;
  knowledgePointCount: number;
  completedCount: number;
  remainingCount: number;
  percent: number;
  items: DailyPlanItem[];
}

export interface DailyPlanPackChip {
  packId: string;
  name: string;
  unavailable: boolean;
  active: boolean;
  knowledgePointCount: number;
  completedCount: number;
  remainingCount: number;
}

export interface DailyPlanSummary {
  availablePackCount: number;
  completedCount: number;
  totalCount: number;
  remainingCount: number;
  percent: number;
}

export interface DailyPlanWeekDay {
  date: string;
  /** 周一为 1，周日为 7。 */
  weekday: number;
  hasCompletion: boolean;
}

export interface DailyPlanView {
  businessDate: string;
  weekStartsOn: typeof DAILY_PLAN_WEEK_STARTS_ON;
  empty: boolean;
  activePackId: string | null;
  summary: DailyPlanSummary;
  activePack: DailyPlanActivePack | null;
  packs: DailyPlanPackChip[];
  week: DailyPlanWeekDay[];
}

export type DailyPlanLayout = 'empty' | 'single' | 'multi';

export type DailyPlanCta =
  | { enabled: false; reason: 'empty' | 'unavailable' | 'no-kp'; hint: string }
  | { enabled: true; packId: string; knowledgePointId: string; rehearse: boolean };

export interface DailyPlanRing {
  percent: number;
  kicker: string;
  doneLine: string;
  remainLine: string;
}

/** total 为 0 时是 0，否则 floor(completed * 100 / total)。 */
export function dailyPlanPercent(completed: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.floor((completed * 100) / total);
}

/** 业务日所在周的周一到周日。入参已是 Asia/Shanghai 日历日，不再换时区。 */
export function dailyPlanWeek(businessDate: string): Array<{ date: string; weekday: number }> {
  const start = mondayOf(businessDate);
  return Array.from({ length: 7 }, (_item, index) => ({
    date: addIsoDays(start, index),
    weekday: index + 1,
  }));
}

export function formatDailyPlanDate(businessDate: string): string {
  const parts = parseIsoDate(businessDate);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = WEEKDAY_NAMES[utc.getUTCDay()] ?? '星期';
  return `${parts.year}年${parts.month}月${parts.day}日 · ${weekday}`;
}

export function dailyPlanDayNumber(isoDate: string): number {
  return parseIsoDate(isoDate).day;
}

export function dailyPlanLayout(plan: { empty: boolean; packs: readonly unknown[] }): DailyPlanLayout {
  if (plan.empty || plan.packs.length === 0) {
    return 'empty';
  }
  if (plan.packs.length === 1) {
    return 'single';
  }
  return 'multi';
}

/**
 * 主 CTA。默认只带第一个待练习知识点。
 * 今日全部完成时仍可点，带排序后的第一项（已完成）再练。
 * 不会返回空的 knowledgePointId。
 */
export function resolveDailyPlanCta(plan: {
  empty: boolean;
  activePack: DailyPlanActivePack | null;
}): DailyPlanCta {
  if (plan.empty || !plan.activePack) {
    return { enabled: false, reason: 'empty', hint: DAILY_PLAN_EMPTY_HINT };
  }
  if (plan.activePack.unavailable) {
    return { enabled: false, reason: 'unavailable', hint: '刷题包不可用' };
  }
  const firstPending = plan.activePack.items.find((item) => !item.done);
  const target = firstPending ?? plan.activePack.items[0];
  if (!target?.knowledgePointId) {
    return { enabled: false, reason: 'no-kp', hint: '当前包没有可练习的知识点' };
  }
  return {
    enabled: true,
    packId: plan.activePack.packId,
    knowledgePointId: target.knowledgePointId,
    rehearse: !firstPending,
  };
}

/** 出题设置预填。knowledgePointId 为空时抛错，避免走整包。 */
export function dailyPlanQuizPath(packId: string, knowledgePointId: string): string {
  const pack = packId.trim();
  const kp = knowledgePointId.trim();
  if (!pack || !kp) {
    throw new Error('每日计划出题必须带一个知识点');
  }
  return `/pages/quiz/index?packId=${encodeURIComponent(pack)}&kpIds=${encodeURIComponent(kp)}&intent=dailyPlan`;
}

export function dailyPlanFootnote(plan: DailyPlanView): string {
  const layout = dailyPlanLayout(plan);
  if (layout === 'empty') {
    return DAILY_PLAN_EMPTY_HINT;
  }
  const cta = resolveDailyPlanCta(plan);
  if (!cta.enabled && cta.reason === 'unavailable') {
    return '刷题包不可用';
  }
  if (!cta.enabled && cta.reason === 'no-kp') {
    return '当前包没有可练习的知识点';
  }
  const active = plan.activePack;
  if (layout === 'multi' && active && !active.unavailable && active.remainingCount > 0) {
    return `将继续 ${active.name} 剩余的 ${active.remainingCount} 项练习`;
  }
  return DAILY_PLAN_ENCOURAGEMENT;
}

export function dailyPlanRing(plan: DailyPlanView): DailyPlanRing | null {
  const layout = dailyPlanLayout(plan);
  if (layout === 'empty') {
    return null;
  }
  if (layout === 'single' && plan.activePack) {
    const pack = plan.activePack;
    return {
      percent: pack.percent,
      kicker: pack.unavailable ? '当前刷题包不可用' : '今日练习 · 1 个刷题包',
      doneLine: `已完成 ${pack.completedCount} / ${pack.knowledgePointCount} 项`,
      remainLine: `还有 ${pack.remainingCount} 项待练习`,
    };
  }
  return {
    percent: plan.summary.percent,
    kicker: `全部 ${plan.summary.availablePackCount} 个刷题包`,
    doneLine: `已完成 ${plan.summary.completedCount} / ${plan.summary.totalCount} 项`,
    remainLine: `还有 ${plan.summary.remainingCount} 项待练习`,
  };
}

function mondayOf(businessDate: string): string {
  const parts = parseIsoDate(businessDate);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = utc.getUTCDay();
  const delta = weekday === 0 ? 6 : weekday - 1;
  utc.setUTCDate(utc.getUTCDate() - delta);
  return formatUtc(utc);
}

function addIsoDays(isoDate: string, days: number): string {
  const parts = parseIsoDate(isoDate);
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return formatUtc(utc);
}

function parseIsoDate(value: string): { year: number; month: number; day: number } {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new Error('业务日不正确');
  }
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function formatUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
