/**
 * TB-25 / C9 会员支付调用壳。
 * 只复用 TB-23：询价、下单、mock-notify、查单、权益刷新。
 * 不读取商户私钥，也不新开 HTTP endpoint。半屏不要引用本文件。
 */
import {
  ApiErrorCode,
  ORDER_KINDS,
  ORDER_STATUSES,
  resolveOrderKind,
  type CommerceSkuPublic,
  type EntitlementView,
  type OrderKind,
  type OrderStatus,
  type UpgradeQuote,
  type WechatPayParams,
} from '@tishuashua/shared';
import { pickSessionPack } from './exhausted-sheet';
import { HttpError } from './http-error';

export const MEMBER_DOWNGRADE_MESSAGE = '不支持降级';
export const MEMBER_PAY_UNAVAILABLE_MESSAGE = '支付暂不可用';
export const MEMBER_PAY_CANCELLED = 'PAY_CANCELLED';
export const MEMBER_PAY_IN_PROGRESS = 'PAY_IN_PROGRESS';
export const MEMBER_ORDER_POLL_INTERVAL_MS = 1000;
export const MEMBER_ORDER_POLL_LIMIT = 15;

/** 目录没给天数时，用 TB-23 钉死的档位序比较，不用来写价格。 */
const MEMBER_TIER_DURATION_DAYS: Record<string, number> = {
  member_week: 7,
  member_month: 30,
  member_quarter: 90,
  member_year: 365,
};

export const MEMBERSHIP_PAY_PATHS = {
  upgradeQuote: '/orders/upgrade-quote',
  orders: '/orders',
  order: (outTradeNo: string) => `/orders/${encodeURIComponent(outTradeNo)}`,
  mockNotify: '/dev/pay/mock-notify',
} as const;

const OUT_TRADE_NO = /^[A-Za-z0-9][A-Za-z0-9_-]{5,31}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{1,64}$/;

export interface MemberOrderSnapshot {
  outTradeNo: string;
  status: OrderStatus;
  amountFen: number;
  skuCode: string;
  orderKind: OrderKind;
  payParams: WechatPayParams | null;
}

export interface MemberOrderRequest {
  skuCode: string;
  orderKind: OrderKind;
  clientIdempotencyKey: string;
}

export type PaymentLaunch = { ok: true } | { ok: false; cancelled: boolean; message: string };

export interface MembershipPayTransport {
  upgradeQuote(token: string, targetSkuCode: string): Promise<UpgradeQuote>;
  createOrder(token: string, body: MemberOrderRequest): Promise<MemberOrderSnapshot>;
  mockNotify(outTradeNo: string): Promise<void>;
  getOrder(token: string, outTradeNo: string): Promise<MemberOrderSnapshot>;
  requestPayment(params: WechatPayParams): Promise<PaymentLaunch>;
  readEntitlement(token: string): Promise<EntitlementView>;
}

export interface MembershipCatalogTransport {
  listMemberSkus(token: string): Promise<CommerceSkuPublic[]>;
  listSessionPacks(token: string): Promise<CommerceSkuPublic[]>;
  readEntitlement(token: string): Promise<EntitlementView>;
}

export type MemberSelection =
  | {
      ok: true;
      kind: OrderKind;
      currentDurationDays: number | null;
      targetDurationDays: number | null;
    }
  | { ok: false; code: string; message: string };

export interface MembershipPaySuccess {
  ok: true;
  orderKind: OrderKind;
  amountFen: number;
  quotedPayFen: number | null;
  outTradeNo: string;
  entitlement: EntitlementView;
}

export interface MembershipPayFailure {
  ok: false;
  code: string;
  message: string;
}

export type MembershipPayResult = MembershipPaySuccess | MembershipPayFailure;

export interface MembershipOffer {
  ok: true;
  skus: CommerceSkuPublic[];
  entitlement: EntitlementView;
  sessionPack: CommerceSkuPublic | null;
  selectedCode: string | null;
}

export interface PayMembershipInput {
  token: string;
  target: CommerceSkuPublic;
  membershipActive: boolean;
  currentSkuCode: string | null;
  catalog: readonly CommerceSkuPublic[];
  clientIdempotencyKey?: string;
  sleep?: (ms: number) => Promise<void>;
}

export function memberDurationDays(
  sku: { code: string; durationDays?: number | null } | null | undefined,
): number | null {
  if (!sku) {
    return null;
  }
  const days = sku.durationDays;
  if (typeof days === 'number' && Number.isInteger(days) && days >= 1) {
    return days;
  }
  return MEMBER_TIER_DURATION_DAYS[sku.code] ?? null;
}

export function memberSkusOnly(items: readonly CommerceSkuPublic[]): CommerceSkuPublic[] {
  return items.filter((item) => item.type === 'member');
}

export function pickDefaultMemberSku(
  items: readonly CommerceSkuPublic[],
): CommerceSkuPublic | null {
  const members = memberSkusOnly(items);
  return members.find((item) => item.recommended) ?? members[0] ?? null;
}

export function describeMemberSelection(input: {
  membershipActive: boolean;
  currentSkuCode: string | null;
  catalog: readonly CommerceSkuPublic[];
  target: CommerceSkuPublic;
}): MemberSelection {
  if (input.target.type !== 'member') {
    return { ok: false, code: ApiErrorCode.PAY_SKU_UNAVAILABLE, message: '只能购买会员档位' };
  }
  const targetDurationDays = memberDurationDays(input.target);
  const current =
    input.membershipActive && input.currentSkuCode
      ? (input.catalog.find((item) => item.code === input.currentSkuCode) ?? {
          code: input.currentSkuCode,
          durationDays: null,
        })
      : null;
  const currentDurationDays = input.membershipActive ? memberDurationDays(current) : null;
  const decision = resolveOrderKind({
    skuType: 'member',
    requested: null,
    memberActive: input.membershipActive,
    currentDurationDays,
    targetDurationDays,
  });
  if (!decision.ok) {
    if (decision.code === ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN) {
      return { ok: false, code: decision.code, message: MEMBER_DOWNGRADE_MESSAGE };
    }
    return { ok: false, code: decision.code, message: decision.message };
  }
  return { ok: true, kind: decision.kind, currentDurationDays, targetDurationDays };
}

export function isMockPayParams(params: WechatPayParams | null | undefined): boolean {
  return Boolean(params && params.signType === 'RSA' && params.paySign === 'mock');
}

export function isLivePayParams(
  params: WechatPayParams | null | undefined,
): params is WechatPayParams {
  if (!params || params.paySign === 'mock' || params.signType !== 'RSA') {
    return false;
  }
  return Boolean(params.timeStamp && params.nonceStr && params.package && params.paySign);
}

export function createMembershipIdempotencyKey(now = Date.now(), random = Math.random()): string {
  const noise = Math.floor(random * 36 ** 6).toString(36);
  return `m${now.toString(36)}${noise}`.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
}

export function createIdempotencyStore() {
  let current: { code: string; key: string } | null = null;
  return {
    keyFor(code: string) {
      if (current?.code !== code) {
        current = { code, key: createMembershipIdempotencyKey() };
      }
      return current.key;
    },
    clear() {
      current = null;
    },
  };
}

export function parseUpgradeQuote(value: unknown): UpgradeQuote | null {
  if (!isPlain(value)) {
    return null;
  }
  if (typeof value.currentSkuCode !== 'string' || typeof value.targetSkuCode !== 'string') {
    return null;
  }
  if (!isFen(value.remainingDays) || !isFen(value.remainingValueFen) || !isFen(value.payFen)) {
    return null;
  }
  if (value.currency !== 'CNY') {
    return null;
  }
  return {
    currentSkuCode: value.currentSkuCode,
    targetSkuCode: value.targetSkuCode,
    remainingDays: value.remainingDays,
    remainingValueFen: value.remainingValueFen,
    payFen: value.payFen,
    currency: 'CNY',
  };
}

export function parseMemberOrder(value: unknown): MemberOrderSnapshot | null {
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
  if (!isOrderKind(value.orderKind)) {
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
    orderKind: value.orderKind,
    payParams,
  };
}

export async function loadMembershipOffer(
  token: string,
  catalog: MembershipCatalogTransport,
): Promise<MembershipOffer | MembershipPayFailure> {
  try {
    const [listed, entitlement] = await Promise.all([
      catalog.listMemberSkus(token),
      catalog.readEntitlement(token),
    ]);
    const skus = memberSkusOnly(listed);
    let sessionPack: CommerceSkuPublic | null = null;
    try {
      sessionPack = pickSessionPack(await catalog.listSessionPacks(token));
    } catch {
      sessionPack = null;
    }
    return {
      ok: true,
      skus,
      entitlement,
      sessionPack,
      selectedCode: pickDefaultMemberSku(skus)?.code ?? null,
    };
  } catch (error) {
    return failureFromUnknown(error);
  }
}

export async function payMembership(
  input: PayMembershipInput,
  transport: MembershipPayTransport,
): Promise<MembershipPayResult> {
  try {
    const decision = describeMemberSelection({
      membershipActive: input.membershipActive,
      currentSkuCode: input.currentSkuCode,
      catalog: input.catalog,
      target: input.target,
    });
    if (!decision.ok) {
      return decision;
    }
    let quotedPayFen: number | null = null;
    if (decision.kind === 'upgrade') {
      const quote = await transport.upgradeQuote(input.token, input.target.code);
      quotedPayFen = quote.payFen;
    }
    const created = await transport.createOrder(input.token, {
      skuCode: input.target.code,
      orderKind: decision.kind,
      clientIdempotencyKey: normalizeKey(input.clientIdempotencyKey),
    });
    if (created.status === 'paid') {
      return finish(input.token, transport, decision.kind, quotedPayFen, created);
    }
    if (created.status !== 'prepay' && created.status !== 'created') {
      return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '支付未完成' };
    }
    if (isMockPayParams(created.payParams)) {
      await transport.mockNotify(created.outTradeNo);
    } else if (isLivePayParams(created.payParams)) {
      const launch = await transport.requestPayment(created.payParams);
      if (!launch.ok) {
        if (launch.cancelled) {
          return { ok: false, code: MEMBER_PAY_CANCELLED, message: '已取消支付' };
        }
        return { ok: false, code: 'PAY_LAUNCH_FAILED', message: launch.message || '支付未完成' };
      }
    } else {
      return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '支付参数缺失' };
    }
    const paid = await pollPaid(input.token, created.outTradeNo, transport, input.sleep ?? delay);
    return finish(input.token, transport, decision.kind, quotedPayFen, paid);
  } catch (error) {
    return failureFromUnknown(error);
  }
}

export function createMembershipPayer(transport: MembershipPayTransport) {
  let locked = false;
  return {
    pay(input: PayMembershipInput): Promise<MembershipPayResult> {
      if (locked) {
        return Promise.resolve({
          ok: false,
          code: MEMBER_PAY_IN_PROGRESS,
          message: '支付处理中',
        });
      }
      locked = true;
      return payMembership(input, transport).finally(() => {
        locked = false;
      });
    },
  };
}

async function finish(
  token: string,
  transport: MembershipPayTransport,
  orderKind: OrderKind,
  quotedPayFen: number | null,
  order: MemberOrderSnapshot,
): Promise<MembershipPayResult> {
  const entitlement = await transport.readEntitlement(token);
  if (!entitlement.membership.active) {
    return { ok: false, code: ApiErrorCode.PAY_ORDER_STATE, message: '会员尚未生效' };
  }
  return {
    ok: true,
    orderKind,
    amountFen: order.amountFen,
    quotedPayFen,
    outTradeNo: order.outTradeNo,
    entitlement,
  };
}

async function pollPaid(
  token: string,
  outTradeNo: string,
  transport: MembershipPayTransport,
  sleep: (ms: number) => Promise<void>,
): Promise<MemberOrderSnapshot> {
  for (let attempt = 0; attempt < MEMBER_ORDER_POLL_LIMIT; attempt += 1) {
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
    if (attempt < MEMBER_ORDER_POLL_LIMIT - 1) {
      await sleep(MEMBER_ORDER_POLL_INTERVAL_MS);
    }
  }
  throw new HttpError('支付结果确认超时', 0, 'PAY_CONFIRM_TIMEOUT');
}

function normalizeKey(key: string | undefined): string {
  if (key && IDEMPOTENCY_KEY.test(key)) {
    return key;
  }
  return createMembershipIdempotencyKey();
}

function failureFromUnknown(error: unknown): MembershipPayFailure {
  if (error instanceof HttpError) {
    if (error.code === ApiErrorCode.PAY_NOT_CONFIGURED) {
      return { ok: false, code: error.code, message: MEMBER_PAY_UNAVAILABLE_MESSAGE };
    }
    if (error.code === ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN) {
      return { ok: false, code: error.code, message: MEMBER_DOWNGRADE_MESSAGE };
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

function isOrderKind(value: unknown): value is OrderKind {
  return typeof value === 'string' && (ORDER_KINDS as readonly string[]).includes(value);
}

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

function isPlain(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
