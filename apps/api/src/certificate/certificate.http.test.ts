import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type CertificateQueryItem,
  type CertificateQueryList,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { sessionKey } from '../session/session.service';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

interface Fixture {
  domainId: string;
  certOnline: string;
  certOffline: string;
  certUpload: string;
  certSession: string;
  certBad: string;
  certCleared: string;
  certUntouched: string;
  packA: string;
  packOffline: string;
  packB: string;
  newerSession: string;
  olderSession: string;
  snapshotSession: string;
}

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  tokens: string[];
  userA: string;
  userB: string;
  userC: string;
  tokenA: string;
  tokenB: string;
  tokenC: string;
  fixture?: Fixture;
} = {
  ready: false,
  base: '',
  tokens: [],
  userA: '',
  userB: '',
  userC: '',
  tokenA: '',
  tokenB: '',
  tokenC: '',
};

describe('certificate query', { concurrency: 1 }, () => {
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

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 2 });
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

    const first = await login('cert-a');
    const second = await login('cert-b');
    const third = await login('cert-c');
    ctx.userA = first.user.id;
    ctx.tokenA = first.token;
    ctx.userB = second.user.id;
    ctx.tokenB = second.token;
    ctx.userC = third.user.id;
    ctx.tokenC = third.token;
    ctx.fixture = await insertFixture(ctx.pool, ctx.userA, ctx.userB);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    const ids = [ctx.userA, ctx.userB, ctx.userC].filter(Boolean);
    if (pool && ids.length > 0) {
      await pool
        .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids])
        .catch(() => undefined);
    }
    if (pool && ctx.fixture) {
      const certs = [
        ctx.fixture.certOnline,
        ctx.fixture.certOffline,
        ctx.fixture.certUpload,
        ctx.fixture.certSession,
        ctx.fixture.certBad,
        ctx.fixture.certCleared,
        ctx.fixture.certUntouched,
      ];
      await pool
        .query('DELETE FROM certificates WHERE id = ANY($1::uuid[])', [certs])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM domains WHERE id = $1', [ctx.fixture.domainId])
        .catch(() => undefined);
    }
    if (ctx.redis && ctx.tokens.length > 0) {
      await ctx.redis.del(...ctx.tokens.map((token) => sessionKey(token))).catch(() => undefined);
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('未登录不能查证书，成绩占位仍不是交卷列表', async (t) => {
    if (!ready(t)) {
      return;
    }
    const anonymous = await call('/certificates');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, ApiErrorCode.UNAUTHORIZED);
    assert.equal('implemented' in anonymous.body, false);

    const scores = await call('/certificates/scores', ctx.tokenA);
    assert.equal(scores.status, 200);
    assert.equal(scores.body.implemented, false);
    assert.equal(scores.body.module, 'certificate');
    assert.equal(scores.body.action, 'scores');
  });

  test('只返回当前用户关联过的证书，最近分数来自已落库快照', async (t) => {
    if (!ready(t)) {
      return;
    }
    const fixture = requiredFixture();
    const mine = await call('/certificates', ctx.tokenA);
    assert.equal(mine.status, 200);
    assert.equal('implemented' in mine.body, false);
    const items = (mine.body as unknown as CertificateQueryList).items;
    assert.deepEqual(
      items.map((item) => item.id),
      [
        fixture.certSession,
        fixture.certBad,
        fixture.certOnline,
        fixture.certUpload,
        fixture.certOffline,
        fixture.certCleared,
      ],
    );
    assert.equal(
      items.some((item) => item.id === fixture.certUntouched || item.code.startsWith('teacher')),
      false,
    );

    const online = byId(items, fixture.certOnline);
    assert.equal(online.name, '查询甲');
    assert.equal(online.domainName, '查询领域');
    assert.equal(online.unavailable, false);
    assert.equal(online.totalScore, 120);
    assert.equal(online.passScore, 70);
    assert.deepEqual(online.enabledQuestionTypeCodes, ['single', 'judge']);
    assert.equal(online.extraConstraint, '不要整段摘抄');
    assert.equal(online.packCount, 1);
    assert.equal(online.activePackId, fixture.packA);
    assert.equal(online.submittedCount, 2);
    assert.equal(online.pendingWrongCount, 1);
    assert.equal(online.uploadCount, 0);
    assert.equal(online.latestScore?.sessionId, fixture.newerSession);
    assert.equal(online.latestScore?.earnedScore, 88);
    assert.equal(online.latestScore?.totalScore, 120);
    assert.equal(online.latestScore?.passed, true);

    const offline = byId(items, fixture.certOffline);
    assert.equal(offline.unavailable, true);
    assert.equal(offline.status, 'offline');
    assert.equal(offline.passScore, null);
    assert.equal(offline.packCount, 1);
    assert.equal(offline.activePackId, null);
    assert.equal(offline.submittedCount, 0);
    assert.equal(offline.latestScore, null);

    const uploaded = byId(items, fixture.certUpload);
    assert.equal(uploaded.packCount, 0);
    assert.equal(uploaded.uploadCount, 1);
    assert.equal(uploaded.submittedCount, 0);

    const sessionOnly = byId(items, fixture.certSession);
    assert.equal(sessionOnly.packCount, 0);
    assert.equal(sessionOnly.submittedCount, 1);
    assert.equal(sessionOnly.latestScore?.sessionId, fixture.snapshotSession);
    assert.equal(sessionOnly.latestScore?.earnedScore, 40);
    assert.equal(sessionOnly.latestScore?.passed, false);

    const bad = byId(items, fixture.certBad);
    assert.equal(bad.submittedCount, 1);
    assert.equal(bad.latestScore, null);

    const cleared = byId(items, fixture.certCleared);
    assert.equal(cleared.pendingWrongCount, 0);
    assert.equal(cleared.packCount, 0);

    const other = await call('/certificates', ctx.tokenB);
    const otherItems = (other.body as unknown as CertificateQueryList).items;
    assert.deepEqual(
      otherItems.map((item) => item.id),
      [fixture.certOnline],
    );
    assert.equal(otherItems[0]?.packCount, 1);
    assert.equal(otherItems[0]?.activePackId, fixture.packB);
    assert.equal(otherItems[0]?.submittedCount, 0);
    assert.equal(otherItems[0]?.pendingWrongCount, 0);
    assert.equal(otherItems[0]?.uploadCount, 0);
    assert.equal(otherItems[0]?.latestScore, null);

    const empty = await call('/certificates', ctx.tokenC);
    assert.deepEqual((empty.body as unknown as CertificateQueryList).items, []);

    await ctx.pool?.query(`UPDATE domains SET status = 'offline' WHERE id = $1`, [
      fixture.domainId,
    ]);
    const afterDomain = await call('/certificates', ctx.tokenA);
    assert.deepEqual(
      (afterDomain.body as unknown as CertificateQueryList).items.map((item) => item.id),
      items.map((item) => item.id),
    );
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过证书查询集成测试');
    return false;
  }
  return true;
}

function requiredFixture(): Fixture {
  if (!ctx.fixture) {
    throw new Error('缺少证书夹具');
  }
  return ctx.fixture;
}

function byId(items: CertificateQueryItem[], id: string): CertificateQueryItem {
  const item = items.find((entry) => entry.id === id);
  assert.ok(item);
  return item;
}

async function login(code: string): Promise<WechatLoginResponse> {
  const response = await call('/auth/wechat/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ code: `${code}-${randomUUID()}`, nick: code }),
  });
  assert.equal(response.status, 200);
  const body = response.body as unknown as WechatLoginResponse;
  ctx.tokens.push(body.token);
  return body;
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
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function insertFixture(pool: Pool, userA: string, userB: string): Promise<Fixture> {
  const fixture: Fixture = {
    domainId: randomUUID(),
    certOnline: randomUUID(),
    certOffline: randomUUID(),
    certUpload: randomUUID(),
    certSession: randomUUID(),
    certBad: randomUUID(),
    certCleared: randomUUID(),
    certUntouched: randomUUID(),
    packA: randomUUID(),
    packOffline: randomUUID(),
    packB: randomUUID(),
    newerSession: randomUUID(),
    olderSession: randomUUID(),
    snapshotSession: randomUUID(),
  };
  const suffix = fixture.domainId.slice(0, 8);
  const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '查询领域', 'online', 80)`,
    [fixture.domainId, `cq-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, extra_constraint, sort_order
      )
      VALUES
        ($1, $8, $9, '查询甲', 'online', 120, 70, ARRAY['single', 'judge']::text[], '不要整段摘抄', 1),
        ($2, $8, $10, '查询下架', 'offline', 100, NULL, ARRAY['single']::text[], NULL, 2),
        ($3, $8, $11, '查询课件', 'online', 100, 60, ARRAY['single']::text[], NULL, 3),
        ($4, $8, $12, '查询只交卷', 'online', 100, 60, ARRAY['single']::text[], NULL, 4),
        ($5, $8, $13, '查询坏快照', 'online', 100, 60, ARRAY['single']::text[], NULL, 5),
        ($6, $8, $14, '查询已消灭', 'online', 100, 60, ARRAY['single']::text[], NULL, 6),
        ($7, $8, $15, '查询无关', 'online', 100, 60, ARRAY['single']::text[], NULL, 7)
    `,
    [
      fixture.certOnline,
      fixture.certOffline,
      fixture.certUpload,
      fixture.certSession,
      fixture.certBad,
      fixture.certCleared,
      fixture.certUntouched,
      fixture.domainId,
      `cq-on-${suffix}`,
      `cq-off-${suffix}`,
      `cq-up-${suffix}`,
      `cq-se-${suffix}`,
      `cq-bad-${suffix}`,
      `cq-cl-${suffix}`,
      `cq-no-${suffix}`,
    ],
  );
  await pool.query(
    `
      INSERT INTO packs (id, user_id, domain_id, cert_id, name, active, updated_at)
      VALUES
        ($1, $2, $3, $4, '甲包', true, $7),
        ($5, $2, $3, $6, '下架包', false, $8),
        ($9, $10, $3, $4, '乙包', true, $7)
    `,
    [
      fixture.packA,
      userA,
      fixture.domainId,
      fixture.certOnline,
      fixture.packOffline,
      fixture.certOffline,
      hoursAgo(5),
      hoursAgo(7),
      fixture.packB,
      userB,
    ],
  );
  await insertSession(pool, {
    id: fixture.olderSession,
    userId: userA,
    packId: fixture.packA,
    snapshot: {},
    score: storedScore(70, 120, true),
    submittedAt: hoursAgo(4),
  });
  await insertSession(pool, {
    id: fixture.newerSession,
    userId: userA,
    packId: fixture.packA,
    snapshot: { certId: fixture.certOnline, name: '甲包' },
    score: storedScore(88, 120, true),
    submittedAt: hoursAgo(3),
  });
  await insertSession(pool, {
    id: fixture.snapshotSession,
    userId: userA,
    packId: null,
    snapshot: { certId: fixture.certSession, name: '已删除的包' },
    score: storedScore(40, 100, false),
    submittedAt: hoursAgo(1),
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId: userA,
    packId: null,
    snapshot: { certId: fixture.certBad },
    score: { reason: 'manual' },
    submittedAt: hoursAgo(2),
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId: userA,
    packId: null,
    snapshot: { certId: 'not-a-uuid' },
    score: storedScore(1, 1, false),
    submittedAt: hoursAgo(0.1),
  });
  await insertSession(pool, {
    id: randomUUID(),
    userId: userA,
    packId: null,
    snapshot: { certId: randomUUID() },
    score: storedScore(1, 1, false),
    submittedAt: hoursAgo(0.1),
  });
  await pool.query(
    `
      INSERT INTO wrong_items (
        id, user_id, cert_id, question_snapshot, status, wrong_count, updated_at
      )
      VALUES
        ($1, $2, $3, '{"type":"single","stem":"待消灭"}'::jsonb, 'pending', 1, $4),
        ($5, $2, $3, '{"type":"single","stem":"已消灭"}'::jsonb, 'cleared', 1, $4),
        ($6, $2, $7, '{"type":"single","stem":"只剩消灭"}'::jsonb, 'cleared', 2, $8)
    `,
    [
      randomUUID(),
      userA,
      fixture.certOnline,
      hoursAgo(5),
      randomUUID(),
      randomUUID(),
      fixture.certCleared,
      hoursAgo(8),
    ],
  );
  await pool.query(
    `
      INSERT INTO user_uploads (id, user_id, certificate_id, file_meta, status, updated_at)
      VALUES ($1, $2, $3, '{}'::jsonb, 'succeeded', $4)
    `,
    [randomUUID(), userA, fixture.certUpload, hoursAgo(6)],
  );
  return fixture;
}

async function insertSession(
  pool: Pool,
  input: {
    id: string;
    userId: string;
    packId: string | null;
    snapshot: Record<string, unknown>;
    score: Record<string, unknown>;
    submittedAt: string;
  },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_id, pack_snapshot, mode, settings, score, pass_snapshot,
        status, source, question_count, generated_count, submit_reason, submitted_at
      )
      VALUES (
        $1, $2, $3, $4::jsonb, 'exam', '{}'::jsonb, $5, $6::jsonb,
        'submitted', 'normal', 10, 10, 'manual', $7
      )
    `,
    [
      input.id,
      input.userId,
      input.packId,
      JSON.stringify(input.snapshot),
      Number(input.score.earnedScore ?? 0),
      JSON.stringify(input.score),
      input.submittedAt,
    ],
  );
}

function storedScore(
  earnedScore: number,
  totalScore: number,
  passed: boolean,
): Record<string, unknown> {
  return {
    earnedScore,
    totalScore,
    correctCount: 1,
    wrongCount: 0,
    unansweredCount: 0,
    partialCount: 0,
    questionCount: 1,
    accuracy: 1,
    scoreRate: earnedScore / totalScore,
    passed,
    passScore: 60,
    reason: 'manual',
  };
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
