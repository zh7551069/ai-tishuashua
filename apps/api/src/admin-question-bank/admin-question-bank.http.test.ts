import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ADMIN_QUESTION_BANK_SUMMARY_MAX,
  ApiErrorCode,
  type AdminQuestionBankDetail,
  type AdminQuestionBankList,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'question-bank-admin';
const PASSWORD = 'question-bank-secret';
const ENV_KEYS = [
  'ADMIN_USERNAME',
  'ADMIN_PASSWORD',
  'REDIS_URL',
  'DATABASE_URL',
  'WECHAT_LOGIN_MOCK',
  'WECHAT_APP_ID',
  'WECHAT_APP_SECRET',
  'RATE_LIMIT_ADMIN_API_MAX',
  'RATE_LIMIT_ADMIN_IP_MAX',
  'RATE_LIMIT_WECHAT_API_MAX',
  'RATE_LIMIT_WECHAT_IP_MAX',
  'RATE_LIMIT_WECHAT_LOGIN_MAX',
] as const;

const savedEnv = new Map<string, string | undefined>();
const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  suffix: string;
  domainId: string;
  certA: string;
  certB: string;
  kpA: string;
  kpB: string;
  recentId: string;
  oldId: string;
  otherId: string;
  userId: string;
  wechatToken: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  domainId: '',
  certA: '',
  certB: '',
  kpA: '',
  kpB: '',
  recentId: '',
  oldId: '',
  otherId: '',
  userId: '',
  wechatToken: '',
};

describe('admin question bank', { concurrency: 1 }, () => {
  before(async () => {
    for (const key of ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
    }
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }

    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.ADMIN_USERNAME = USERNAME;
    process.env.ADMIN_PASSWORD = PASSWORD;
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.RATE_LIMIT_ADMIN_API_MAX = '100000';
    process.env.RATE_LIMIT_ADMIN_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_API_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_LOGIN_MAX = '100000';

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 2 });
    ctx.suffix = randomUUID().replace(/-/g, '').slice(0, 8);
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
    await seed();
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.suffix) {
      const ids = [ctx.recentId, ctx.oldId, ctx.otherId].filter(Boolean);
      if (ids.length > 0) {
        await pool
          .query('DELETE FROM question_bank WHERE id = ANY($1::uuid[])', [ids])
          .catch(() => undefined);
      }
      const points = [ctx.kpA, ctx.kpB].filter(Boolean);
      if (points.length > 0) {
        await pool
          .query('DELETE FROM knowledge_points WHERE id = ANY($1::uuid[])', [points])
          .catch(() => undefined);
      }
      if (ctx.domainId) {
        await pool
          .query('DELETE FROM certificates WHERE domain_id = $1', [ctx.domainId])
          .catch(() => undefined);
        await pool
          .query('DELETE FROM domains WHERE id = $1', [ctx.domainId])
          .catch(() => undefined);
      }
      if (ctx.userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [ctx.userId]).catch(() => undefined);
      }
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    for (const key of ENV_KEYS) {
      const value = savedEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  test('没有后管会话或拿微信 token 不能看题库', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/question-bank');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call('/admin/question-bank', { token: ctx.wechatToken });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);
  });

  test('默认近 30 天，可按领域、证书、知识点和时间范围筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const scoped = `domainId=${ctx.domainId}`;
    const recent = await call(`/admin/question-bank?${scoped}`, { token: admin });
    assert.equal(recent.status, 200);
    const recentList = recent.body as unknown as AdminQuestionBankList;
    assert.equal(recentList.total, 2);
    assert.equal(recentList.page, 1);
    assert.equal(recentList.pageSize, 20);
    assert.deepEqual(
      recentList.items.map((item) => item.id),
      [ctx.recentId, ctx.otherId],
    );
    assert.equal(
      recentList.items.some((item) => item.id === ctx.oldId),
      false,
    );
    const head = recentList.items[0];
    assert.ok(head);
    assert.equal(head.domainName, '题库领域');
    assert.equal(head.certificateName, '题库证书甲');
    assert.equal(head.knowledgeLabel, '合同管理');
    assert.equal(head.source, 'ai');
    assert.equal(head.summary.endsWith('…'), true);
    assert.equal(Array.from(head.summary).length, ADMIN_QUESTION_BANK_SUMMARY_MAX + 1);
    assert.equal('options' in head, false);
    assert.equal('answer' in head, false);

    const all = await call(`/admin/question-bank?${scoped}&range=all`, { token: admin });
    const allList = all.body as unknown as AdminQuestionBankList;
    assert.equal(all.status, 200);
    assert.equal(allList.total, 3);
    assert.equal(allList.items[2]?.id, ctx.oldId);
    assert.equal(allList.items[2]?.source, 'ai_variant');

    const byCert = await call(
      `/admin/question-bank?${scoped}&certificateId=${ctx.certB}&range=all`,
      { token: admin },
    );
    const certList = byCert.body as unknown as AdminQuestionBankList;
    assert.equal(certList.total, 1);
    assert.equal(certList.items[0]?.id, ctx.otherId);
    assert.equal(certList.items[0]?.certificateName, '题库证书乙');
    assert.equal(certList.items[0]?.knowledgeLabel, '结构设计');

    const byKp = await call(
      `/admin/question-bank?${scoped}&knowledgePointId=${ctx.kpA}&range=all`,
      { token: admin },
    );
    const kpList = byKp.body as unknown as AdminQuestionBankList;
    assert.equal(kpList.total, 2);
    assert.deepEqual(
      kpList.items.map((item) => item.id),
      [ctx.recentId, ctx.oldId],
    );

    const byAlias = await call(`/admin/question-bank?${scoped}&kpId=${ctx.kpB}&range=7d`, {
      token: admin,
    });
    const aliasList = byAlias.body as unknown as AdminQuestionBankList;
    assert.equal(aliasList.total, 1);
    assert.equal(aliasList.items[0]?.id, ctx.otherId);
  });

  test('非法筛选返回 400，详情只读，没有写接口', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const badRange = await call('/admin/question-bank?range=forever', { token: admin });
    assert.equal(badRange.status, 400);
    assert.equal(badRange.body.code, ApiErrorCode.VALIDATION_ERROR);

    const badKp = await call('/admin/question-bank?knowledgePointId=abc', { token: admin });
    assert.equal(badKp.status, 400);

    const clash = await call(`/admin/question-bank?knowledgePointId=${ctx.kpA}&kpId=${ctx.kpB}`, {
      token: admin,
    });
    assert.equal(clash.status, 400);

    const detail = await call(`/admin/question-bank/${ctx.recentId}`, { token: admin });
    assert.equal(detail.status, 200);
    const item = detail.body as unknown as AdminQuestionBankDetail;
    assert.equal(item.id, ctx.recentId);
    assert.equal(item.type, 'single');
    assert.equal(item.stem.startsWith('关于建设工程施工合同纠纷案'), true);
    assert.equal(item.summary.endsWith('…'), true);
    assert.deepEqual(item.answer, ['A']);
    assert.equal(item.analysis, '库解析');
    assert.equal(item.status, 'online');
    assert.equal(item.options[0]?.text, '甲');
    assert.deepEqual(item.kpIds, [ctx.kpA]);

    const missing = await call(`/admin/question-bank/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const notUuid = await call('/admin/question-bank/not-a-uuid', { token: admin });
    assert.equal(notUuid.status, 400);

    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const written = await call('/admin/question-bank', { method, token: admin, body: {} });
      assert.equal(written.status, 404, method);
      const writtenOne = await call(`/admin/question-bank/${ctx.recentId}`, {
        method,
        token: admin,
        body: {},
      });
      assert.equal(writtenOne.status, 404, method);
    }
  });
});

async function seed(): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  ctx.domainId = randomUUID();
  ctx.certA = randomUUID();
  ctx.certB = randomUUID();
  ctx.kpA = randomUUID();
  ctx.kpB = randomUUID();
  ctx.recentId = randomUUID();
  ctx.oldId = randomUUID();
  ctx.otherId = randomUUID();

  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '题库领域', 'online', 0)`,
    [ctx.domainId, `qb-${ctx.suffix}-d`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $2, $3, '题库证书甲', 'online', 100, 60, ARRAY['single','multi','judge'], 0),
        ($4, $2, $5, '题库证书乙', 'online', 100, 60, ARRAY['single','multi','judge'], 1)
    `,
    [ctx.certA, ctx.domainId, `qb-${ctx.suffix}-a`, ctx.certB, `qb-${ctx.suffix}-b`],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES
        ($1, $2, '合同管理', 'knowledge_point', '提示甲', 1, 'online', 1),
        ($3, $4, '结构设计', 'knowledge_point', '提示乙', 1, 'online', 2)
    `,
    [ctx.kpA, `qb-${ctx.suffix}-kpa`, ctx.kpB, `qb-${ctx.suffix}-kpb`],
  );

  const login = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `question-bank-${ctx.suffix}`, nick: '题库用户' },
  });
  assert.equal(login.status, 200);
  const user = login.body as unknown as WechatLoginResponse;
  ctx.userId = user.user.id;
  ctx.wechatToken = user.token;

  const stem = `关于建设工程施工合同纠纷案${'补充'.repeat(30)}`;
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  await insertRow({
    id: ctx.recentId,
    certId: ctx.certA,
    kpId: ctx.kpA,
    stem,
    source: 'ai',
    createdAt: new Date(Date.now() - hour),
  });
  await insertRow({
    id: ctx.oldId,
    certId: ctx.certA,
    kpId: ctx.kpA,
    stem: '四十天前的变异题',
    source: 'ai_variant',
    createdAt: new Date(Date.now() - 40 * day),
  });
  await insertRow({
    id: ctx.otherId,
    certId: ctx.certB,
    kpId: ctx.kpB,
    stem: '钢筋混凝土梁裂缝控制等级划分',
    source: 'ai',
    createdAt: new Date(Date.now() - 2 * hour),
  });
}

async function insertRow(input: {
  id: string;
  certId: string;
  kpId: string;
  stem: string;
  source: 'ai' | 'ai_variant';
  createdAt: Date;
}): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  await pool.query(
    `
      INSERT INTO question_bank (
        id, domain_id, certificate_id, kp_ids, type_code, stem, options, answer,
        analysis, difficulty, source, content_key, status, created_at
      )
      VALUES (
        $1, $2, $3, $4::uuid[], 'single', $5, $6::jsonb, '["A"]'::jsonb,
        '库解析', 'medium', $7, $8, 'online', $9
      )
    `,
    [
      input.id,
      ctx.domainId,
      input.certId,
      [input.kpId],
      input.stem,
      JSON.stringify([
        { id: 'A', text: '甲' },
        { id: 'B', text: '乙' },
      ]),
      input.source,
      randomBytes(24),
      input.createdAt.toISOString(),
    ],
  );
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管题库集成测试');
    return false;
  }
  return true;
}

async function adminToken(): Promise<string> {
  const login = await call('/admin/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  assert.equal(login.status, 200);
  const token = (login.body as { token?: string }).token;
  assert.equal(typeof token, 'string');
  return token ?? '';
}

async function call(
  path: string,
  options: { method?: string; token?: string; body?: unknown } = {},
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
