import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ApiErrorCode, type CommerceSkuPublic, type EntitlementView } from '@tishuashua/shared';
import { HttpError } from './http-error';
import {
  MEMBER_DOWNGRADE_MESSAGE,
  MEMBER_ORDER_POLL_INTERVAL_MS,
  MEMBER_ORDER_POLL_LIMIT,
  MEMBER_PAY_CANCELLED,
  MEMBER_PAY_IN_PROGRESS,
  MEMBER_PAY_UNAVAILABLE_MESSAGE,
  createIdempotencyStore,
  createMembershipIdempotencyKey,
  createMembershipPayer,
  describeMemberSelection,
  loadMembershipOffer,
  payMembership,
  pickDefaultMemberSku,
  type MemberOrderRequest,
  type MemberOrderSnapshot,
  type MembershipCatalogTransport,
  type MembershipPayTransport,
  type PaymentLaunch,
} from './membership-pay';
import {
  MEMBER_CHIPS,
  MEMBER_HERO_NOTE,
  MEMBER_HERO_SUB,
  MEMBER_HERO_TITLE,
  MEMBER_PAGE_TITLE,
  MEMBER_PAY_CAPTION,
  MEMBER_RULE_BODY,
  MEMBER_RULE_TITLE,
  memberMonthlyLabel,
  memberPayBlock,
  memberPayLabel,
  memberPeriodSuffix,
  memberPlanBadge,
  memberSkuSubtitle,
  sessionPackEntryLabel,
} from './membership-present';

const miniRoot = join(__dirname, '../..');

test('同档续费、更高档升级、更低档拒绝且不建单', async () => {
  const catalog = [week(), month(), quarter(), year()];
  const purchase = describeMemberSelection({
    membershipActive: false,
    currentSkuCode: 'member_year',
    catalog,
    target: month(),
  });
  assert.equal(purchase.ok && purchase.kind, 'purchase');

  const renew = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_month',
    catalog,
    target: month(),
  });
  assert.equal(renew.ok && renew.kind, 'renew');

  const upgraded = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_week',
    catalog,
    target: year(),
  });
  assert.equal(upgraded.ok && upgraded.kind, 'upgrade');

  const sameDays = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_week',
    catalog: [member({ code: 'member_week', durationDays: 30, priceFen: 1500 })],
    target: month(),
  });
  assert.equal(sameDays.ok && sameDays.kind, 'renew');

  const calls = recorder();
  const blocked = await payMembership(
    {
      token: 'token',
      target: week(),
      membershipActive: true,
      currentSkuCode: 'member_year',
      catalog,
    },
    calls.transport,
  );
  assert.deepEqual(blocked, {
    ok: false,
    code: ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN,
    message: MEMBER_DOWNGRADE_MESSAGE,
  });
  assert.deepEqual(calls.events, []);

  const unknown = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_custom',
    catalog,
    target: week(),
  });
  assert.equal(unknown.ok, false);
  if (!unknown.ok) {
    assert.equal(unknown.code, ApiErrorCode.PAY_ORDER_STATE);
  }
  const pack = await payMembership(
    {
      token: 'token',
      target: member({
        code: 'session_pack_5',
        type: 'session_pack',
        durationDays: null,
        priceFen: 500,
      }),
      membershipActive: false,
      currentSkuCode: null,
      catalog,
    },
    calls.transport,
  );
  assert.equal(pack.ok, false);
  assert.deepEqual(calls.events, []);
});

test('mock 支付成功：下单、mock-notify、轮询到 paid、刷新会员', async () => {
  const calls = recorder();
  let reads = 0;
  calls.getOrder = async () => {
    reads += 1;
    return snapshot({
      status: reads === 1 ? 'prepay' : 'paid',
      amountFen: 3200,
      orderKind: 'purchase',
    });
  };
  const slept: number[] = [];
  const result = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
      clientIdempotencyKey: 'month-once',
      sleep: async (ms) => {
        slept.push(ms);
      },
    },
    calls.transport,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.orderKind, 'purchase');
    assert.equal(result.amountFen, 3200);
    assert.equal(result.quotedPayFen, null);
    assert.equal(result.entitlement.membership.active, true);
    assert.equal(result.entitlement.membership.skuCode, 'member_month');
  }
  assert.deepEqual(calls.events, ['order', 'mock', 'entitlement']);
  assert.deepEqual(calls.orderBody, {
    skuCode: 'member_month',
    orderKind: 'purchase',
    clientIdempotencyKey: 'month-once',
  });
  assert.equal(calls.orderBody && 'amountFen' in calls.orderBody, false);
  assert.deepEqual(slept, [MEMBER_ORDER_POLL_INTERVAL_MS]);
  assert.equal(reads, 2);
});

test('升级先询价再下单，金额只认订单响应；取消和未配置不查单', async () => {
  const catalog = [week(), year()];
  const upgradeCalls = recorder();
  upgradeCalls.quotePayFen = 1500;
  upgradeCalls.createAmountFen = 1500;
  upgradeCalls.orderKind = 'upgrade';
  const upgraded = await payMembership(
    {
      token: 'token',
      target: year(),
      membershipActive: true,
      currentSkuCode: 'member_week',
      catalog,
      sleep: async () => undefined,
    },
    upgradeCalls.transport,
  );
  assert.equal(upgraded.ok, true);
  if (upgraded.ok) {
    assert.equal(upgraded.orderKind, 'upgrade');
    assert.equal(upgraded.quotedPayFen, 1500);
    assert.equal(upgraded.amountFen, 1500);
  }
  assert.deepEqual(upgradeCalls.events, ['quote', 'order', 'mock', 'entitlement']);
  assert.equal(upgradeCalls.quotedCode, 'member_year');
  assert.equal(upgradeCalls.orderBody?.orderKind, 'upgrade');
  assert.equal(upgradeCalls.orderBody && 'amountFen' in upgradeCalls.orderBody, false);

  const quoteFailed = recorder();
  quoteFailed.upgradeQuote = async () => {
    quoteFailed.events.push('quote');
    throw new HttpError('不能购买更低档位的会员', 409, ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN);
  };
  const rejected = await payMembership(
    {
      token: 'token',
      target: year(),
      membershipActive: true,
      currentSkuCode: 'member_week',
      catalog,
    },
    quoteFailed.transport,
  );
  assert.deepEqual(rejected, {
    ok: false,
    code: ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN,
    message: MEMBER_DOWNGRADE_MESSAGE,
  });
  assert.deepEqual(quoteFailed.events, ['quote']);

  const cancel = recorder();
  cancel.payParams = liveParams();
  cancel.requestPayment = async () => {
    cancel.events.push('wx');
    return { ok: false, cancelled: true, message: 'cancel' } satisfies PaymentLaunch;
  };
  const cancelled = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
    },
    cancel.transport,
  );
  assert.deepEqual(cancelled, { ok: false, code: MEMBER_PAY_CANCELLED, message: '已取消支付' });
  assert.deepEqual(cancel.events, ['order', 'wx']);

  const live = recorder();
  live.payParams = liveParams();
  live.requestPayment = async () => {
    live.events.push('wx');
    return { ok: true };
  };
  const paid = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
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
  const missing = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
    },
    unavailable.transport,
  );
  assert.deepEqual(missing, {
    ok: false,
    code: ApiErrorCode.PAY_NOT_CONFIGURED,
    message: MEMBER_PAY_UNAVAILABLE_MESSAGE,
  });
  assert.deepEqual(unavailable.events, ['order']);
});

test('轮询失败或超时不假装成功，支付中的第二下不建第二单', async () => {
  const failed = recorder();
  let gets = 0;
  failed.getOrder = async () => {
    gets += 1;
    failed.events.push('get');
    return snapshot({ status: 'failed', amountFen: 3200, orderKind: 'purchase' });
  };
  const stopped = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
      sleep: async () => undefined,
    },
    failed.transport,
  );
  assert.equal(stopped.ok, false);
  assert.equal(gets, 1);
  assert.equal(failed.events.includes('entitlement'), false);

  const hanging = recorder();
  let polls = 0;
  hanging.getOrder = async () => {
    polls += 1;
    return snapshot({ status: 'prepay', amountFen: 3200, orderKind: 'purchase' });
  };
  const timedOut = await payMembership(
    {
      token: 'token',
      target: month(),
      membershipActive: false,
      currentSkuCode: null,
      catalog: [month()],
      sleep: async () => undefined,
    },
    hanging.transport,
  );
  assert.equal(timedOut.ok, false);
  if (!timedOut.ok) {
    assert.equal(timedOut.message, '支付结果确认超时');
  }
  assert.equal(polls, MEMBER_ORDER_POLL_LIMIT);
  assert.equal(hanging.events.includes('entitlement'), false);

  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const locked = recorder();
  locked.upgradeQuote = async () => {
    locked.events.push('quote');
    await gate;
    return {
      currentSkuCode: 'member_week',
      targetSkuCode: 'member_year',
      remainingDays: 3,
      remainingValueFen: 100,
      payFen: 1500,
      currency: 'CNY',
    };
  };
  const payer = createMembershipPayer(locked.transport);
  const input = {
    token: 'token',
    target: year(),
    membershipActive: true,
    currentSkuCode: 'member_week',
    catalog: [week(), year()],
    sleep: async () => undefined,
  };
  const first = payer.pay(input);
  const second = await payer.pay(input);
  assert.deepEqual(second, { ok: false, code: MEMBER_PAY_IN_PROGRESS, message: '支付处理中' });
  release?.();
  const done = await first;
  assert.equal(done.ok, true);
  assert.equal(locked.events.filter((event) => event === 'order').length, 1);
});

test('目录只留会员，默认推荐，幂等键同档复用', async () => {
  const listed = [
    member({
      code: 'session_pack_9',
      type: 'session_pack',
      durationDays: null,
      priceFen: 900,
      sessions: 9,
    }),
    week(),
    month({ recommended: true }),
  ];
  assert.equal(pickDefaultMemberSku(listed)?.code, 'member_month');
  assert.equal(pickDefaultMemberSku([year(), week()])?.code, 'member_year');
  const catalog: MembershipCatalogTransport = {
    listMemberSkus: async () => listed,
    listSessionPacks: async () => {
      throw new Error('目录失败');
    },
    readEntitlement: async () => view(false, null),
  };
  const offer = await loadMembershipOffer('token', catalog);
  assert.equal(offer.ok, true);
  if (offer.ok) {
    assert.deepEqual(
      offer.skus.map((sku) => sku.code),
      ['member_week', 'member_month'],
    );
    assert.equal(offer.selectedCode, 'member_month');
    assert.equal(offer.sessionPack, null);
  }

  const key = createMembershipIdempotencyKey(1_700_000_000_000, 0.5);
  assert.match(key, /^[A-Za-z0-9_-]{1,64}$/);
  const store = createIdempotencyStore();
  const monthKey = store.keyFor('member_month');
  assert.equal(store.keyFor('member_month'), monthKey);
  assert.notEqual(store.keyFor('member_year'), monthKey);
  store.clear();
  assert.notEqual(store.keyFor('member_year'), monthKey);
});

test('展示价来自服务端分，季年写月均，加油包没有价就不写死', () => {
  assert.equal(memberMonthlyLabel(6400, 3), '约 ¥21.3/月');
  assert.equal(memberMonthlyLabel(1800, 12), '约 ¥1.5/月');
  assert.equal(memberMonthlyLabel(3000, 3), '约 ¥10/月');
  assert.equal(memberSkuSubtitle(week({ summary: '灵活尝鲜' })), '灵活尝鲜');
  assert.equal(memberSkuSubtitle(quarter({ priceFen: 6400 })), '约 ¥21.3/月');
  assert.equal(memberPeriodSuffix(year()), '/年');
  assert.equal(memberPayLabel(1500, false), '确认协议并支付 ¥15');
  assert.equal(memberPayLabel(null, true), '支付处理中');
  const upgrade = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_week',
    catalog: [week(), year()],
    target: year(),
  });
  assert.deepEqual(
    memberPayBlock({
      decision: upgrade,
      skuPriceFen: year().priceFen,
      quotePayFen: 1500,
      quoting: false,
      paying: false,
    }),
    { disabled: false, fen: 1500, intercept: null },
  );
  assert.equal(
    memberPayBlock({
      decision: upgrade,
      skuPriceFen: year().priceFen,
      quotePayFen: null,
      quoting: true,
      paying: false,
    }).disabled,
    true,
  );
  const downgrade = describeMemberSelection({
    membershipActive: true,
    currentSkuCode: 'member_year',
    catalog: [week(), year()],
    target: week(),
  });
  assert.equal(
    memberPayBlock({
      decision: downgrade,
      skuPriceFen: week().priceFen,
      quotePayFen: null,
      quoting: false,
      paying: false,
    }).intercept,
    MEMBER_DOWNGRADE_MESSAGE,
  );
  assert.equal(
    sessionPackEntryLabel(
      member({
        code: 'session_pack_5',
        type: 'session_pack',
        durationDays: null,
        priceFen: 500,
        sessions: 5,
      }),
    ),
    '场次加油包 5 场 ¥5（非刷题包）',
  );
  assert.equal(sessionPackEntryLabel(null).includes('¥'), false);
  assert.equal(MEMBER_PAGE_TITLE, '开通会员');
  assert.equal(MEMBER_HERO_TITLE, '题刷刷会员');
  assert.equal(MEMBER_HERO_SUB, '不限场次 · 课件提炼 · AI 点评');
  assert.equal(MEMBER_HERO_NOTE, '免费上传提炼终身仅 1 次');
  assert.deepEqual(MEMBER_CHIPS, ['不限 AI 出题场次', '每月提炼5次', 'AI 点评摘要不限']);
  assert.equal(memberPlanBadge(month({ summary: '' }))?.text, '最受欢迎');
  assert.equal(memberPlanBadge(quarter({ summary: '' }))?.text, '推荐');
  assert.equal(memberPlanBadge(week({ summary: '灵活尝鲜' }))?.text, '灵活尝鲜');
  assert.equal(memberPlanBadge(year({ summary: '' })), null);
  assert.equal(MEMBER_RULE_TITLE, '升级可补差价 · 不支持降级');
  assert.equal(MEMBER_RULE_BODY, '续费延长到期日 · 会员不受日免场次限制');
  assert.equal(MEMBER_PAY_CAPTION, '微信支付 · 开通后立即生效');
});

test('会员页走支付壳，生产源不写死试用价，半屏仍不引用支付', () => {
  const page = readFileSync(join(miniRoot, 'src/pages/commerce/member/index.tsx'), 'utf8');
  const css = readFileSync(join(miniRoot, 'src/pages/commerce/member/index.css'), 'utf8');
  const pay = readFileSync(join(miniRoot, 'src/services/membership-pay.ts'), 'utf8');
  const present = readFileSync(join(miniRoot, 'src/services/membership-present.ts'), 'utf8');
  const client = readFileSync(join(miniRoot, 'src/services/membership-pay-client.ts'), 'utf8');
  const production = [page, css, pay, present, client].join('\n');
  assert.equal(/¥\s*(12|28|68|198)\b/.test(production), false);
  assert.equal(/\b(1200|2800|6800|19800)\b/.test(production), false);
  assert.equal(production.includes('v2.0.0'), false);
  assert.match(page, /membership-pay/);
  assert.match(page, /MEMBER_HERO_TITLE/);
  assert.match(page, /EXHAUSTED_ROUTES\.pack/);
  assert.match(page, /MEMBER_TERMS_ROUTE/);
  assert.equal(/requestPayment|\/orders|amountFen/.test(page), false);
  assert.match(client, /requestPayment/);
  assert.match(client, /skuCode: body\.skuCode/);
  assert.match(client, /orderKind: body\.orderKind/);
  assert.match(client, /clientIdempotencyKey: body\.clientIdempotencyKey/);
  assert.equal(client.includes('amountFen'), false);
  const sheet = [
    'src/components/ExhaustedSheet.tsx',
    'src/components/use-exhausted-gate.tsx',
    'src/services/exhausted-sheet.ts',
  ]
    .map((file) => readFileSync(join(miniRoot, file), 'utf8'))
    .join('\n');
  assert.equal(sheet.includes('membership-pay'), false);
  assert.equal(/requestPayment|\/orders/.test(sheet), false);
});

function recorder() {
  const events: string[] = [];
  let quotedCode = '';
  let orderBody: MemberOrderRequest | null = null;
  let quotePayFen = 0;
  let createAmountFen = 3200;
  let orderKind: MemberOrderSnapshot['orderKind'] = 'purchase';
  let payParams: MemberOrderSnapshot['payParams'] = {
    timeStamp: '1',
    nonceStr: 'nonce',
    package: 'prepay_id=mockabc',
    signType: 'RSA',
    paySign: 'mock',
  };
  const api: MembershipPayTransport = {
    upgradeQuote: async (_token, targetSkuCode) => {
      events.push('quote');
      quotedCode = targetSkuCode;
      return {
        currentSkuCode: 'member_week',
        targetSkuCode,
        remainingDays: 3,
        remainingValueFen: 100,
        payFen: quotePayFen,
        currency: 'CNY',
      };
    },
    createOrder: async (_token, body) => {
      events.push('order');
      orderBody = body;
      return snapshot({
        status: 'prepay',
        amountFen: createAmountFen,
        orderKind: body.orderKind,
        payParams,
      });
    },
    mockNotify: async () => {
      events.push('mock');
    },
    getOrder: async () => snapshot({ status: 'paid', amountFen: createAmountFen, orderKind }),
    requestPayment: async () => {
      throw new Error('unexpected wx');
    },
    readEntitlement: async () => {
      events.push('entitlement');
      return view(true, orderKind === 'upgrade' ? 'member_year' : 'member_month');
    },
  };
  return {
    events,
    get transport() {
      return api;
    },
    get quotedCode() {
      return quotedCode;
    },
    get orderBody() {
      return orderBody;
    },
    set quotePayFen(value: number) {
      quotePayFen = value;
    },
    set createAmountFen(value: number) {
      createAmountFen = value;
    },
    set orderKind(value: MemberOrderSnapshot['orderKind']) {
      orderKind = value;
    },
    set payParams(value: MemberOrderSnapshot['payParams']) {
      payParams = value;
    },
    set upgradeQuote(value: MembershipPayTransport['upgradeQuote']) {
      api.upgradeQuote = value;
    },
    set createOrder(value: MembershipPayTransport['createOrder']) {
      api.createOrder = value;
    },
    set getOrder(value: MembershipPayTransport['getOrder']) {
      api.getOrder = value;
    },
    set requestPayment(value: MembershipPayTransport['requestPayment']) {
      api.requestPayment = value;
    },
  };
}

function liveParams(): MemberOrderSnapshot['payParams'] {
  return {
    timeStamp: '1710000000',
    nonceStr: 'nonce-live',
    package: 'prepay_id=wx20123456789012345678901234567890',
    signType: 'RSA',
    paySign: 'signed',
  };
}

function snapshot(input: {
  status: MemberOrderSnapshot['status'];
  amountFen: number;
  orderKind: MemberOrderSnapshot['orderKind'];
  payParams?: MemberOrderSnapshot['payParams'];
}): MemberOrderSnapshot {
  return {
    outTradeNo: 'tmockorder01',
    status: input.status,
    amountFen: input.amountFen,
    skuCode: input.orderKind === 'upgrade' ? 'member_year' : 'member_month',
    orderKind: input.orderKind,
    payParams: input.payParams === undefined ? null : input.payParams,
  };
}

function view(active: boolean, skuCode: string | null): EntitlementView {
  return {
    businessDate: '2026-11-07',
    timezone: 'Asia/Shanghai',
    membership: { active, startsAt: null, endsAt: null, skuCode },
    balances: {
      dailyFreeRemain: 0,
      dailyTaskRemain: 0,
      inventoryRemain: 0,
      dailyFreeQuota: 2,
    },
    refine: { lifetimeUsed: 0, lifetimeLimitFree: 1, unlimited: active },
  };
}

function week(extra?: Partial<CommerceSkuPublic>): CommerceSkuPublic {
  return member({ code: 'member_week', durationDays: 7, priceFen: 1500, name: '周卡', ...extra });
}

function month(extra?: Partial<CommerceSkuPublic>): CommerceSkuPublic {
  return member({ code: 'member_month', durationDays: 30, priceFen: 3200, name: '月卡', ...extra });
}

function quarter(extra?: Partial<CommerceSkuPublic>): CommerceSkuPublic {
  return member({
    code: 'member_quarter',
    durationDays: 90,
    priceFen: 6400,
    name: '季卡',
    ...extra,
  });
}

function year(extra?: Partial<CommerceSkuPublic>): CommerceSkuPublic {
  return member({ code: 'member_year', durationDays: 365, priceFen: 9600, name: '年卡', ...extra });
}

function member(input: {
  code: string;
  durationDays: number | null;
  priceFen: number;
  name?: string;
  type?: CommerceSkuPublic['type'];
  sessions?: number | null;
  recommended?: boolean;
  summary?: string;
}): CommerceSkuPublic {
  return {
    code: input.code,
    type: input.type ?? 'member',
    name: input.name ?? input.code,
    priceFen: input.priceFen,
    priceYuan: input.priceFen / 100,
    durationDays: input.durationDays,
    sessions: input.sessions ?? null,
    inventoryExpireDays: null,
    summary: input.summary ?? '',
    recommended: input.recommended ?? false,
  };
}
