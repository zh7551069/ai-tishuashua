/**
 * 微信支付与订单的类型、询价和纯校验。
 * admin / mini 会经 barrel 加载本文件。这里没有密钥、不读文件、也不引用支付 SDK。
 */
import { ApiErrorCode, type ApiErrorCode as ApiErrorCodeValue } from './errors';
import { SKU_CODE_PATTERN, type SkuType } from './commerce-config';

export const ORDER_KINDS = ['purchase', 'renew', 'upgrade'] as const;
export type OrderKind = (typeof ORDER_KINDS)[number];

export const ORDER_STATUSES = [
  'created',
  'prepay',
  'paid',
  'closed',
  'failed',
  'refunding',
  'refunded',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** 预下单超过这个时间，用户或后管读取时关单。回调到达前仍可入账。 */
export const ORDER_PREPAY_TTL_MS = 2 * 60 * 60 * 1000;

export const PAY_CURRENCY = 'CNY' as const;

/** 加油包快照没有天数时用这一档。 */
export const DEFAULT_INVENTORY_EXPIRE_DAYS = 365;

/** 微信账单对账任务名。本刀不调度、不请求微信。 */
export const WECHAT_PAY_BILL_RECONCILE_JOB = 'payment.wechat-bill-reconcile';

export const PAY_NOTIFY_ACK = { code: 'SUCCESS', message: '成功' } as const;

const DAY_MS = 86_400_000;

export interface CommerceSkuPublic {
  code: string;
  type: SkuType;
  name: string;
  priceFen: number;
  priceYuan: number;
  durationDays: number | null;
  sessions: number | null;
  inventoryExpireDays: number | null;
  summary: string;
  recommended: boolean;
}

export interface UpgradeQuote {
  currentSkuCode: string;
  targetSkuCode: string;
  remainingDays: number;
  remainingValueFen: number;
  payFen: number;
  currency: typeof PAY_CURRENCY;
}

export interface WechatPayParams {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface OrderSummary {
  id: string;
  outTradeNo: string;
  status: OrderStatus;
  amountFen: number;
  currency: typeof PAY_CURRENCY;
  skuCode: string;
  skuType: SkuType;
  orderKind: OrderKind;
  paidAt: string | null;
  createdAt: string;
}

export interface OrderMembership {
  active: boolean;
  endsAt: string | null;
  skuCode: string | null;
}

export interface OrderDetail extends OrderSummary {
  membership: OrderMembership | null;
}

export interface OrderCreated extends OrderSummary {
  payParams: WechatPayParams | null;
}

export interface AdminOrderItem extends OrderSummary {
  userId: string;
  wxTransactionId: string | null;
  failReason: string | null;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

export interface WechatPaySettings {
  nodeEnv: string;
  /** 未设置、显式打开、显式关闭。只有 false 或 0 算关闭。 */
  enabledFlag: 'unset' | 'on' | 'off';
  mock: boolean;
  appId: string;
  mchId: string;
  mchSerialNo: string;
  hasPrivateKey: boolean;
  apiV3Key: string;
  notifyUrl: string;
  hasPlatformCert: boolean;
}

export type WechatPayMode = 'mock' | 'live' | 'off';

export function orderGrantRef(outTradeNo: string): string {
  return `order:${outTradeNo}`;
}

export function addWholeDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY_MS);
}

/**
 * 差价公式。remainingDays 用 86400 秒向上取整，剩余价值向下取整。
 * currentDurationDays 小于 1 时返回 null，避免除零。
 */
export function quoteMemberUpgrade(input: {
  now: Date;
  endsAt: Date;
  currentPriceFen: number;
  currentDurationDays: number;
  targetPriceFen: number;
}): { remainingDays: number; remainingValueFen: number; payFen: number } | null {
  if (!Number.isInteger(input.currentDurationDays) || input.currentDurationDays < 1) {
    return null;
  }
  if (!Number.isInteger(input.currentPriceFen) || input.currentPriceFen < 0) {
    return null;
  }
  if (!Number.isInteger(input.targetPriceFen) || input.targetPriceFen < 0) {
    return null;
  }
  const remainingMs = input.endsAt.getTime() - input.now.getTime();
  const remainingDays = Math.max(0, Math.ceil(remainingMs / DAY_MS));
  const remainingValueFen = Math.floor(
    (input.currentPriceFen * remainingDays) / input.currentDurationDays,
  );
  const payFen = Math.max(0, input.targetPriceFen - remainingValueFen);
  return { remainingDays, remainingValueFen, payFen };
}

/** 支付层算好最终 endsAt 再交给 grant。grant 内部仍用 GREATEST。 */
export function membershipEndsAt(input: {
  kind: 'purchase' | 'renew' | 'upgrade';
  paidAt: Date;
  durationDays: number;
  currentEndsAt: Date | null;
}): Date {
  if (input.kind === 'renew') {
    const current = input.currentEndsAt?.getTime();
    const base = Math.max(current ?? input.paidAt.getTime(), input.paidAt.getTime());
    return addWholeDays(new Date(base), input.durationDays);
  }
  return addWholeDays(input.paidAt, input.durationDays);
}

export function resolveWechatPayMode(settings: WechatPaySettings): WechatPayMode {
  if (settings.enabledFlag === 'off') {
    return 'off';
  }
  if (settings.nodeEnv !== 'production' && settings.mock) {
    return 'mock';
  }
  if (isLiveReady(settings)) {
    return 'live';
  }
  return 'off';
}

export function isMockNotifyEnabled(settings: WechatPaySettings): boolean {
  return resolveWechatPayMode(settings) === 'mock';
}

export function resolveOrderKind(input: {
  skuType: SkuType;
  requested: OrderKind | null;
  memberActive: boolean;
  currentDurationDays: number | null;
  targetDurationDays: number | null;
}): { ok: true; kind: OrderKind } | { ok: false; code: ApiErrorCodeValue; message: string } {
  if (input.skuType === 'session_pack') {
    if (input.requested && input.requested !== 'purchase') {
      return { ok: false, code: ApiErrorCode.VALIDATION_ERROR, message: '加油包只能购买' };
    }
    return { ok: true, kind: 'purchase' };
  }
  if (input.targetDurationDays === null) {
    return { ok: false, code: ApiErrorCode.PAY_SKU_UNAVAILABLE, message: '会员档位不可用' };
  }
  if (!input.memberActive) {
    if (input.requested === 'renew' || input.requested === 'upgrade') {
      return {
        ok: false,
        code: ApiErrorCode.PAY_ORDER_STATE,
        message: '当前没有生效会员，请直接购买',
      };
    }
    return { ok: true, kind: 'purchase' };
  }
  if (input.currentDurationDays === null) {
    return {
      ok: false,
      code: ApiErrorCode.PAY_ORDER_STATE,
      message: '无法比较当前会员档位',
    };
  }
  const delta = input.targetDurationDays - input.currentDurationDays;
  if (delta < 0) {
    return {
      ok: false,
      code: ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN,
      message: '不能购买更低档位的会员',
    };
  }
  if (delta === 0) {
    if (input.requested === 'upgrade') {
      return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '同档请走续费' };
    }
    return { ok: true, kind: 'renew' };
  }
  return { ok: true, kind: 'upgrade' };
}

export function parseCreateOrderBody(
  input: unknown,
): ParseResult<{
  skuCode: string;
  orderKind: OrderKind | null;
  clientIdempotencyKey: string | null;
}> {
  if (!isPlain(input)) {
    return { ok: false, message: '下单参数不正确' };
  }
  for (const key of Object.keys(input)) {
    if (key === 'amountFen' || key === 'amount') {
      continue;
    }
    if (key !== 'skuCode' && key !== 'orderKind' && key !== 'clientIdempotencyKey') {
      return { ok: false, message: '下单参数不正确' };
    }
  }
  if (typeof input.skuCode !== 'string' || !SKU_CODE_PATTERN.test(input.skuCode)) {
    return { ok: false, message: 'skuCode 不正确' };
  }
  let orderKind: OrderKind | null = null;
  if ('orderKind' in input && input.orderKind !== undefined && input.orderKind !== null) {
    if (!isOrderKind(input.orderKind)) {
      return { ok: false, message: 'orderKind 不正确' };
    }
    orderKind = input.orderKind;
  }
  let clientIdempotencyKey: string | null = null;
  if (
    'clientIdempotencyKey' in input &&
    input.clientIdempotencyKey !== undefined &&
    input.clientIdempotencyKey !== null &&
    input.clientIdempotencyKey !== ''
  ) {
    if (
      typeof input.clientIdempotencyKey !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(input.clientIdempotencyKey)
    ) {
      return { ok: false, message: 'clientIdempotencyKey 不正确' };
    }
    clientIdempotencyKey = input.clientIdempotencyKey;
  }
  return { ok: true, value: { skuCode: input.skuCode, orderKind, clientIdempotencyKey } };
}

export function parseUpgradeQuoteBody(input: unknown): ParseResult<{ targetSkuCode: string }> {
  if (!isPlain(input)) {
    return { ok: false, message: '询价参数不正确' };
  }
  if (Object.keys(input).some((key) => key !== 'targetSkuCode')) {
    return { ok: false, message: '询价参数不正确' };
  }
  if (typeof input.targetSkuCode !== 'string' || !SKU_CODE_PATTERN.test(input.targetSkuCode)) {
    return { ok: false, message: 'targetSkuCode 不正确' };
  }
  return { ok: true, value: { targetSkuCode: input.targetSkuCode } };
}

export function parseMockNotifyBody(
  input: unknown,
): ParseResult<{ outTradeNo: string; transactionId: string | null }> {
  if (!isPlain(input)) {
    return { ok: false, message: '回调参数不正确' };
  }
  for (const key of Object.keys(input)) {
    if (key !== 'outTradeNo' && key !== 'transactionId') {
      return { ok: false, message: '回调参数不正确' };
    }
  }
  if (
    typeof input.outTradeNo !== 'string' ||
    !/^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/.test(input.outTradeNo)
  ) {
    return { ok: false, message: 'outTradeNo 不正确' };
  }
  let transactionId: string | null = null;
  if (
    'transactionId' in input &&
    input.transactionId !== undefined &&
    input.transactionId !== null &&
    input.transactionId !== ''
  ) {
    if (
      typeof input.transactionId !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(input.transactionId)
    ) {
      return { ok: false, message: 'transactionId 不正确' };
    }
    transactionId = input.transactionId;
  }
  return { ok: true, value: { outTradeNo: input.outTradeNo, transactionId } };
}

export function parseSkuCatalogQuery(typeRaw: unknown): ParseResult<SkuType | null> {
  if (typeRaw === undefined || typeRaw === null || typeRaw === '') {
    return { ok: true, value: null };
  }
  if (typeRaw !== 'member' && typeRaw !== 'session_pack') {
    return { ok: false, message: 'type 只能是 member 或 session_pack' };
  }
  return { ok: true, value: typeRaw };
}

export function parseOrderListQuery(
  limitRaw: unknown,
  cursorRaw: unknown,
): ParseResult<{ limit: number; cursor: OrderCursor | null }> {
  const limit = readLimit(limitRaw);
  if (limit === null) {
    return { ok: false, message: 'limit 必须是 1 到 50 的整数' };
  }
  if (cursorRaw === undefined || cursorRaw === null || cursorRaw === '') {
    return { ok: true, value: { limit, cursor: null } };
  }
  if (typeof cursorRaw !== 'string') {
    return { ok: false, message: '游标不正确' };
  }
  const cursor = decodeOrderCursor(cursorRaw);
  if (!cursor) {
    return { ok: false, message: '游标不正确' };
  }
  return { ok: true, value: { limit, cursor } };
}

export function parseAdminOrderQuery(input: {
  userId?: unknown;
  outTradeNo?: unknown;
  status?: unknown;
  limit?: unknown;
  cursor?: unknown;
}): ParseResult<{
  userId: string | null;
  outTradeNo: string | null;
  status: OrderStatus | null;
  limit: number;
  cursor: OrderCursor | null;
}> {
  const page = parseOrderListQuery(input.limit, input.cursor);
  if (!page.ok) {
    return page;
  }
  let userId: string | null = null;
  if (input.userId !== undefined && input.userId !== null && input.userId !== '') {
    if (typeof input.userId !== 'string' || !isUuid(input.userId)) {
      return { ok: false, message: 'userId 不正确' };
    }
    userId = input.userId;
  }
  let outTradeNo: string | null = null;
  if (input.outTradeNo !== undefined && input.outTradeNo !== null && input.outTradeNo !== '') {
    if (
      typeof input.outTradeNo !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/.test(input.outTradeNo)
    ) {
      return { ok: false, message: 'outTradeNo 不正确' };
    }
    outTradeNo = input.outTradeNo;
  }
  let status: OrderStatus | null = null;
  if (input.status !== undefined && input.status !== null && input.status !== '') {
    if (!isOrderStatus(input.status)) {
      return { ok: false, message: 'status 不正确' };
    }
    status = input.status;
  }
  return { ok: true, value: { userId, outTradeNo, status, ...page.value } };
}

export function encodeOrderCursor(createdAt: string, id: string): string {
  return encodeBase64Url(`${createdAt}|${id}`);
}

export function buildOutTradeNo(now: Date, entropyHex: string): string {
  const stamp = now.getTime().toString(36);
  const entropy = entropyHex.replace(/[^a-z0-9]/gi, '').toLowerCase();
  const body = `t${stamp}${entropy}`.slice(0, 32);
  if (body.length < 8) {
    throw new Error('订单号生成失败');
  }
  return body;
}

export function parsePublicSkuList(value: unknown): CommerceSkuPublic[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const items: CommerceSkuPublic[] = [];
  for (const entry of value) {
    const sku = parsePublicSku(entry);
    if (!sku) {
      return null;
    }
    items.push(sku);
  }
  return items;
}

export function parsePriceSnapshot(value: unknown): CommerceSkuPublic | null {
  return parsePublicSku(value);
}

export interface OrderCursor {
  createdAt: string;
  id: string;
}

function isLiveReady(settings: WechatPaySettings): boolean {
  return Boolean(
    settings.appId &&
    settings.mchId &&
    settings.mchSerialNo &&
    settings.hasPrivateKey &&
    settings.apiV3Key &&
    settings.hasPlatformCert &&
    isHttpsUrl(settings.notifyUrl),
  );
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function parsePublicSku(value: unknown): CommerceSkuPublic | null {
  if (!isPlain(value)) {
    return null;
  }
  if (typeof value.code !== 'string' || !SKU_CODE_PATTERN.test(value.code)) {
    return null;
  }
  if (value.type !== 'member' && value.type !== 'session_pack') {
    return null;
  }
  if (typeof value.name !== 'string' || !value.name.trim()) {
    return null;
  }
  if (!isFen(value.priceFen) || typeof value.priceYuan !== 'number') {
    return null;
  }
  if (typeof value.summary !== 'string') {
    return null;
  }
  if (typeof value.recommended !== 'boolean') {
    return null;
  }
  const durationDays = optionalInt(value.durationDays);
  const sessions = optionalInt(value.sessions);
  const inventoryExpireDays = optionalInt(value.inventoryExpireDays);
  if (durationDays === 'invalid' || sessions === 'invalid' || inventoryExpireDays === 'invalid') {
    return null;
  }
  return {
    code: value.code,
    type: value.type,
    name: value.name,
    priceFen: value.priceFen,
    priceYuan: value.priceYuan,
    durationDays,
    sessions,
    inventoryExpireDays,
    summary: value.summary,
    recommended: value.recommended,
  };
}

function optionalInt(value: unknown): number | null | 'invalid' {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  return 'invalid';
}

function isFen(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function readLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === '') {
    return 20;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    return null;
  }
  return parsed;
}

function decodeOrderCursor(cursor: string): OrderCursor | null {
  try {
    const raw = decodeBase64Url(cursor);
    const split = raw.lastIndexOf('|');
    if (split <= 0) {
      return null;
    }
    const createdAt = raw.slice(0, split);
    const id = raw.slice(split + 1);
    if (!isUuid(id) || Number.isNaN(new Date(createdAt).getTime())) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function isOrderKind(value: unknown): value is OrderKind {
  return typeof value === 'string' && (ORDER_KINDS as readonly string[]).includes(value);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const pad = padded + '='.repeat((4 - (padded.length % 4)) % 4);
  const binary = atob(pad);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
