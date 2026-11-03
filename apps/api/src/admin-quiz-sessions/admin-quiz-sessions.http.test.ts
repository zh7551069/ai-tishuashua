import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type AdminQuizSessionDetail,
  type AdminQuizSessionList,
  type QuizScoreList,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'quiz-sessions-admin';
const PASSWORD = 'quiz-sessions-secret';
const SECRET_MARKER = 'session-secret-marker';
const RAW_NICK = '出题同学甲乙';
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
  userA: string;
  userB: string;
  tokenA: string;
  openIdA: string;
  pendingId: string;
  generatingId: string;
  readyId: string;
  inProgressId: string;
  cancelledId: string;
  failedId: string;
  submittedId: string;
  userBId: string;
  questionId: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  userA: '',
  userB: '',
  tokenA: '',
  openIdA: '',
  pendingId: '',
  generatingId: '',
  readyId: '',
  inProgressId: '',
  cancelledId: '',
  failedId: '',
  submittedId: '',
  userBId: '',
  questionId: '',
};

describe('admin quiz sessions', { concurrency: 1 }, () => {
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
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
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

  test('没有后管会话或拿微信 token 不能看会话，后管 token 也不能看小程序成绩', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/quiz-sessions');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call(`/admin/quiz-sessions?userId=${ctx.userA}`, { token: ctx.tokenA });
    assert.equal(wechat.status, 401);

    const admin = await adminToken();
    const scores = await call('/quiz/sessions', { token: admin });
    assert.equal(scores.status, 401);
    assert.equal(scores.body.code, ApiErrorCode.UNAUTHORIZED);

    const paper = await call(`/quiz/sessions/${ctx.inProgressId}`, { token: admin });
    assert.equal(paper.status, 401);
  });

  test('默认只列出未交卷，并能按用户、模式和状态筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const all = await call(`/admin/quiz-sessions?userId=${ctx.userA}`, { token: admin });
    assert.equal(all.status, 200);
    const list = all.body as unknown as AdminQuizSessionList;
    assert.equal(list.total, 6);
    assert.equal(list.page, 1);
    assert.equal(list.pageSize, 20);
    assert.deepEqual(
      list.items.map((item) => item.id),
      [
        ctx.failedId,
        ctx.cancelledId,
        ctx.inProgressId,
        ctx.readyId,
        ctx.generatingId,
        ctx.pendingId,
      ],
    );
    assert.equal(
      list.items.some((item) => item.id === ctx.submittedId),
      false,
    );
    assert.equal(JSON.stringify(list).includes(SECRET_MARKER), false);
    assert.equal(JSON.stringify(list).includes(RAW_NICK), false);
    assert.equal(JSON.stringify(list).includes(ctx.openIdA), false);
    assert.equal(list.items[0]?.userNick, '出***乙');
    assert.equal(list.items[0]?.status, 'failed');
    assert.deepEqual(list.items[0]?.error, { code: 'LLM_UNAVAILABLE', message: '模型超时' });
    assert.equal(list.items[0]?.progress.generated, 1);
    assert.equal(list.items[0]?.progress.total, 10);

    const exams = await call(`/admin/quiz-sessions?userId=${ctx.userA}&mode=exam`, {
      token: admin,
    });
    assert.deepEqual(
      (exams.body as unknown as AdminQuizSessionList).items.map((item) => item.id),
      [ctx.inProgressId],
    );

    const pending = await call(`/admin/quiz-sessions?userId=${ctx.userA}&status=pending`, {
      token: admin,
    });
    assert.deepEqual(
      (pending.body as unknown as AdminQuizSessionList).items.map((item) => item.id),
      [ctx.pendingId],
    );

    const other = await call(`/admin/quiz-sessions?userId=${ctx.userB}`, { token: admin });
    assert.deepEqual(
      (other.body as unknown as AdminQuizSessionList).items.map((item) => item.id),
      [ctx.userBId],
    );

    const page = await call(`/admin/quiz-sessions?userId=${ctx.userA}&page=2&pageSize=2`, {
      token: admin,
    });
    const paged = page.body as unknown as AdminQuizSessionList;
    assert.equal(paged.total, 6);
    assert.deepEqual(
      paged.items.map((item) => item.id),
      [ctx.inProgressId, ctx.readyId],
    );

    const submitted = await call('/admin/quiz-sessions?status=submitted', { token: admin });
    assert.equal(submitted.status, 400);
    assert.equal(submitted.body.code, ApiErrorCode.VALIDATION_ERROR);
    assert.match(String(submitted.body.message), /证书与成绩/);
  });

  test('详情给出设置和截止时间，已交卷、取消和改状态都进不了成绩', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const detail = await call(`/admin/quiz-sessions/${ctx.inProgressId}`, { token: admin });
    assert.equal(detail.status, 200);
    const session = detail.body as unknown as AdminQuizSessionDetail;
    assert.equal(session.status, 'in_progress');
    assert.equal(session.mode, 'exam');
    assert.equal(session.source, 'wrongSet');
    assert.equal(session.packName, '甲的考试');
    assert.equal(session.certName, '快照甲');
    assert.equal(session.domainName, '快照领域');
    assert.equal(session.settingsReadable, true);
    assert.equal(session.deadlineAt, '2099-11-03T00:30:00.000Z');
    assert.equal(session.settings?.count, 10);
    assert.equal(session.settings?.timer.enabled, true);
    assert.equal(JSON.stringify(session).includes(SECRET_MARKER), false);
    assert.equal(JSON.stringify(session).includes('标准答案不要出现'), false);
    assert.equal(JSON.stringify(session).includes('run_token'), false);
    assert.equal('score' in session, false);
    assert.equal('questions' in session, false);

    const broken = await call(`/admin/quiz-sessions/${ctx.failedId}`, { token: admin });
    const failed = broken.body as unknown as AdminQuizSessionDetail;
    assert.equal(failed.settingsReadable, false);
    assert.equal(failed.settings, null);
    assert.equal(failed.deadlineAt, null);
    assert.equal(failed.packName, '刷题包信息无法读取');
    assert.equal(JSON.stringify(failed).includes(SECRET_MARKER), false);

    const submitted = await call(`/admin/quiz-sessions/${ctx.submittedId}`, { token: admin });
    assert.equal(submitted.status, 404);
    assert.equal(submitted.body.code, ApiErrorCode.NOT_FOUND);
    assert.match(String(submitted.body.message), /证书与成绩/);
    assert.equal(JSON.stringify(submitted.body).includes('88'), false);

    const missing = await call(`/admin/quiz-sessions/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.message, '出题会话不存在');

    const badId = await call('/admin/quiz-sessions/not-a-uuid', { token: admin });
    assert.equal(badId.status, 400);

    const before = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM quiz_sessions WHERE id = $1',
      [ctx.pendingId],
    );
    const cancel = await call(`/admin/quiz-sessions/${ctx.pendingId}/cancel`, {
      method: 'POST',
      token: admin,
    });
    assert.equal(cancel.status, 404);
    const after = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM quiz_sessions WHERE id = $1',
      [ctx.pendingId],
    );
    assert.equal(before?.rows[0]?.status, 'pending');
    assert.equal(after?.rows[0]?.status, 'pending');

    const own = await call('/quiz/sessions', { token: ctx.tokenA });
    assert.equal(own.status, 200);
    const scores = own.body as unknown as QuizScoreList;
    assert.deepEqual(
      scores.items.map((item) => item.id),
      [ctx.submittedId],
    );
    const stillOpen = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM quiz_sessions WHERE id = $1',
      [ctx.inProgressId],
    );
    assert.equal(stillOpen?.rows[0]?.status, 'in_progress');
  });
});

async function seed(): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  ctx.pendingId = randomUUID();
  ctx.generatingId = randomUUID();
  ctx.readyId = randomUUID();
  ctx.inProgressId = randomUUID();
  ctx.cancelledId = randomUUID();
  ctx.failedId = randomUUID();
  ctx.submittedId = randomUUID();
  ctx.userBId = randomUUID();
  ctx.questionId = randomUUID();

  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `quiz-admin-a-${ctx.suffix}`, nick: RAW_NICK },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `quiz-admin-b-${ctx.suffix}`, nick: '乙' },
  });
  assert.equal(loginB.status, 200);
  ctx.userB = (loginB.body as unknown as WechatLoginResponse).user.id;

  const openId = await pool.query<{ wx_open_id: string }>(
    'SELECT wx_open_id FROM users WHERE id = $1',
    [ctx.userA],
  );
  ctx.openIdA = openId.rows[0]?.wx_open_id ?? '';
  assert.ok(ctx.openIdA);

  const settings = {
    count: 10,
    difficulty: 'medium',
    types: ['single'],
    timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    mode: 'exam',
  };
  await insertSession({
    id: ctx.pendingId,
    userId: ctx.userA,
    mode: 'practice',
    status: 'pending',
    source: 'normal',
    snapshot: { name: '等待中', domainName: '领域', certName: '证书' },
    settings,
    createdAt: '2026-11-03T00:00:00.000Z',
  });
  await insertSession({
    id: ctx.generatingId,
    userId: ctx.userA,
    mode: 'practice',
    status: 'generating',
    source: 'normal',
    snapshot: { name: '生成中' },
    settings,
    generated: 3,
    createdAt: '2026-11-03T00:01:00.000Z',
  });
  await insertSession({
    id: ctx.readyId,
    userId: ctx.userA,
    mode: 'practice',
    status: 'ready',
    source: 'normal',
    snapshot: { name: '待答' },
    settings: { ...settings, mode: 'practice', timer: { enabled: false } },
    generated: 10,
    createdAt: '2026-11-03T00:02:00.000Z',
  });
  await insertSession({
    id: ctx.inProgressId,
    userId: ctx.userA,
    mode: 'exam',
    status: 'in_progress',
    source: 'wrongSet',
    snapshot: { name: '甲的考试', domainName: '快照领域', certName: '快照甲' },
    settings,
    generated: 10,
    startedAt: '2099-11-03T00:00:00.000Z',
    createdAt: '2026-11-03T00:03:00.000Z',
    runToken: randomUUID(),
  });
  await insertSession({
    id: ctx.cancelledId,
    userId: ctx.userA,
    mode: 'practice',
    status: 'cancelled',
    source: 'normal',
    snapshot: { name: '已取消' },
    settings,
    createdAt: '2026-11-03T00:04:00.000Z',
  });
  await insertSession({
    id: ctx.failedId,
    userId: ctx.userA,
    mode: 'practice',
    status: 'failed',
    source: 'normal',
    snapshot: { knowledgePointNames: [SECRET_MARKER] },
    settings: { hidden: SECRET_MARKER },
    generated: 1,
    errorCode: 'LLM_UNAVAILABLE',
    errorMessage: '模型超时',
    createdAt: '2026-11-03T00:05:00.000Z',
  });
  await insertSession({
    id: ctx.submittedId,
    userId: ctx.userA,
    mode: 'exam',
    status: 'submitted',
    source: 'normal',
    snapshot: { name: '已交卷', certName: '快照甲' },
    settings,
    generated: 10,
    score: 88,
    pass: {
      earnedScore: 88,
      totalScore: 100,
      correctCount: 8,
      wrongCount: 2,
      unansweredCount: 0,
      partialCount: 0,
      questionCount: 10,
      accuracy: 0.8,
      scoreRate: 0.88,
      passed: true,
      passScore: 60,
      reason: 'manual',
    },
    reason: 'manual',
    submittedAt: '2026-11-03T00:06:00.000Z',
    createdAt: '2026-11-03T00:06:00.000Z',
  });
  await insertSession({
    id: ctx.userBId,
    userId: ctx.userB,
    mode: 'practice',
    status: 'ready',
    source: 'normal',
    snapshot: { name: '乙的卷' },
    settings: { ...settings, mode: 'practice', timer: { enabled: false } },
    generated: 10,
    createdAt: '2026-11-03T00:07:00.000Z',
  });

  await pool.query(
    `
      INSERT INTO paper_questions (
        id, session_id, ordinal, type_code, stem, options, answer, analysis, source, score
      )
      VALUES ($1, $2, 1, 'single', $3, '[]'::jsonb, '["A"]'::jsonb, '标准答案不要出现', 'ai', 5)
    `,
    [ctx.questionId, ctx.inProgressId, SECRET_MARKER],
  );
}

async function insertSession(input: {
  id: string;
  userId: string;
  mode: string;
  status: string;
  source: string;
  snapshot: Record<string, unknown>;
  settings: Record<string, unknown>;
  generated?: number;
  createdAt: string;
  startedAt?: string;
  submittedAt?: string;
  score?: number;
  pass?: Record<string, unknown>;
  reason?: string;
  errorCode?: string;
  errorMessage?: string;
  runToken?: string;
}): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_snapshot, mode, settings, score, pass_snapshot, status, source,
        question_count, generated_count, error_code, error_message, submit_reason,
        created_at, updated_at, started_at, submitted_at, run_token
      )
      VALUES (
        $1, $2, $3::jsonb, $4, $5::jsonb, $6, $7::jsonb, $8, $9,
        10, $10, $11, $12, $13,
        $14, $14, $15, $16, $17
      )
    `,
    [
      input.id,
      input.userId,
      JSON.stringify(input.snapshot),
      input.mode,
      JSON.stringify(input.settings),
      input.score ?? null,
      input.pass ? JSON.stringify(input.pass) : null,
      input.status,
      input.source,
      input.generated ?? 0,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.reason ?? null,
      input.createdAt,
      input.startedAt ?? null,
      input.submittedAt ?? null,
      input.runToken ?? null,
    ],
  );
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管出题会话集成测试');
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
