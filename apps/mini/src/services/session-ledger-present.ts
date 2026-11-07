/**
 * 场次明细的顶卡、流水行和 Tab。数字只来自 entitlement / ledger。
 * 不写死可用场次或消耗，也不在这里下单。
 */
import {
  BUSINESS_TZ,
  ENTITLEMENT_BUCKETS,
  ENTITLEMENT_LEDGER_REASONS,
  type EntitlementBalances,
  type EntitlementLedgerItem,
  type EntitlementLedgerPage,
  type EntitlementView,
} from '@tishuashua/shared';

export const SESSION_LEDGER_PAGE_TITLE = '场次明细';
export const SESSION_LEDGER_AVAILABLE_TITLE = '当前可用';
export const SESSION_LEDGER_UNLIMITED_HEADLINE = '不限场';
export const SESSION_LEDGER_UNLIMITED_SUBTITLE = '会员不限场';
export const SESSION_LEDGER_UNIT = '场';
export const SESSION_LEDGER_TODAY_DEBIT_LABEL = '今日消耗';
export const SESSION_LEDGER_RESET_NOTE = '次日 00:00 日免重置';
export const SESSION_LEDGER_EMPTY = '暂无场次流水';
export const SESSION_LEDGER_FILTER_EMPTY = '没有符合的流水';
export const SESSION_LEDGER_LOAD_MORE = '加载更多';
export const SESSION_LEDGER_LOADING_MORE = '加载中';
export const SESSION_LEDGER_PAGE_LIMIT = 20;
export const SESSION_LEDGER_UNKNOWN = '—';

export const SESSION_LEDGER_TABS = [
  { id: 'all', label: '全部' },
  { id: 'credit', label: '获得' },
  { id: 'debit', label: '消耗' },
] as const;

export type SessionLedgerTab = (typeof SESSION_LEDGER_TABS)[number]['id'];
export type SessionLedgerMark = 'credit' | 'debit' | 'neutral';

export interface EntitlementLedgerQuery {
  limit?: number;
  cursor?: string | null;
}

export interface SessionLedgerAvailability {
  mode: 'counted' | 'unlimited';
  title: typeof SESSION_LEDGER_AVAILABLE_TITLE;
  /** 非会员是三桶之和的十进制；会员是「不限场」，不是桶合计。 */
  headline: string;
  sessions: number | null;
  showUnit: boolean;
  subtitle: string;
}

export interface SessionLedgerRowModel {
  id: string;
  delta: number;
  mark: SessionLedgerMark;
  markLabel: string;
  title: string;
  timeLabel: string;
  deltaLabel: string;
}

const LEDGER_REASONS = new Set<string>(ENTITLEMENT_LEDGER_REASONS);
const LEDGER_BUCKETS = new Set<string>(ENTITLEMENT_BUCKETS);
const MINUS = '\u2212';

export function entitlementLedgerPath(query?: EntitlementLedgerQuery): string {
  const parts: string[] = [];
  if (query && typeof query.limit === 'number' && Number.isInteger(query.limit)) {
    parts.push(`limit=${encodeURIComponent(String(query.limit))}`);
  }
  if (query && typeof query.cursor === 'string' && query.cursor) {
    parts.push(`cursor=${encodeURIComponent(query.cursor)}`);
  }
  return `/me/entitlement/ledger${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
}

export function presentSessionLedgerAvailability(
  entitlement: EntitlementView | null | undefined,
): SessionLedgerAvailability | null {
  if (!entitlement || typeof entitlement.membership?.active !== 'boolean') {
    return null;
  }
  if (entitlement.membership.active) {
    return {
      mode: 'unlimited',
      title: SESSION_LEDGER_AVAILABLE_TITLE,
      headline: SESSION_LEDGER_UNLIMITED_HEADLINE,
      sessions: null,
      showUnit: false,
      subtitle: SESSION_LEDGER_UNLIMITED_SUBTITLE,
    };
  }
  const balances = readBalances(entitlement.balances);
  if (!balances) {
    return null;
  }
  const sessions = balances.dailyFreeRemain + balances.dailyTaskRemain + balances.inventoryRemain;
  return {
    mode: 'counted',
    title: SESSION_LEDGER_AVAILABLE_TITLE,
    headline: String(sessions),
    sessions,
    showUnit: true,
    subtitle: availabilitySubtitle(balances),
  };
}

/** 已加载页里、业务日当天的消耗场次。业务日不合法时返回 null，调用方显示「—」。 */
export function sumTodayDebitSessions(
  items: readonly { delta: number; bizDate: string }[],
  businessDate: string,
): number | null {
  if (!isBusinessDate(businessDate)) {
    return null;
  }
  return items.reduce((sum, item) => {
    if (item.bizDate === businessDate && item.delta < 0) {
      return sum + Math.abs(item.delta);
    }
    return sum;
  }, 0);
}

export function presentSessionLedgerRows(
  items: readonly EntitlementLedgerItem[],
  businessDate: string,
): SessionLedgerRowModel[] {
  const rows: SessionLedgerRowModel[] = [];
  for (const item of items) {
    const row = presentSessionLedgerRow(item, businessDate);
    if (row) {
      rows.push(row);
    }
  }
  return rows;
}

export function presentSessionLedgerRow(
  item: EntitlementLedgerItem,
  businessDate: string,
): SessionLedgerRowModel | null {
  if (!isLedgerItem(item)) {
    return null;
  }
  const mark = ledgerMark(item.delta);
  return {
    id: item.id,
    delta: item.delta,
    mark,
    markLabel: ledgerMarkLabel(mark),
    title: ledgerTitle(item),
    timeLabel: formatLedgerTime(item.createdAt, businessDate),
    deltaLabel: formatLedgerDelta(item.delta),
  };
}

/**
 * 获得 = delta>0，消耗 = delta<0。
 * delta=0（会员场）只留在「全部」。
 */
export function filterSessionLedgerRows<T extends { delta: number }>(
  rows: readonly T[],
  tab: SessionLedgerTab,
): T[] {
  if (tab === 'credit') {
    return rows.filter((row) => row.delta > 0);
  }
  if (tab === 'debit') {
    return rows.filter((row) => row.delta < 0);
  }
  return rows.slice();
}

export function appendLedgerItems(
  previous: readonly EntitlementLedgerItem[],
  next: readonly EntitlementLedgerItem[],
): EntitlementLedgerItem[] {
  const seen = new Set(previous.map((item) => item.id));
  const extra = next.filter((item) => !seen.has(item.id));
  return extra.length > 0 ? [...previous, ...extra] : [...previous];
}

export function readEntitlementLedgerPage(body: unknown): EntitlementLedgerPage | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const record = body as { items?: unknown; nextCursor?: unknown };
  if (!Array.isArray(record.items)) {
    return null;
  }
  if (record.nextCursor !== null && typeof record.nextCursor !== 'string') {
    return null;
  }
  if (record.nextCursor === '') {
    return null;
  }
  const items: EntitlementLedgerItem[] = [];
  for (const raw of record.items) {
    if (!isLedgerItem(raw)) {
      return null;
    }
    items.push(raw);
  }
  return { items, nextCursor: record.nextCursor };
}

export function formatLedgerDelta(delta: number): string {
  const amount = Math.abs(delta);
  if (delta > 0) {
    return `+${amount} ${SESSION_LEDGER_UNIT}`;
  }
  if (delta < 0) {
    return `${MINUS}${amount} ${SESSION_LEDGER_UNIT}`;
  }
  return `0 ${SESSION_LEDGER_UNIT}`;
}

export function formatLedgerTime(createdAt: string, businessDate: string): string {
  const stamp = shanghaiStamp(createdAt);
  if (!stamp) {
    return '';
  }
  if (isBusinessDate(businessDate) && stamp.date === businessDate) {
    return `今天 ${stamp.hm}`;
  }
  return `${stamp.date.slice(5)} ${stamp.hm}`;
}

function availabilitySubtitle(balances: EntitlementBalances): string {
  if (balances.dailyFreeRemain === 0) {
    return `日免已用完 · 含场次加油库存 ${balances.inventoryRemain}`;
  }
  return `日免 ${balances.dailyFreeRemain}/${balances.dailyFreeQuota} · 奖励 ${balances.dailyTaskRemain} · 库存 ${balances.inventoryRemain}`;
}

function ledgerMark(delta: number): SessionLedgerMark {
  if (delta > 0) {
    return 'credit';
  }
  if (delta < 0) {
    return 'debit';
  }
  return 'neutral';
}

function ledgerMarkLabel(mark: SessionLedgerMark): string {
  if (mark === 'credit') {
    return '获得';
  }
  if (mark === 'debit') {
    return '消耗';
  }
  return '记录';
}

function ledgerTitle(item: EntitlementLedgerItem): string {
  switch (item.reason) {
    case 'daily_grant':
      return '日免额度发放';
    case 'daily_expire':
      return SESSION_LEDGER_RESET_NOTE;
    case 'task_grant':
      return taskGrantTitle(item);
    case 'inventory_grant':
      return inventoryTitle(item);
    case 'membership_grant':
      return '会员生效/续费';
    case 'deduct':
      return 'AI 出题';
    case 'release_restore':
      return '出题取消退回';
    case 'reserve_hold':
      return '预扣';
    case 'admin_revoke':
      return '权益调整（作废）';
    default: {
      const neverReason: never = item.reason;
      return neverReason;
    }
  }
}

function taskGrantTitle(item: EntitlementLedgerItem): string {
  const hay = `${item.refType} ${item.refId}`.toLowerCase();
  if (includesAny(hay, ['checkin', 'check_in', 'signin', 'sign_in', '签到'])) {
    return '每日签到奖励';
  }
  if (includesAny(hay, ['share', '分享'])) {
    return '每日分享 · 好友打开';
  }
  if (includesAny(hay, ['invite', '邀请'])) {
    return '邀请注册奖励';
  }
  return '任务奖励';
}

/**
 * 加油包入账的 source 不在流水字段里。
 * 支付履约的 refId 是 `order:…`；ref 里带 session_pack 时同样视为加油包。
 * 其余库存入账（如后管 `admin:`）用「场次加油入账」。数量用 delta，不写死。
 */
function inventoryTitle(item: EntitlementLedgerItem): string {
  const hay = `${item.refType} ${item.refId}`.toLowerCase();
  const pack = hay.includes('session_pack') || item.refId.startsWith('order:');
  const base = pack ? '场次加油包' : '场次加油入账';
  const qty = Math.abs(item.delta);
  return qty > 0 ? `${base} · ${qty} ${SESSION_LEDGER_UNIT}` : base;
}

function includesAny(hay: string, tokens: readonly string[]): boolean {
  return tokens.some((token) => hay.includes(token));
}

function readBalances(value: EntitlementBalances | undefined): EntitlementBalances | null {
  if (!value) {
    return null;
  }
  const dailyFreeRemain = readCount(value.dailyFreeRemain);
  const dailyFreeQuota = readCount(value.dailyFreeQuota);
  const dailyTaskRemain = readCount(value.dailyTaskRemain);
  const inventoryRemain = readCount(value.inventoryRemain);
  if (
    dailyFreeRemain === null ||
    dailyFreeQuota === null ||
    dailyTaskRemain === null ||
    inventoryRemain === null
  ) {
    return null;
  }
  return { dailyFreeRemain, dailyFreeQuota, dailyTaskRemain, inventoryRemain };
}

function readCount(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function isBusinessDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isLedgerItem(value: unknown): value is EntitlementLedgerItem {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    row.id.length > 0 &&
    typeof row.delta === 'number' &&
    Number.isInteger(row.delta) &&
    typeof row.bucket === 'string' &&
    LEDGER_BUCKETS.has(row.bucket) &&
    typeof row.reason === 'string' &&
    LEDGER_REASONS.has(row.reason) &&
    typeof row.refType === 'string' &&
    typeof row.refId === 'string' &&
    typeof row.bizDate === 'string' &&
    isBusinessDate(row.bizDate) &&
    typeof row.createdAt === 'string' &&
    shanghaiStamp(row.createdAt) !== null
  );
}

function shanghaiStamp(iso: string): { date: string; hm: string } | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  const year = pick('year');
  const month = pick('month');
  const day = pick('day');
  const hour = pick('hour') === '24' ? '00' : pick('hour');
  const minute = pick('minute');
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month) || !/^\d{2}$/.test(day)) {
    return null;
  }
  if (!/^\d{2}$/.test(hour) || !/^\d{2}$/.test(minute)) {
    return null;
  }
  return { date: `${year}-${month}-${day}`, hm: `${hour}:${minute}` };
}
