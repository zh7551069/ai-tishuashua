import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  ENTITLEMENT_EXHAUSTED_CTA,
  businessDate,
  type EntitlementLedgerPage,
  type EntitlementView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import { createPgExecutor, runQuizGeneration } from '@tishuashua/shared/generation';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { EntitlementService } from './entitlement.service';
import { sessionKey } from '../session/session.service';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  userIds: string[];
  tokens: string[];
  domainId: string;
  certId: string;
  textbookId: string;
  kpId: string;
} = {
  ready: false,
  base: '',
  userIds: [],
  tokens: [],
  domainId: '',
  certId: '',
  textbookId: '',
  kpId: '',
};

describe('entitlement gate', { concurrency: 1 }, () => {
  before(async () => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.LLM_MOCK = 'true';
    process.env.LLM_API_KEY = '';
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.ENTITLEMENT_SEED = '1';

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 4 });
    ctx.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    ctx.redis.on('error', () => undefined);
    await ctx.redis.connect();
    const app = await NestFactory.create(AppModule, { logger: false });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number } | string | null;
    if (!address || typeof address === 'string') {
      await app.close();
      throw new Error('测试服务没有端口');
    }
    ctx.app = app;
    ctx.base = `http://127.0.0.1:${address.port}/api`;
    await insertCatalog(ctx.pool);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.userIds.length > 0) {
      await pool
        .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
        .catch(() => undefined);
    }
    if (pool && ctx.domainId) {
      await pool
        .query('DELETE FROM knowledge_points WHERE id = $1', [ctx.kpId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = $1', [ctx.textbookId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE id = $1', [ctx.certId])
        .catch(() => undefined);
      await pool.query('DELETE FROM domains WHERE id = $1', [ctx.domainId]).catch(() => undefined);
      await pool
        .query(`DELETE FROM system_settings WHERE key = 'dailyFreeSessions'`)
        .catch(() => undefined);
    }
    if (ctx.redis && ctx.tokens.length > 0) {
      await ctx.redis.del(...ctx.tokens.map((token) => sessionKey(token))).catch(() => undefined);
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('非会员日免成卷后记 deduct', async (t) => {
    if (!ready(t)) return;
    const user = await login('daily');
    const before = await balances(user.token);
    assert.equal(before.dailyFreeRemain, 2);
    const created = await createSession(user.token, user.packId);
    const held = await balances(user.token);
    assert.equal(held.dailyFreeRemain, 1);
    const outcome = await runQuizGeneration(createPgExecutor(requiredPool()), created.id, {
      mode: 'mock',
    });
    assert.equal(outcome.status, 'ready');
    const after = await balances(user.token);
    assert.equal(after.dailyFreeRemain, 1);
    const ledger = await ledgerOf(user.token);
    assert.ok(
      ledger.items.some(
        (item) =>
          item.reason === 'reserve_hold' && item.bucket === 'daily_free' && item.delta === -1,
      ),
    );
    assert.ok(
      ledger.items.some(
        (item) => item.reason === 'deduct' && item.bucket === 'daily_free' && item.delta === 0,
      ),
    );
  });

  test('取消和失败都退回日免', async (t) => {
    if (!ready(t)) return;
    const user = await login('release');
    const created = await createSession(user.token, user.packId);
    assert.equal((await balances(user.token)).dailyFreeRemain, 1);
    const cancelled = await call(`/quiz/sessions/${created.id}/cancel`, user.token, {
      method: 'POST',
    });
    assert.equal(cancelled.status, 200);
    assert.equal((await balances(user.token)).dailyFreeRemain, 2);
    assert.ok(
      (await ledgerOf(user.token)).items.some(
        (item) => item.reason === 'release_restore' && item.delta === 1,
      ),
    );

    const failed = await createSession(user.token, user.packId);
    assert.equal((await balances(user.token)).dailyFreeRemain, 1);
    const outcome = await runQuizGeneration(createPgExecutor(requiredPool()), failed.id, {
      mode: 'unconfigured',
      message: '未配置模型',
    });
    assert.equal(outcome.status, 'failed');
    assert.equal((await balances(user.token)).dailyFreeRemain, 2);
    const restores = (await ledgerOf(user.token)).items.filter(
      (item) => item.reason === 'release_restore',
    );
    assert.equal(restores.length, 2);
  });

  test('wrongSet 不预扣，创建接口仍拒绝', async (t) => {
    if (!ready(t)) return;
    const user = await login('wrong');
    const before = await balances(user.token);
    const response = await call('/quiz/sessions', user.token, {
      method: 'POST',
      body: JSON.stringify(sessionBody(user.packId, { source: 'wrongSet' })),
    });
    assert.equal(response.status, 400);
    assert.equal(response.body.code, ApiErrorCode.VALIDATION_ERROR);
    assert.match(String(response.body.message), /暂未开放/);
    assert.deepEqual(await balances(user.token), before);
    assert.equal(await reservationCount(user.userId), 0);
    assert.equal(await sessionCount(user.userId), 0);
  });

  test('三桶耗尽返回 402 且不建会话', async (t) => {
    if (!ready(t)) return;
    const user = await login('empty');
    await balances(user.token);
    await requiredPool().query(
      `UPDATE entitlement_accounts SET daily_free_remain = 0, daily_task_remain = 0 WHERE user_id = $1`,
      [user.userId],
    );
    const response = await call('/quiz/sessions', user.token, {
      method: 'POST',
      body: JSON.stringify(sessionBody(user.packId)),
    });
    assert.equal(response.status, 402);
    assert.equal(response.body.code, ApiErrorCode.ENTITLEMENT_EXHAUSTED);
    assert.equal(response.body.message, '今日免费场次已用完');
    const details = response.body.details as {
      reason: string;
      businessDate: string;
      membershipActive: boolean;
      balances: EntitlementView['balances'];
      cta: { type: string; label: string }[];
    };
    assert.equal(details.reason, 'exhausted');
    assert.equal(details.businessDate, businessDate());
    assert.equal(details.membershipActive, false);
    assert.deepEqual(details.balances, {
      dailyFreeRemain: 0,
      dailyTaskRemain: 0,
      inventoryRemain: 0,
    });
    assert.deepEqual(
      details.cta,
      ENTITLEMENT_EXHAUSTED_CTA.map((item) => ({ type: item.type, label: item.label })),
    );
    assert.equal(await sessionCount(user.userId), 0);
  });

  test('会员生效期内不扣三桶', async (t) => {
    if (!ready(t)) return;
    const user = await login('member');
    const grant = await call('/dev/entitlement/grant', user.token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'membership',
        endsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        skuCode: 'seed_member',
        refId: `member-${user.userId}`,
      }),
    });
    assert.equal(grant.status, 200, JSON.stringify(grant.body));
    const before = await balances(user.token);
    const view = await entitlement(user.token);
    assert.equal(view.membership.active, true);
    assert.equal(view.refine.unlimited, true);
    const created = await createSession(user.token, user.packId);
    assert.deepEqual(await balances(user.token), before);
    const outcome = await runQuizGeneration(createPgExecutor(requiredPool()), created.id, {
      mode: 'mock',
    });
    assert.equal(outcome.status, 'ready');
    assert.deepEqual(await balances(user.token), before);
    const ledger = await ledgerOf(user.token);
    assert.ok(
      ledger.items.some(
        (item) => item.reason === 'deduct' && item.bucket === 'membership' && item.delta === 0,
      ),
    );
    const reservation = await requiredPool().query<{ bucket_spent: string | null }>(
      `SELECT bucket_spent FROM entitlement_reservations WHERE session_id = $1`,
      [created.id],
    );
    assert.equal(reservation.rows[0]?.bucket_spent ?? null, null);
  });

  test('跨日懒日切清掉残留再发日免', async (t) => {
    if (!ready(t)) return;
    const user = await login('roll');
    await requiredPool().query(
      `
        INSERT INTO entitlement_accounts (
          user_id, business_date, daily_free_remain, daily_task_remain, refine_lifetime_used
        )
        VALUES ($1, (timezone('Asia/Shanghai', now()))::date - 1, 1, 3, 0)
      `,
      [user.userId],
    );
    const view = await entitlement(user.token);
    assert.equal(view.businessDate, businessDate());
    assert.equal(view.timezone, 'Asia/Shanghai');
    assert.equal(view.balances.dailyFreeRemain, 2);
    assert.equal(view.balances.dailyTaskRemain, 0);
    assert.equal(view.refine.lifetimeLimitFree, 1);
    assert.equal(view.refine.lifetimeUsed, 0);
    assert.equal(view.refine.unlimited, false);
    const ledger = await ledgerOf(user.token);
    const expired = ledger.items.filter((item) => item.reason === 'daily_expire');
    assert.ok(expired.some((item) => item.bucket === 'daily_free' && item.delta === -1));
    assert.ok(expired.some((item) => item.bucket === 'daily_task' && item.delta === -3));
    assert.ok(
      ledger.items.some(
        (item) => item.reason === 'daily_grant' && item.bucket === 'daily_free' && item.delta === 2,
      ),
    );
  });

  test('库存近过期优先，过期批次不扣', async (t) => {
    if (!ready(t)) return;
    const user = await login('lots');
    const soon = await grantInventory(user.token, 'soon', 4, hoursFromNow(24));
    const later = await grantInventory(user.token, 'later', 4, hoursFromNow(24 * 30));
    const never = await grantInventory(user.token, 'never', 4);
    const past = await grantInventory(user.token, 'past', 4, hoursFromNow(-24));
    await requiredPool().query(
      `UPDATE entitlement_accounts SET daily_free_remain = 0, daily_task_remain = 0 WHERE user_id = $1`,
      [user.userId],
    );
    await createSession(user.token, user.packId);
    assert.equal(await lotRemain(soon), 3);
    assert.equal(await lotRemain(later), 4);
    assert.equal(await lotRemain(never), 4);
    assert.equal(await lotRemain(past), 4);
    const view = await entitlement(user.token);
    assert.equal(view.balances.inventoryRemain, 3 + 4 + 4);
  });

  test('任务奖先于库存', async (t) => {
    if (!ready(t)) return;
    const user = await login('task');
    const lotId = await grantInventory(user.token, 'task-pack', 5, hoursFromNow(48));
    const granted = await call('/dev/entitlement/grant', user.token, {
      method: 'POST',
      body: JSON.stringify({ type: 'daily_task', qty: 1, refId: `task-${user.userId}` }),
    });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const again = await call('/dev/entitlement/grant', user.token, {
      method: 'POST',
      body: JSON.stringify({ type: 'daily_task', qty: 1, refId: `task-${user.userId}` }),
    });
    assert.equal(again.status, 200);
    assert.equal((again.body as { applied?: boolean }).applied, false);
    await requiredPool().query(
      `UPDATE entitlement_accounts SET daily_free_remain = 0 WHERE user_id = $1`,
      [user.userId],
    );
    await createSession(user.token, user.packId);
    const view = await entitlement(user.token);
    assert.equal(view.balances.dailyTaskRemain, 0);
    assert.equal(await lotRemain(lotId), 5);
  });

  test('同一会话重复预扣不双扣，流水可翻页', async (t) => {
    if (!ready(t)) return;
    const user = await login('idem');
    await balances(user.token);
    const service = ctx.app?.get(EntitlementService);
    assert.ok(service);
    const sessionId = randomUUID();
    await service.reserve(user.userId, { sessionId, qty: 1 });
    await service.reserve(user.userId, { sessionId, qty: 1 });
    assert.equal((await balances(user.token)).dailyFreeRemain, 1);
    const badLimit = await call('/me/entitlement/ledger?limit=99', user.token);
    assert.equal(badLimit.status, 400);
    const page = await call('/me/entitlement/ledger?limit=1', user.token);
    assert.equal(page.status, 200);
    const body = page.body as unknown as EntitlementLedgerPage;
    assert.equal(body.items.length, 1);
    assert.ok(body.nextCursor);
    const next = await call(
      `/me/entitlement/ledger?limit=1&cursor=${encodeURIComponent(body.nextCursor ?? '')}`,
      user.token,
    );
    const nextBody = next.body as unknown as EntitlementLedgerPage;
    assert.equal(next.status, 200);
    assert.notEqual(nextBody.items[0]?.id, body.items[0]?.id);
  });

  test('配置了 dailyFreeSessions 时用该正整数', async (t) => {
    if (!ready(t)) return;
    await requiredPool().query(
      `
        INSERT INTO system_settings (key, value, updated_by)
        VALUES ('dailyFreeSessions', '4'::jsonb, 'test')
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
      `,
    );
    try {
      const user = await login('quota');
      assert.equal((await balances(user.token)).dailyFreeRemain, 4);
    } finally {
      await requiredPool().query(`DELETE FROM system_settings WHERE key = 'dailyFreeSessions'`);
    }
  });

  test('未登录不能读权益', async (t) => {
    if (!ready(t)) return;
    const response = await call('/me/entitlement');
    assert.equal(response.status, 401);
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('本地数据库或 Redis 不可用');
    return false;
  }
  return true;
}

async function login(label: string): Promise<{ token: string; userId: string; packId: string }> {
  const response = await call('/auth/wechat/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ code: `${label}-${randomUUID()}`, nick: label }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as unknown as WechatLoginResponse;
  ctx.tokens.push(body.token);
  ctx.userIds.push(body.user.id);
  const pack = await call('/packs', body.token, {
    method: 'POST',
    body: JSON.stringify({
      domainId: ctx.domainId,
      certId: ctx.certId,
      knowledgePointIds: [ctx.kpId],
      name: `权益${label}`,
    }),
  });
  assert.equal(pack.status, 201, JSON.stringify(pack.body));
  const packId = (pack.body as { id?: string }).id;
  assert.ok(packId);
  return { token: body.token, userId: body.user.id, packId };
}

function sessionBody(packId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    packId,
    count: 10,
    difficulty: 'medium',
    types: ['single', 'multi', 'judge'],
    timer: { enabled: false },
    mode: 'practice',
    ...extra,
  };
}

async function createSession(token: string, packId: string): Promise<{ id: string }> {
  const response = await call('/quiz/sessions', token, {
    method: 'POST',
    body: JSON.stringify(sessionBody(packId)),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body as { id: string };
}

async function entitlement(token: string): Promise<EntitlementView> {
  const response = await call('/me/entitlement', token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as EntitlementView;
}

async function balances(token: string): Promise<EntitlementView['balances']> {
  return (await entitlement(token)).balances;
}

async function ledgerOf(token: string): Promise<EntitlementLedgerPage> {
  const response = await call('/me/entitlement/ledger?limit=50', token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as EntitlementLedgerPage;
}

async function grantInventory(
  token: string,
  label: string,
  qty: number,
  expiresAt?: string,
): Promise<string> {
  const response = await call('/dev/entitlement/grant', token, {
    method: 'POST',
    body: JSON.stringify({
      type: 'inventory',
      qty,
      source: 'seed',
      refId: `${label}-${randomUUID()}`,
      ...(expiresAt ? { expiresAt } : {}),
    }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const lotId = (response.body as { lotId?: string }).lotId;
  assert.ok(lotId);
  return lotId;
}

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3600 * 1000).toISOString();
}

async function lotRemain(lotId: string): Promise<number> {
  const result = await requiredPool().query<{ remain: number }>(
    `SELECT remain FROM entitlement_lots WHERE id = $1`,
    [lotId],
  );
  return Number(result.rows[0]?.remain ?? -1);
}

async function sessionCount(userId: string): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM quiz_sessions WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

async function reservationCount(userId: string): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM entitlement_reservations WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

async function call(
  path: string,
  token?: string,
  init?: { method?: string; body?: string },
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${ctx.base}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: init?.body,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function insertCatalog(pool: Pool): Promise<void> {
  ctx.domainId = randomUUID();
  ctx.certId = randomUUID();
  ctx.textbookId = randomUUID();
  ctx.kpId = randomUUID();
  const suffix = ctx.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '权益领域', 'online', 70)`,
    [ctx.domainId, `ent-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order
      )
      VALUES ($1, $2, $3, '权益证书', 'online', 100, 60, ARRAY['single','multi','judge']::text[], 1)
    `,
    [ctx.certId, ctx.domainId, `ent-cert-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbooks (id, code, name, status, sort_order) VALUES ($1, $2, '权益教材', 'online', 1)`,
    [ctx.textbookId, `ent-book-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbook_certificates (textbook_id, certificate_id) VALUES ($1, $2)`,
    [ctx.textbookId, ctx.certId],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES ($1, $2, NULL, $3, '权益知识点', 'knowledge_point', '围绕概念出原创题', 1, 'online', 1)
    `,
    [ctx.kpId, ctx.textbookId, `ent-kp-${suffix}`],
  );
}

async function infraAvailable(databaseUrl: string, redisUrl: string): Promise<boolean> {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 1000, max: 1 });
  const redis = new Redis(redisUrl, {
    connectTimeout: 1000,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', () => undefined);
  try {
    await pool.query('SELECT 1');
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch {
    return false;
  } finally {
    await pool.end().catch(() => undefined);
    redis.disconnect();
  }
}

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('测试数据库还没准备好');
  }
  return ctx.pool;
}
