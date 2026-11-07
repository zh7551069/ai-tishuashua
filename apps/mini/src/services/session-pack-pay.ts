/**
 * TB-26 / C10 场次加油包支付调用壳。
 * 只复用 TB-23：拉 session_pack、purchase 下单、mock-notify 或 wx.requestPayment、查单、刷新 inventoryRemain。
 * 不询价。orderKind 只有 purchase。不读商户私钥。半屏不要引用本文件。
 */
import {
  ApiErrorCode,
  type CommerceSkuPublic,
  type EntitlementView,
  type OrderStatus,
  type WechatPayParams,
} from '@tishuashua/shared';
import { HttpError } from './http-error';

export const SESSION_PACK_ORDER_KIND = 'purchase' as const;
export const SESSION_PACK_PAY_CANCELLED = 'PAY_CANCELLED';
export const SESSION_PACK_PAY_IN_PROGRESS = 'PAY_IN_PROGRESS';
export const SESSION_PACK_PAY_UNAVAILABLE_MESSAGE = '支付暂不可用';
export const SESSION_PACK_NOT_PACK_MESSAGE = '只能购买场次加油包';
export const SESSION_PACK_NOT_CREDITED_MESSAGE = '场次尚未入账';
export const SESSION_PACK_ORDER_POLL_INTERVAL_MS = 1000;
export const SESSION_PACK_ORDER_POLL_LIMIT = 15;

export const SESSION_PACK_PAY_PATHS = {
  skus: '/commerce/skus?type=session_pack',
  orders: '/orders',
  order: (outTradeNo: string) => `/orders/${encodeURIComponent(outTradeNo)}`,
  mockNotify: '/dev/pay/mock-notify',
  entitlement: '/me/entitlement',
} as const;

const OUT_TRADE_NO = /^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,64}$/;
const ORDER_STATUSES = [
  'created',
  'prepay',
  'paid',
  'closed',
  'failed',
  'refunding',
  'refunded',
] as const;

export interface SessionPackOrderSnapshot {
  outTradeNo: string;
  status: OrderStatus;
  amountFen: number;
  skuCode: string;
  orderKind: typeof SESSION_PACK_ORDER_KIND;
  payParams: WechatPayParams | null;
}

export interface SessionPackOrderRequest {
  skuCode: string;
  orderKind: typeof SESSION_PACK_ORDER_KIND;
  clientIdempotencyKey: string;
}

export type SessionPackPaymentLaunch =
  { ok: true } | { ok: false; cancelled: boolean; message: string };

export interface SessionPackPayTransport {
  createOrder(token: string, body: SessionPackOrderRequest): Promise<SessionPackOrderSnapshot>;
  mockNotify(outTradeNo: string): Promise<void>;
  getOrder(token: string, outTradeNo: string): Promise<SessionPackOrderSnapshot>;
  requestPayment(params: WechatPayParams): Promise<SessionPackPaymentLaunch>;
  readEntitlement(token: string): Promise<EntitlementView>;
}

export interface SessionPackCatalogTransport {
  listSessionPacks(token: string): Promise<CommerceSkuPublic[]>;
  readEntitlement(token: string): Promise<EntitlementView>;
}

export interface SessionPackPaySuccess {
  ok: true;
  orderKind: typeof SESSION_PACK_ORDER_KIND;
  amountFen: number;
  outTradeNo: string;
  inventoryRemain: number;
  entitlement: EntitlementView;
}

export interface SessionPackPayFailure {
  ok: false;
  code: string;
  message: string;
}

export type SessionPackPayResult = SessionPackPaySuccess | SessionPackPayFailure;

export interface SessionPackOffer {
  ok: true;
  skus: CommerceSkuPublic[];
  entitlement: EntitlementView;
  selectedCode: string | null;
  inventoryRemain: number;
}

export interface PaySessionPackInput {
  token: string;
  target: CommerceSkuPublic;
  /** 下单前的 inventoryRemain。支付成功后必须更大。 */
  inventoryRemainBefore: number;
  clientIdempotencyKey?: string;
  sleep?: (ms: number) => Promise<void>;
  /** 下单响应到达后回调。应付只看这里的 amountFen，页面不另传金额。 */
  onOrder?: (order: SessionPackOrderSnapshot) => void;
}

export function sessionPackSkusOnly(items: readonly CommerceSkuPublic[]): CommerceSkuPublic[] {
  return items.filter((item) => item.type === 'session_pack');
}

export function pickDefaultSessionPack(
  items: readonly CommerceSkuPublic[],
): CommerceSkuPublic | null {
  const packs = sessionPackSkusOnly(items);
  return packs.find((item) => item.recommended) ?? packs[0] ?? null;
}

export function isMockSessionPackPayParams(params: WechatPayParams | null | undefined): boolean {
  return Boolean(params && params.signType === 'RSA' && params.paySign === 'mock');
}

export function isLiveSessionPackPayParams(
  params: WechatPayParams | null | undefined,
): params is WechatPayParams {
  if (!params || params.paySign === 'mock' || params.signType !== 'RSA') {
    return false;
  }
  return Boolean(params.timeStamp && params.nonceStr && params.package && params.paySign);
}

export function createSessionPackIdempotencyKey(now = Date.now(), random = Math.random()): string {
  const noise = Math.floor(random * 36 ** 6).toString(36);
  return `p${now.toString(36)}${noise}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function createSessionPackIdempotencyStore() {
  let current: { code: string; key: string } | null = null;
  return {
    keyFor(code: string) {
      if (current?.code !== code) {
        current = { code, key: createSessionPackIdempotencyKey() };
      }
      return current.key;
    },
    clear() {
      current = null;
    },
  };
}

export function parseSessionPackOrder(value: unknown): SessionPackOrderSnapshot | null {
  if (!isPlain(value)) {
    return null;
  }
  if (typeof value.outTradeNo !== 'string' || !OUT_TRADE_NO.test(value.outTradeNo)) {
    return null;
  }
  if (
    !isOrderStatus(value.status) ||
    !isFen(value.amountFen) ||
    typeof value.skuCode !== 'string'
  ) {
    return null;
  }
  if (value.orderKind !== SESSION_PACK_ORDER_KIND) {
    return null;
  }
  const payParams = parsePayParams(value.payParams);
  if (payParams === 'invalid') {
    return null;
  }
  return {
    outTradeNo: value.outTradeNo,
    status: value.status,
    amountFen: value.amountFen,
    skuCode: value.skuCode,
    orderKind: SESSION_PACK_ORDER_KIND,
    payParams,
  };
}

export async function loadSessionPackOffer(
  token: string,
  catalog: SessionPackCatalogTransport,
): Promise<SessionPackOffer | SessionPackPayFailure> {
  try {
    const [listed, entitlement] = await Promise.all([
      catalog.listSessionPacks(token),
      catalog.readEntitlement(token),
    ]);
    const skus = sessionPackSkusOnly(listed);
    return {
      ok: true,
      skus,
      entitlement,
      selectedCode: pickDefaultSessionPack(skus)?.code ?? null,
      inventoryRemain: entitlement.balances.inventoryRemain,
    };
  } catch (error) {
    return failureFromUnknown(error);
  }
}

export async function paySessionPack(
  input: PaySessionPackInput,
  transport: SessionPackPayTransport,
): Promise<SessionPackPayResult> {
  try {
    if (input.target.type !== 'session_pack') {
      return {
        ok: false,
        code: ApiErrorCode.PAY_SKU_UNAVAILABLE,
        message: SESSION_PACK_NOT_PACK_MESSAGE,
      };
    }
    if (!isRemain(input.inventoryRemainBefore)) {
      return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '当前场次库存无法确认' };
    }
    const created = await transport.createOrder(input.token, {
      skuCode: input.target.code,
      orderKind: SESSION_PACK_ORDER_KIND,
      clientIdempotencyKey: normalizeKey(input.clientIdempotencyKey),
    });
    input.onOrder?.(created);
    const paid = await settle(input, transport, created);
    if (!paid.ok) {
      return paid;
    }
    return finish(input, transport, paid.order);
  } catch (error) {
    return failureFromUnknown(error);
  }
}

export function createSessionPackPayer(transport: SessionPackPayTransport) {
  let locked = false;
  return {
    pay(input: PaySessionPackInput): Promise<SessionPackPayResult> {
      if (locked) {
        return Promise.resolve({
          ok: false,
          code: SESSION_PACK_PAY_IN_PROGRESS,
          message: '支付处理中',
        });
      }
      locked = true;
      return paySessionPack(input, transport).finally(() => {
        locked = false;
      });
    },
  };
}

async function settle(
  input: PaySessionPackInput,
  transport: SessionPackPayTransport,
  created: SessionPackOrderSnapshot,
): Promise<{ ok: true; order: SessionPackOrderSnapshot } | SessionPackPayFailure> {
  if (created.status === 'paid') {
    return { ok: true, order: created };
  }
  if (created.status !== 'prepay' && created.status !== 'created') {
    return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '支付未完成' };
  }
  if (isMockSessionPackPayParams(created.payParams)) {
    await transport.mockNotify(created.outTradeNo);
  } else if (isLiveSessionPackPayParams(created.payParams)) {
    const launch = await transport.requestPayment(created.payParams);
    if (!launch.ok) {
      if (launch.cancelled) {
        return { ok: false, code: SESSION_PACK_PAY_CANCELLED, message: '已取消支付' };
      }
      return { ok: false, code: 'PAY_LAUNCH_FAILED', message: launch.message || '支付未完成' };
    }
  } else {
    return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '支付参数缺失' };
  }
  const order = await pollPaid(input.token, created.outTradeNo, transport, input.sleep ?? delay);
  return { ok: true, order };
}

async function finish(
  input: PaySessionPackInput,
  transport: SessionPackPayTransport,
  order: SessionPackOrderSnapshot,
): Promise<SessionPackPayResult> {
  const entitlement = await transport.readEntitlement(input.token);
  const inventoryRemain = entitlement.balances.inventoryRemain;
  if (!isRemain(inventoryRemain) || inventoryRemain <= input.inventoryRemainBefore) {
    return {
      ok: false,
      code: ApiErrorCode.PAY_ORDER_STATE,
      message: SESSION_PACK_NOT_CREDITED_MESSAGE,
    };
  }
  return {
    ok: true,
    orderKind: SESSION_PACK_ORDER_KIND,
    amountFen: order.amountFen,
    outTradeNo: order.outTradeNo,
    inventoryRemain,
    entitlement,
  };
}

async function pollPaid(
  token: string,
  outTradeNo: string,
  transport: SessionPackPayTransport,
  sleep: (ms: number) => Promise<void>,
): Promise<SessionPackOrderSnapshot> {
  for (let attempt = 0; attempt < SESSION_PACK_ORDER_POLL_LIMIT; attempt += 1) {
    const order = await transport.getOrder(token, outTradeNo);
    if (order.status === 'paid') {
      return order;
    }
    if (
      order.status === 'failed' ||
      order.status === 'closed' ||
      order.status === 'refunded' ||
      order.status === 'refunding'
    ) {
      throw new HttpError('支付未完成', 409, ApiErrorCode.PAY_ORDER_STATE);
    }
    if (attempt < SESSION_PACK_ORDER_POLL_LIMIT - 1) {
      await sleep(SESSION_PACK_ORDER_POLL_INTERVAL_MS);
    }
  }
  throw new HttpError('支付结果确认超时', 0, 'PAY_CONFIRM_TIMEOUT');
}

function normalizeKey(key: string | undefined): string {
  if (key && IDEMPOTENCY_KEY.test(key)) {
    return key;
  }
  return createSessionPackIdempotencyKey();
}

function failureFromUnknown(error: unknown): SessionPackPayFailure {
  if (error instanceof HttpError) {
    if (error.code === ApiErrorCode.PAY_NOT_CONFIGURED) {
      return { ok: false, code: error.code, message: SESSION_PACK_PAY_UNAVAILABLE_MESSAGE };
    }
    return {
      ok: false,
      code: error.code ?? 'REQUEST_FAILED',
      message: error.message || '请求失败',
    };
  }
  if (error instanceof Error && error.message) {
    return { ok: false, code: 'REQUEST_FAILED', message: error.message };
  }
  return { ok: false, code: 'REQUEST_FAILED', message: '请求失败' };
}

function parsePayParams(value: unknown): WechatPayParams | null | 'invalid' {
  if (value === undefined || value === null) {
    return null;
  }
  if (!isPlain(value) || value.signType !== 'RSA') {
    return 'invalid';
  }
  if (
    typeof value.timeStamp !== 'string' ||
    typeof value.nonceStr !== 'string' ||
    typeof value.package !== 'string' ||
    typeof value.paySign !== 'string'
  ) {
    return 'invalid';
  }
  if (!value.timeStamp || !value.nonceStr || !value.package || !value.paySign) {
    return 'invalid';
  }
  return {
    timeStamp: value.timeStamp,
    nonceStr: value.nonceStr,
    package: value.package,
    signType: 'RSA',
    paySign: value.paySign,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isFen(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isRemain(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
