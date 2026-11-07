import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode, type EntitlementView } from '@tishuashua/shared';
import { holdSessionEntitlement } from '@tishuashua/shared/entitlement';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { ApiException } from '../common/api.exception';
import { EntitlementService } from '../entitlement/entitlement.service';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  token: string;
  userIds: string[];
} = {
  ready: false,
  base: '',
  token: '',
  userIds: [],
};

describe('admin entitlement grant revoke', { concurrency: 1 }, () => {
  before(async () => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }
    process.env.ADMIN_USERNAME = 'ops';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
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
    const login = await request('/admin/login', {
      method: 'POST',
      body: { username: 'ops', password: 'correct-horse' },
    });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    ctx.token = String(login.body.token);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.token) {
      await request('/admin/commerce/quota/reset', { method: 'POST', token: ctx.token }).catch(
        () => undefined,
      );
    }
    if (pool && ctx.userIds.length > 0) {
      await pool
        .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
        .catch(() => undefined);
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('A1 查找与只读详情对齐 me/entitlement', async (t) => {
    if (!ready(t)) return;
    const anon = await request('/admin/commerce/entitlements/lookup?q=hui');
    assert.equal(anon.status, 401);
    assert.equal(anon.body.code, ApiErrorCode.UNAUTHORIZED);

    const user = await loginUser('阿辉查找');
    const phone = `138****${user.userId.replace(/-/g, '').slice(0, 4)}`;
    await requiredPool().query(`UPDATE users SET phone_masked = $2 WHERE id = $1`, [
      user.userId,
      phone,
    ]);
    const openId = await openIdOf(user.userId);
    const wechatDenied = await request(
      `/admin/commerce/entitlements/${user.userId}`,
      { token: user.token },
    );
    assert.equal(wechatDenied.status, 401);

    for (const q of [user.nick, phone, openId, user.userId]) {
      const found = await request(
        `/admin/commerce/entitlements/lookup?q=${encodeURIComponent(q)}`,
        { token: ctx.token },
      );
      assert.equal(found.status, 200, JSON.stringify(found.body));
      const items = found.body.items as { userId: string; openIdMasked: string }[];
      assert.ok(items.some((item) => item.userId === user.userId));
      assert.equal(JSON.stringify(found.body).includes(openId), false);
      const hit = items.find((item) => item.userId === user.userId);
      assert.match(hit?.openIdMasked ?? '', /…/);
    }

    const endsAt = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
    const member = await request('/dev/entitlement/grant', {
      method: 'POST',
      token: user.token,
      body: { type: 'membership', endsAt, skuCode: 'member_month', refId: `member-${user.userId}` },
    });
    assert.equal(member.status, 200, JSON.stringify(member.body));
    const me = await entitlementOf(user.token);
    const detail = await request(`/admin/commerce/entitlements/${user.userId}`, { token: ctx.token });
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    const balances = detail.body.balances as {
      dailyFreeRemain: number;
      dailyTaskRemain: number;
      inventoryRemain: number;
    };
    const membership = detail.body.membership as { active: boolean; endsAt: string; skuName: string | null };
    assert.equal(balances.dailyFreeRemain, me.balances.dailyFreeRemain);
    assert.equal(balances.dailyTaskRemain, me.balances.dailyTaskRemain);
    assert.equal(balances.inventoryRemain, me.balances.inventoryRemain);
    assert.equal(membership.active, true);
    assert.equal(membership.endsAt, me.membership.endsAt);
    assert.equal(membership.skuName, '会员 · 月卡（荐）');
    const missing = await request(`/admin/commerce/entitlements/${randomUUID()}`, { token: ctx.token });
    assert.equal(missing.status, 404);
  });

  test('A2 A3 补发入库存且幂等', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('补发');
    await entitlementOf(user.token);
    const before = await inventoryOf(user.userId);
    const key = `grant-${randomUUID()}`;
    const reason = `人工补发 ${key}`;
    const first = await grant(user.userId, { qty: 3, reason, idempotencyKey: key });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    assert.equal(first.body.applied, true);
    const lotId = String(first.body.lotId);
    assert.equal(await lotRemain(lotId), 3);
    assert.equal(await inventoryOf(user.userId), before + 3);
    const ledger = await requiredPool().query(
      `
        SELECT reason, delta, bucket
        FROM entitlement_ledger
        WHERE lot_id = $1 AND reason = 'inventory_grant'
      `,
      [lotId],
    );
    assert.equal(ledger.rows.length, 1);
    assert.equal(Number(ledger.rows[0]?.delta), 3);
    const audit = await requiredPool().query(
      `
        SELECT action, after
        FROM admin_audit_logs
        WHERE action = 'commerce.entitlement.grant' AND target = $1
        ORDER BY id DESC
        LIMIT 1
      `,
      [`user:${user.userId}`],
    );
    assert.equal(audit.rows[0]?.action, 'commerce.entitlement.grant');
    assert.equal((audit.rows[0]?.after as { reason?: string }).reason, reason);
    const second = await grant(user.userId, { qty: 3, reason, idempotencyKey: key });
    assert.equal(second.status, 200, JSON.stringify(second.body));
    assert.equal(second.body.applied, false);
    assert.equal(second.body.lotId, lotId);
    assert.equal(await inventoryOf(user.userId), before + 3);
    const lots = await requiredPool().query(
      `SELECT COUNT(*)::int AS n FROM entitlement_lots WHERE user_id = $1 AND source = 'admin_grant'`,
      [user.userId],
    );
    assert.equal(lots.rows[0]?.n, 1);
  });

  test('A4 作废库存批次后再作废冲突', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('作废批次');
    const granted = await grant(user.userId, { qty: 5, reason: '准备作废' });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const lotId = String(granted.body.lotId);
    const revoked = await revoke(user.userId, {
      targets: [{ kind: 'lot', id: lotId }],
      reason: '误发回收',
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(await lotRemain(lotId), 0);
    const ledger = await requiredPool().query(
      `
        SELECT reason, delta
        FROM entitlement_ledger
        WHERE lot_id = $1 AND reason = 'admin_revoke'
      `,
      [lotId],
    );
    assert.equal(ledger.rows.length, 1);
    assert.equal(Number(ledger.rows[0]?.delta), -5);
    const audit = await requiredPool().query(
      `
        SELECT action, after
        FROM admin_audit_logs
        WHERE action = 'commerce.entitlement.revoke_lot' AND target = $1
      `,
      [`lot:${lotId}`],
    );
    assert.equal(audit.rows.length, 1);
    assert.equal((audit.rows[0]?.after as { reason?: string; afterRemain?: number }).afterRemain, 0);
    const again = await revoke(user.userId, {
      targets: [{ kind: 'lot', id: lotId }],
      reason: '再作废',
    });
    assert.equal(again.status, 409);
    assert.equal(again.body.code, ApiErrorCode.ENTITLEMENT_CONFLICT);
  });

  test('A5 pending 通过与作废', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('待发放');
    await entitlementOf(user.token);
    const grantId = randomUUID();
    const voidId = randomUUID();
    await requiredPool().query(
      `
        INSERT INTO entitlement_pending_grants (id, user_id, qty, source, risk_code, risk_text, status)
        VALUES
          ($1, $3, 3, 'invite_first_submit', 'daily_cap', '日封顶超限', 'pending'),
          ($2, $3, 2, 'invite_register', 'self_invite', '自邀', 'pending')
      `,
      [grantId, voidId, user.userId],
    );
    const before = await inventoryOf(user.userId);
    const positiveBefore = await positiveLedgerCount(user.userId);
    const passed = await grant(user.userId, {
      qty: 3,
      reason: '风控待发放人工通过：邀请首刷日封顶误伤',
      pendingId: grantId,
    });
    assert.equal(passed.status, 200, JSON.stringify(passed.body));
    assert.equal(passed.body.applied, true);
    assert.equal(await inventoryOf(user.userId), before + 3);
    const grantedRow = await requiredPool().query(
      `SELECT status, grant_lot_id FROM entitlement_pending_grants WHERE id = $1`,
      [grantId],
    );
    assert.equal(grantedRow.rows[0]?.status, 'granted');
    assert.equal(grantedRow.rows[0]?.grant_lot_id, passed.body.lotId);
    const tamper = await grant(user.userId, {
      qty: 9,
      reason: '数量被改',
      pendingId: voidId,
    });
    assert.equal(tamper.status, 400);
    const voided = await revoke(user.userId, {
      targets: [{ kind: 'pending', id: voidId }],
      reason: '误伤作废',
    });
    assert.equal(voided.status, 200, JSON.stringify(voided.body));
    assert.equal(await inventoryOf(user.userId), before + 3);
    const voidRow = await requiredPool().query(
      `SELECT status FROM entitlement_pending_grants WHERE id = $1`,
      [voidId],
    );
    assert.equal(voidRow.rows[0]?.status, 'voided');
    assert.equal(await positiveLedgerCount(user.userId), positiveBefore + 1);
    const again = await revoke(user.userId, {
      targets: [{ kind: 'pending', id: voidId }],
      reason: '再作废',
    });
    assert.equal(again.status, 409);
    await requiredPool().query(
      `UPDATE entitlement_accounts SET daily_task_remain = 1 WHERE user_id = $1`,
      [user.userId],
    );
    const detail = await request(`/admin/commerce/entitlements/${user.userId}`, { token: ctx.token });
    const entries = detail.body.entries as { kind: string; id: string; actions: string[] }[];
    const task = entries.find((entry) => entry.kind === 'daily_task');
    assert.ok(task);
    assert.equal(task.id, 'synthetic:daily_task');
    assert.deepEqual(task.actions, []);
    const extra = await grant(user.userId, { qty: 4, reason: '整单回滚用' });
    const extraLot = String(extra.body.lotId);
    const rolled = await revoke(user.userId, {
      targets: [
        { kind: 'lot', id: extraLot },
        { kind: 'pending', id: voidId },
      ],
      reason: '半成功不允许',
    });
    assert.equal(rolled.status, 409);
    assert.equal(await lotRemain(extraLot), 4);
  });

  test('A6 禁改桶和会员到期', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('禁面');
    const bucket = await grant(user.userId, { qty: 1, bucket: 'daily_free', reason: '不该写日免' });
    assert.equal(bucket.status, 400);
    assert.equal(bucket.body.code, ApiErrorCode.VALIDATION_ERROR);
    const ends = await grant(user.userId, {
      qty: 1,
      reason: '不该改到期',
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    assert.equal(ends.status, 400);
    assert.equal(ends.body.code, ApiErrorCode.VALIDATION_ERROR);
    const daily = await revoke(user.userId, {
      targets: [{ kind: 'daily_task', id: randomUUID() }],
      reason: '任务奖',
    });
    assert.equal(daily.status, 400);
  });

  test('A7 审计列表可读 TB-21 与本刀，且只读', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('审计');
    const quota = await request('/admin/commerce/quota', {
      method: 'PUT',
      token: ctx.token,
      body: { dailyFreeSessions: 2, refineLifetimeLimitFree: 1 },
    });
    assert.equal(quota.status, 200, JSON.stringify(quota.body));
    const granted = await grant(user.userId, { qty: 1, reason: '审计可见' });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const lotId = String(granted.body.lotId);
    const revoked = await revoke(user.userId, {
      targets: [{ kind: 'lot', id: lotId }],
      reason: '审计作废',
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    const list = await request('/admin/commerce/audit?actionPrefix=commerce.&pageSize=50', {
      token: ctx.token,
    });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    const actions = (list.body.items as { action: string }[]).map((item) => item.action);
    assert.ok(actions.includes('commerce.quota.update'));
    assert.ok(actions.includes('commerce.entitlement.grant'));
    assert.ok(actions.includes('commerce.entitlement.revoke_lot'));
    const filtered = await request(
      `/admin/commerce/audit?userId=${user.userId}&actionPrefix=commerce.`,
      { token: ctx.token },
    );
    assert.equal(filtered.status, 200, JSON.stringify(filtered.body));
    const rows = filtered.body.items as { action: string; target: string; after: { userId?: string } | null }[];
    assert.ok(rows.some((row) => row.action === 'commerce.entitlement.grant'));
    assert.ok(rows.every((row) => row.target.includes(`user:${user.userId}`) || row.after?.userId === user.userId));
    assert.equal(rows.some((row) => row.action === 'commerce.quota.update'), false);
    const write = await request('/admin/commerce/audit', {
      method: 'POST',
      token: ctx.token,
      body: { action: 'commerce.entitlement.grant' },
    });
    assert.equal(write.status, 404);
  });

  test('A8 补发后可预扣库存，作废后 402，wrongSet 不扣', async (t) => {
    if (!ready(t)) return;
    const user = await loginUser('门禁');
    await entitlementOf(user.token);
    await requiredPool().query(
      `UPDATE entitlement_accounts SET daily_free_remain = 0, daily_task_remain = 0 WHERE user_id = $1`,
      [user.userId],
    );
    const granted = await grant(user.userId, { qty: 2, reason: '给门禁用' });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const lotId = String(granted.body.lotId);
    assert.equal(await inventoryOf(user.userId), 2);
    const skipped = await holdSessionEntitlement(
      requiredPool(),
      user.userId,
      'wrongSet',
      randomUUID(),
    );
    assert.equal(skipped, 'skipped');
    assert.equal(await inventoryOf(user.userId), 2);
    assert.equal(await reservationCount(user.userId), 0);
    const service = ctx.app?.get(EntitlementService);
    assert.ok(service);
    await service.reserve(user.userId, { sessionId: randomUUID(), qty: 1 });
    assert.equal(await lotRemain(lotId), 1);
    const held = await requiredPool().query(
      `SELECT bucket_spent FROM entitlement_reservations WHERE user_id = $1`,
      [user.userId],
    );
    assert.equal(held.rows[0]?.bucket_spent, 'inventory');
    const revoked = await revoke(user.userId, {
      targets: [{ kind: 'lot', id: lotId }],
      reason: '收掉剩余',
    });
    assert.equal(revoked.status, 200, JSON.stringify(revoked.body));
    assert.equal(await lotRemain(lotId), 0);
    await assert.rejects(
      () => service.reserve(user.userId, { sessionId: randomUUID(), qty: 1 }),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        assert.equal(error.getStatus(), 402);
        const body = error.getResponse() as { code?: string };
        assert.equal(body.code, ApiErrorCode.ENTITLEMENT_EXHAUSTED);
        return true;
      },
    );
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready || !ctx.pool || !ctx.app) {
    t.skip('PostgreSQL 或 Redis 不可用');
    return false;
  }
  return true;
}

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('数据库不可用');
  }
  return ctx.pool;
}

async function loginUser(nick: string): Promise<{ token: string; userId: string; nick: string }> {
  const response = await request('/auth/wechat/login', {
    method: 'POST',
    body: { code: `${nick}-${randomUUID()}`, nick },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const user = response.body.user as { id: string };
  ctx.userIds.push(user.id);
  return { token: String(response.body.token), userId: user.id, nick };
}

async function entitlementOf(token: string): Promise<EntitlementView> {
  const response = await request('/me/entitlement', { token });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as EntitlementView;
}

async function grant(userId: string, body: Record<string, unknown>) {
  return request(`/admin/commerce/entitlements/${userId}/grant`, {
    method: 'POST',
    token: ctx.token,
    body: { bucket: 'inventory', ...body },
  });
}

async function revoke(userId: string, body: Record<string, unknown>) {
  return request(`/admin/commerce/entitlements/${userId}/revoke`, {
    method: 'POST',
    token: ctx.token,
    body,
  });
}

async function inventoryOf(userId: string): Promise<number> {
  const result = await requiredPool().query(
    `
      SELECT COALESCE(SUM(remain), 0)::int AS remain
      FROM entitlement_lots
      WHERE user_id = $1 AND bucket = 'inventory' AND remain > 0
        AND (expires_at IS NULL OR expires_at > now())
    `,
    [userId],
  );
  return Number(result.rows[0]?.remain ?? 0);
}

async function lotRemain(lotId: string): Promise<number> {
  const result = await requiredPool().query(`SELECT remain FROM entitlement_lots WHERE id = $1`, [lotId]);
  return Number(result.rows[0]?.remain ?? -1);
}

async function positiveLedgerCount(userId: string): Promise<number> {
  const result = await requiredPool().query(
    `SELECT COUNT(*)::int AS n FROM entitlement_ledger WHERE user_id = $1 AND delta > 0`,
    [userId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function reservationCount(userId: string): Promise<number> {
  const result = await requiredPool().query(
    `SELECT COUNT(*)::int AS n FROM entitlement_reservations WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.n ?? 0);
}

async function openIdOf(userId: string): Promise<string> {
  const result = await requiredPool().query(`SELECT wx_open_id FROM users WHERE id = $1`, [userId]);
  return String(result.rows[0]?.wx_open_id ?? '');
}

async function request(
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${ctx.base}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  return { status: response.status, body };
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
