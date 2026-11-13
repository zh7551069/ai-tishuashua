import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ApiErrorCode, type CommerceSkuPublic, type EntitlementView } from '@tishuashua/shared';
import { HttpError } from './http-error';
import {
  SESSION_PACK_NOT_CREDITED_MESSAGE,
  SESSION_PACK_NOT_PACK_MESSAGE,
  SESSION_PACK_ORDER_POLL_INTERVAL_MS,
  SESSION_PACK_ORDER_POLL_LIMIT,
  SESSION_PACK_PAY_CANCELLED,
  SESSION_PACK_PAY_IN_PROGRESS,
  SESSION_PACK_PAY_UNAVAILABLE_MESSAGE,
  createSessionPackIdempotencyKey,
  createSessionPackIdempotencyStore,
  createSessionPackPayer,
  loadSessionPackOffer,
  parseSessionPackOrder,
  paySessionPack,
  pickDefaultSessionPack,
  type SessionPackCatalogTransport,
  type SessionPackOrderRequest,
  type SessionPackOrderSnapshot,
  type SessionPackPayTransport,
  type SessionPackPaymentLaunch,
} from './session-pack-pay';
import {
  SESSION_PACK_CLOSE,
  SESSION_PACK_MEMBER_NOTE,
  SESSION_PACK_RULES,
  SESSION_PACK_SUCCESS_TOAST,
  SESSION_PACK_TITLE,
  sessionPackHeadline,
  sessionPackPayLabel,
  sessionPackPayableFen,
  sessionPackPriceLabel,
  sessionPackSubtitle,
} from './session-pack-present';

const miniRoot = join(__dirname, '../..');

test('只接受场次加油包的 purchase，会员档和其它订单类型不建单', async () => {
  const calls = recorder();
  const blocked = await paySessionPack(
    {
      token: 'token',
      target: pack({ type: 'member', code: 'member_month', sessions: null, priceFen: 3200 }),
      inventoryRemainBefore: 0,
    },
    calls.transport,
  );
  assert.deepEqual(blocked, {
    ok: false,
    code: ApiErrorCode.PAY_SKU_UNAVAILABLE,
    message: SESSION_PACK_NOT_PACK_MESSAGE,
  });
  assert.deepEqual(calls.events, []);

  const paid = await paySessionPack(
    {
      token: 'token',
      target: pack({ priceFen: 900, sessions: 9 }),
      inventoryRemainBefore: 1,
      clientIdempotencyKey: 'pack-once',
      sleep: async () => undefined,
    },
    calls.transport,
  );
  assert.equal(paid.ok, true);
  if (paid.ok) {
    assert.equal(paid.orderKind, 'purchase');
  }
  assert.deepEqual(calls.orderBody, {
    skuCode: 'session_pack_9',
    orderKind: 'purchase',
    clientIdempotencyKey: 'pack-once',
  });
  assert.equal(calls.orderBody && 'amountFen' in calls.orderBody, false);
  assert.equal(
    parseSessionPackOrder({
      outTradeNo: 'tmockorder01',
      status: 'prepay',
      amountFen: 900,
      skuCode: 'session_pack_9',
      orderKind: 'renew',
      payParams: null,
    }),
    null,
  );
});

test('mock 支付成功后轮询到 paid，并刷新 inventoryRemain', async () => {
  const calls = recorder();
  calls.createAmountFen = 900;
  calls.inventoryAfter = 10;
  let reads = 0;
  calls.getOrder = async () => {
    reads += 1;
    return snapshot({
      status: reads === 1 ? 'prepay' : 'paid',
      amountFen: 900,
    });
  };
  const slept: number[] = [];
  const accepted: number[] = [];
  const result = await paySessionPack(
    {
      token: 'token',
      target: pack({ priceFen: 1800, sessions: 9, inventoryExpireDays: 180 }),
      inventoryRemainBefore: 1,
      sleep: async (ms) => {
        slept.push(ms);
      },
      onOrder: (order) => accepted.push(order.amountFen),
    },
    calls.transport,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.orderKind, 'purchase');
    assert.equal(result.amountFen, 900);
    assert.equal(result.inventoryRemain, 10);
    assert.equal(result.entitlement.balances.inventoryRemain, 10);
    assert.equal(result.entitlement.membership.active, true);
  }
  assert.deepEqual(accepted, [900]);
  assert.deepEqual(calls.events, ['order', 'mock', 'entitlement']);
  assert.deepEqual(slept, [SESSION_PACK_ORDER_POLL_INTERVAL_MS]);
  assert.equal(reads, 2);
  assert.equal(sessionPackPayLabel(accepted[0] ?? null, false), '微信支付 ¥9');
});

test('库存没有增加不算成功；取消、真支付和未配置都不误报', async () => {
  const flat = recorder();
  flat.inventoryAfter = 4;
  const unchanged = await paySessionPack(
    {
      token: 'token',
      target: pack({}),
      inventoryRemainBefore: 4,
      sleep: async () => undefined,
    },
    flat.transport,
  );
  assert.deepEqual(unchanged, {
    ok: false,
    code: ApiErrorCode.PAY_ORDER_STATE,
    message: SESSION_PACK_NOT_CREDITED_MESSAGE,
  });
  assert.equal(flat.events.includes('entitlement'), true);
  assert.equal(flat.events.includes('mock'), true);

  const cancel = recorder();
  cancel.payParams = liveParams();
  cancel.requestPayment = async () => {
    cancel.events.push('wx');
    return { ok: false, cancelled: true, message: 'cancel' } satisfies SessionPackPaymentLaunch;
  };
  const cancelled = await paySessionPack(
    {
      token: 'token',
      target: pack({}),
      inventoryRemainBefore: 0,
    },
    cancel.transport,
  );
  assert.deepEqual(cancelled, {
    ok: false,
    code: SESSION_PACK_PAY_CANCELLED,
    message: '已取消支付',
  });
  assert.deepEqual(cancel.events, ['order', 'wx']);

  const live = recorder();
  live.payParams = liveParams();
  live.inventoryAfter = 6;
  live.requestPayment = async () => {
    live.events.push('wx');
    return { ok: true };
  };
  const paid = await paySessionPack(
    {
      token: 'token',
      target: pack({}),
      inventoryRemainBefore: 1,
      sleep: async () => undefined,
    },
    live.transport,
  );
  assert.equal(paid.ok, true);
  assert.deepEqual(live.events, ['order', 'wx', 'entitlement']);

  const unavailable = recorder();
  unavailable.createOrder = async () => {
    unavailable.events.push('order');
    throw new HttpError('微信支付未配置', 503, ApiErrorCode.PAY_NOT_CONFIGURED);
  };
  const missing = await paySessionPack(
    {
      token: 'token',
      target: pack({}),
      inventoryRemainBefore: 0,
    },
    unavailable.transport,
  );
  assert.deepEqual(missing, {
    ok: false,
    code: ApiErrorCode.PAY_NOT_CONFIGURED,
    message: SESSION_PACK_PAY_UNAVAILABLE_MESSAGE,
  });
  assert.deepEqual(unavailable.events, ['order']);
});

test('确认超时不刷新库存，支付中的第二下不建第二单', async () => {
  const hanging = recorder();
  let polls = 0;
  hanging.getOrder = async () => {
    polls += 1;
    return snapshot({ status: 'prepay', amountFen: 900 });
  };
  const timedOut = await paySessionPack(
    {
      token: 'token',
      target: pack({}),
      inventoryRemainBefore: 0,
      sleep: async () => undefined,
    },
    hanging.transport,
  );
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.equal(timedOut.message, '支付结果确认超时');
  }
  assert.equal(polls, SESSION_PACK_ORDER_POLL_LIMIT);
  assert.equal(hanging.events.includes('entitlement'), false);

  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = recorder();
  locked.createOrder = async (_token, body) => {
    locked.events.push('order');
    locked.orderBody = body;
    await gate;
    return snapshot({ status: 'paid', amountFen: 900 });
  };
  locked.inventoryAfter = 3;
  const payer = createSessionPackPayer(locked.transport);
  const input = {
    token: 'token',
    target: pack({}),
    inventoryRemainBefore: 0,
  };
  const first = payer.pay(input);
  const second = await payer.pay(input);
  assert.deepEqual(second, {
    ok: false,
    code: SESSION_PACK_PAY_IN_PROGRESS,
    message: '支付处理中',
  });
  release?.();
  const done = await first;
  assert.equal(done.ok, true);
  assert.equal(locked.events.filter((event) => event === 'order').length, 1);
});

test('目录只留加油包，默认推荐，幂等键同档复用', async () => {
  const later = pack({ code: 'session_pack_9', sessions: 9, priceFen: 900, recommended: false });
  const recommended = pack({
    code: 'session_pack_3',
    sessions: 3,
    priceFen: 300,
    recommended: true,
  });
  const listed = [memberSku(), later, recommended];
  assert.equal(pickDefaultSessionPack(listed)?.code, 'session_pack_3');
  assert.equal(pickDefaultSessionPack([later])?.code, 'session_pack_9');
  const catalog: SessionPackCatalogTransport = {
    listSessionPacks: async () => listed,
    readEntitlement: async () => view(2, false),
  };
  const offer = await loadSessionPackOffer('token', catalog);
  assert.equal(offer.ok, true);
  if (offer.ok) {
    assert.deepEqual(
      offer.skus.map((sku) => sku.code),
      ['session_pack_9', 'session_pack_3'],
    );
    assert.equal(offer.selectedCode, 'session_pack_3');
    assert.equal(offer.inventoryRemain, 2);
  }
  const empty = await loadSessionPackOffer('token', {
    listSessionPacks: async () => [],
    readEntitlement: async () => view(0, false),
  });
  assert.equal(empty.ok, true);
  if (empty.ok) {
    assert.deepEqual(empty.skus, []);
    assert.equal(empty.selectedCode, null);
  }

  const key = createSessionPackIdempotencyKey(1_700_000_000_000, 0.5);
  assert.match(key, /^[A-Za-z0-9_-]{1,64}$/);
  const store = createSessionPackIdempotencyStore();
  const first = store.keyFor('session_pack_9');
  assert.equal(store.keyFor('session_pack_9'), first);
  assert.notEqual(store.keyFor('session_pack_3'), first);
});

test('黄卡和支付文案跟服务端数字走，规则固定且不含刷题包售卖', () => {
  const sku = pack({
    sessions: 9,
    priceFen: 900,
    inventoryExpireDays: 180,
    name: '加油',
  });
  assert.equal(sessionPackHeadline(sku), '场次加油 · 9 场出题额度');
  assert.equal(sessionPackSubtitle(sku), '非刷题包 · 购后 180 天 · 跨日不清零');
  assert.equal(sessionPackPriceLabel(sku.priceFen), '¥9');
  assert.equal(sessionPackPayableFen(sku.priceFen, 1200), 1200);
  assert.equal(sessionPackPayableFen(sku.priceFen, null), 900);
  assert.equal(sessionPackPayLabel(1200, false), '微信支付 ¥12');
  assert.equal(sessionPackPayLabel(1200, true), '支付处理中');
  const unnamed = pack({ sessions: null, inventoryExpireDays: null, name: '临时加油包' });
  assert.equal(sessionPackHeadline(unnamed), '临时加油包');
  assert.equal(sessionPackSubtitle(unnamed), '非刷题包 · 跨日不清零');
  assert.equal(/\d+\s*天/.test(sessionPackSubtitle(unnamed)), false);
  assert.equal(SESSION_PACK_TITLE, '购买场次加油包');
  assert.equal(SESSION_PACK_CLOSE, '关闭');
  assert.equal(SESSION_PACK_SUCCESS_TOAST, '购买成功');
  assert.equal(SESSION_PACK_MEMBER_NOTE, '会员期内库存暂不扣');
  assert.deepEqual(SESSION_PACK_RULES, [
    '扣场顺序：日免 → 当日奖励 → 场次加油库存',
    '「再练这 N 道」不额外扣场',
    '1 场 = 成功「AI 开始出题」进入答题页',
  ]);
});

test('对稿页接支付壳，生产源不写死示意档，半屏仍不支付', () => {
  const page = readFileSync(join(miniRoot, 'src/pages/commerce/session-pack/index.tsx'), 'utf8');
  const css = readFileSync(join(miniRoot, 'src/pages/commerce/session-pack/index.css'), 'utf8');
  const pay = readFileSync(join(miniRoot, 'src/services/session-pack-pay.ts'), 'utf8');
  const present = readFileSync(join(miniRoot, 'src/services/session-pack-present.ts'), 'utf8');
  const client = readFileSync(join(miniRoot, 'src/services/session-pack-pay-client.ts'), 'utf8');
  const production = [page, css, pay, present, client].join('\n');
  assert.equal(production.includes('v2.0.0'), false);
  assert.equal(/¥\s*6\b/.test(production), false);
  assert.equal(/\b600\b/.test(production), false);
  assert.equal(/\b365\b/.test(production), false);
  assert.equal(production.includes('5 场'), false);
  assert.equal(/upgrade|renew/.test(production), false);
  assert.equal(page.includes('CommerceStub'), false);
  assert.equal(/requestPayment|\/orders/.test(page), false);
  assert.match(page, /session-pack-pay/);
  assert.match(page, /SESSION_PACK_TITLE/);
  assert.match(page, /SESSION_PACK_RULES/);
  assert.match(page, /SESSION_PACK_MEMBER_NOTE/);
  assert.match(page, /navigateBack/);
  assert.match(page, /order\.amountFen/);
  assert.match(client, /requestPayment/);
  assert.match(client, /orderKind: SESSION_PACK_ORDER_KIND/);
  assert.equal(client.includes('amountFen'), false);
  const sheet = [
    'src/components/ExhaustedSheet.tsx',
    'src/components/use-exhausted-gate.tsx',
    'src/services/exhausted-sheet.ts',
  ]
    .map((file) => readFileSync(join(miniRoot, file), 'utf8'))
    .join('\n');
  assert.equal(sheet.includes('session-pack-pay'), false);
  assert.equal(/requestPayment|\/orders/.test(sheet), false);
  const barrel = readFileSync(join(miniRoot, '../../packages/shared/src/index.ts'), 'utf8');
  assert.equal(barrel.includes('node:crypto'), false);
  assert.equal(barrel.includes('entitlement-server'), false);
});

function recorder() {
  const events: string[] = [];
  let orderBody: SessionPackOrderRequest | null = null;
  let createAmountFen = 900;
  let inventoryAfter = 4;
  let payParams: SessionPackOrderSnapshot['payParams'] = {
    timeStamp: '1',
    nonceStr: 'nonce',
    package: 'prepay_id=mockabc',
    signType: 'RSA',
    paySign: 'mock',
  };
  const api: SessionPackPayTransport = {
    createOrder: async (_token, body) => {
      events.push('order');
      orderBody = body;
      return snapshot({ status: 'prepay', amountFen: createAmountFen, payParams });
    },
    mockNotify: async () => {
      events.push('mock');
    },
    getOrder: async () => snapshot({ status: 'paid', amountFen: createAmountFen }),
    requestPayment: async () => {
      throw new Error('unexpected wx');
    },
    readEntitlement: async () => {
      events.push('entitlement');
      return view(inventoryAfter, true);
    },
  };
  return {
    events,
    get transport() {
      return api;
    },
    get orderBody() {
      return orderBody;
    },
    set orderBody(value: SessionPackOrderRequest | null) {
      orderBody = value;
    },
    set createAmountFen(value: number) {
      createAmountFen = value;
    },
    set inventoryAfter(value: number) {
      inventoryAfter = value;
    },
    set payParams(value: SessionPackOrderSnapshot['payParams']) {
      payParams = value;
    },
    set createOrder(value: SessionPackPayTransport['createOrder']) {
      api.createOrder = value;
    },
    set getOrder(value: SessionPackPayTransport['getOrder']) {
      api.getOrder = value;
    },
    set requestPayment(value: SessionPackPayTransport['requestPayment']) {
      api.requestPayment = value;
    },
  };
}

function liveParams(): SessionPackOrderSnapshot['payParams'] {
  return {
    timeStamp: '1710000000',
    nonceStr: 'nonce-live',
    package: 'prepay_id=wx20123456789012345678901234567890',
    signType: 'RSA',
    paySign: 'signed',
  };
}

function snapshot(input: {
  status: SessionPackOrderSnapshot['status'];
  amountFen: number;
  payParams?: SessionPackOrderSnapshot['payParams'];
}): SessionPackOrderSnapshot {
  return {
    outTradeNo: 'tmockorder01',
    status: input.status,
    amountFen: input.amountFen,
    skuCode: 'session_pack_9',
    orderKind: 'purchase',
    payParams: input.payParams === undefined ? null : input.payParams,
  };
}

function view(inventoryRemain: number, active: boolean): EntitlementView {
  return {
    businessDate: '2026-11-07',
    timezone: 'Asia/Shanghai',
    membership: { active, startsAt: null, endsAt: null, skuCode: active ? 'member_month' : null },
    balances: {
      dailyFreeRemain: 0,
      dailyTaskRemain: 0,
      inventoryRemain,
      dailyFreeQuota: 2,
    },
    refine: { lifetimeUsed: 0, lifetimeLimitFree: 1, unlimited: active },
  };
}

function memberSku(): CommerceSkuPublic {
  return pack({
    code: 'member_month',
    type: 'member',
    sessions: null,
    priceFen: 3200,
    durationDays: 30,
  });
}

function pack(input: {
  code?: string;
  type?: CommerceSkuPublic['type'];
  sessions?: number | null;
  priceFen?: number;
  inventoryExpireDays?: number | null;
  name?: string;
  recommended?: boolean;
  durationDays?: number | null;
}): CommerceSkuPublic {
  const priceFen = input.priceFen ?? 900;
  return {
    code: input.code ?? 'session_pack_9',
    type: input.type ?? 'session_pack',
    name: input.name ?? input.code ?? 'session_pack_9',
    priceFen,
    priceYuan: priceFen / 100,
    durationDays: input.durationDays ?? null,
    sessions: input.sessions === undefined ? 9 : input.sessions,
    inventoryExpireDays: input.inventoryExpireDays === undefined ? 180 : input.inventoryExpireDays,
    summary: '',
    recommended: input.recommended ?? false,
  };
}
