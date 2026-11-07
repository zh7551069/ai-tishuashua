import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { ApiErrorCode, type CommerceSkuPublic, type EntitlementView } from '@tishuashua/shared';
import {
  EXHAUSTED_CTA_ORDER,
  EXHAUSTED_ROUTES,
  EXHAUSTED_SUBTITLE,
  EXHAUSTED_TITLE,
  MEMBER_CTA_LABEL,
  PACK_CTA_FALLBACK,
  exhaustedSummary,
  isEntitlementExhausted,
  packCtaLabel,
  pickSessionPack,
  shouldOpenExhaustedSheet,
  snapshotFromError,
  startEntitledSession,
} from './exhausted-sheet';
import { HttpError } from './http-error';

const miniRoot = join(__dirname, '../..');

test('三桶耗尽且非会员才预检拦截，会员和有余量继续出题', async () => {
  const empty = view({ dailyFreeRemain: 0, dailyTaskRemain: 0, inventoryRemain: 0 });
  assert.equal(shouldOpenExhaustedSheet(empty), true);
  assert.equal(exhaustedSummary(empty.balances), '今日免费 2/2 已用 · 明日 00:00 重置');

  const hasFree = view({ dailyFreeRemain: 1, dailyTaskRemain: 0, inventoryRemain: 0 });
  assert.equal(shouldOpenExhaustedSheet(hasFree), false);
  const member = view({ dailyFreeRemain: 0, dailyTaskRemain: 0, inventoryRemain: 0, active: true });
  assert.equal(shouldOpenExhaustedSheet(member), false);

  let created = 0;
  const blocked = await startEntitledSession({
    source: 'normal',
    withAuth: (task) => task('token'),
    readEntitlement: async () => empty,
    create: async () => {
      created += 1;
      return { id: 'should-not' };
    },
  });
  assert.equal(blocked.kind, 'sheet');
  assert.equal(created, 0);
  if (blocked.kind === 'sheet') {
    assert.equal(blocked.snapshot.dailyFreeQuota, 2);
  }

  const passed = await startEntitledSession({
    source: 'retrain_similar',
    withAuth: (task) => task('token'),
    readEntitlement: async () => hasFree,
    create: async () => ({ id: 's1' }),
  });
  assert.deepEqual(passed, { kind: 'created', session: { id: 's1' } });

  const memberStart = await startEntitledSession({
    source: 'variant',
    withAuth: (task) => task('token'),
    readEntitlement: async () => member,
    create: async () => ({ id: 'm1' }),
  });
  assert.equal(memberStart.kind, 'created');
});

test('预检有余量但真实 402 仍弹半屏，wrongSet 不弹也不预检', async () => {
  let reads = 0;
  const raced = await startEntitledSession({
    source: 'normal',
    withAuth: (task) => task('token'),
    readEntitlement: async () => {
      reads += 1;
      return view({ dailyFreeRemain: 1, dailyTaskRemain: 0, inventoryRemain: 0, quota: 4 });
    },
    create: async () => {
      throw new HttpError('今日免费场次已用完', 402, ApiErrorCode.ENTITLEMENT_EXHAUSTED, {
        balances: {
          dailyFreeRemain: 0,
          dailyTaskRemain: 0,
          inventoryRemain: 0,
          dailyFreeQuota: 4,
        },
      });
    },
  });
  assert.equal(reads, 1);
  assert.equal(raced.kind, 'sheet');
  if (raced.kind === 'sheet') {
    assert.equal(exhaustedSummary(raced.snapshot), '今日免费 4/4 已用 · 明日 00:00 重置');
  }

  let wrongReads = 0;
  let wrongCreates = 0;
  const wrong = await startEntitledSession({
    source: 'wrongSet',
    withAuth: (task) => task('token'),
    readEntitlement: async () => {
      wrongReads += 1;
      return view({ dailyFreeRemain: 0, dailyTaskRemain: 0, inventoryRemain: 0 });
    },
    create: async () => {
      wrongCreates += 1;
      throw new HttpError('暂未开放', 400, ApiErrorCode.VALIDATION_ERROR);
    },
  });
  assert.equal(wrongReads, 0);
  assert.equal(wrongCreates, 1);
  assert.equal(wrong.kind, 'error');

  const other = new HttpError('校验失败', 400, ApiErrorCode.VALIDATION_ERROR);
  assert.equal(isEntitlementExhausted(other), false);
  assert.equal(
    snapshotFromError(new HttpError('用尽', 402, ApiErrorCode.ENTITLEMENT_EXHAUSTED))
      .dailyFreeQuota,
    2,
  );
});

test('加油包文案来自 SKU，没有目录时不写死价格', () => {
  const later = sku({ code: 'session_pack_9', sessions: 9, priceFen: 900, recommended: false });
  const recommended = sku({
    code: 'session_pack_5',
    sessions: 5,
    priceFen: 600,
    recommended: true,
  });
  assert.equal(packCtaLabel(pickSessionPack([later, recommended])), '买场次加油包 · 5 场 ¥6');
  assert.equal(packCtaLabel(pickSessionPack([later])), '买场次加油包 · 9 场 ¥9');
  assert.equal(packCtaLabel(pickSessionPack([])), PACK_CTA_FALLBACK);
  assert.equal(PACK_CTA_FALLBACK.includes('¥'), false);
  assert.equal(MEMBER_CTA_LABEL, '开通会员 · 不限场');
  assert.deepEqual(EXHAUSTED_CTA_ORDER, ['member', 'pack', 'task']);
  assert.equal(EXHAUSTED_TITLE, '今日场次已用完');
  assert.equal(EXHAUSTED_SUBTITLE, '开通会员不限场，或买场次加油包 / 做任务领场次');
  assert.equal(EXHAUSTED_ROUTES.member, '/pages/commerce/member/index');
  assert.equal(EXHAUSTED_ROUTES.pack, '/pages/commerce/session-pack/index');
  assert.equal(EXHAUSTED_ROUTES.task, '/pages/commerce/tasks/index');
});

test('半屏和 stub 不支付、不带设计角标，路由已注册', () => {
  const files = [
    'src/components/ExhaustedSheet.tsx',
    'src/components/CommerceStub.tsx',
    'src/components/use-exhausted-gate.tsx',
    'src/services/exhausted-sheet.ts',
    'src/services/commerce-api.ts',
    'src/pages/commerce/session-pack/index.tsx',
    'src/pages/commerce/tasks/index.tsx',
  ].map((file) => readFileSync(join(miniRoot, file), 'utf8'));
  const joined = files.join('\n');
  assert.equal(/requestPayment|\/orders|wx\.requestPayment|POST \/api\/orders/.test(joined), false);
  assert.equal(joined.includes('membership-pay'), false);
  assert.equal(joined.includes('v2.0.0'), false);
  assert.equal(files[3]?.includes('¥6'), false);
  const config = readFileSync(join(miniRoot, 'src/app.config.ts'), 'utf8');
  assert.match(config, /pages\/commerce\/member\/index/);
  assert.match(config, /pages\/commerce\/session-pack\/index/);
  assert.match(config, /pages\/commerce\/tasks\/index/);
  const barrel = readFileSync(join(miniRoot, '../../packages/shared/src/index.ts'), 'utf8');
  assert.equal(barrel.includes('node:crypto'), false);
  assert.equal(barrel.includes('entitlement-server'), false);
});

function view(input: {
  dailyFreeRemain: number;
  dailyTaskRemain: number;
  inventoryRemain: number;
  quota?: number;
  active?: boolean;
}): EntitlementView {
  return {
    businessDate: '2026-11-07',
    timezone: 'Asia/Shanghai',
    membership: {
      active: input.active ?? false,
      startsAt: null,
      endsAt: null,
      skuCode: null,
    },
    balances: {
      dailyFreeRemain: input.dailyFreeRemain,
      dailyTaskRemain: input.dailyTaskRemain,
      inventoryRemain: input.inventoryRemain,
      dailyFreeQuota: input.quota ?? 2,
    },
    refine: { lifetimeUsed: 0, lifetimeLimitFree: 1, unlimited: false },
  };
}

function sku(input: {
  code: string;
  sessions: number;
  priceFen: number;
  recommended: boolean;
}): CommerceSkuPublic {
  return {
    code: input.code,
    type: 'session_pack',
    name: input.code,
    priceFen: input.priceFen,
    priceYuan: input.priceFen / 100,
    durationDays: null,
    sessions: input.sessions,
    inventoryExpireDays: 365,
    summary: '',
    recommended: input.recommended,
  };
}
