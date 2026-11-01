import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type QuizQuestionView,
  type QuizSessionView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import { LlmCallError, createPgExecutor, runQuizGeneration } from '@tishuashua/shared/generation';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { sessionKey } from '../session/session.service';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

interface Fixture {
  domainId: string;
  certId: string;
  offlineCertId: string;
  limitedCertId: string;
  textbookId: string;
  kp1: string;
  kp2: string;
  limitedKp: string;
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
  tokenA: string;
  tokenB: string;
  packId: string;
  offlinePackId: string;
  limitedPackId: string;
  fixture?: Fixture;
} = {
  ready: false,
  base: '',
  tokens: [],
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
  packId: '',
  offlinePackId: '',
  limitedPackId: '',
};

describe('quiz generation', { concurrency: 1 }, () => {
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
    ctx.fixture = await insertFixture(ctx.pool);
    const first = await login('quiz-a');
    const second = await login('quiz-b');
    ctx.userA = first.user.id;
    ctx.tokenA = first.token;
    ctx.userB = second.user.id;
    ctx.tokenB = second.token;
    ctx.packId = await createPack(ctx.tokenA, ctx.fixture.certId, [
      ctx.fixture.kp1,
      ctx.fixture.kp2,
    ]);
    ctx.offlinePackId = await createPack(ctx.tokenA, ctx.fixture.offlineCertId, [ctx.fixture.kp1]);
    await ctx.pool.query(`UPDATE certificates SET status = 'offline' WHERE id = $1`, [
      ctx.fixture.offlineCertId,
    ]);
    ctx.limitedPackId = await createPack(ctx.tokenA, ctx.fixture.limitedCertId, [
      ctx.fixture.limitedKp,
    ]);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.fixture) {
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
      }
      await pool
        .query('DELETE FROM knowledge_points WHERE id = ANY($1::uuid[])', [
          [ctx.fixture.kp1, ctx.fixture.kp2, ctx.fixture.limitedKp],
        ])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = $1', [ctx.fixture.textbookId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE id = ANY($1::uuid[])', [
          [ctx.fixture.certId, ctx.fixture.offlineCertId, ctx.fixture.limitedCertId],
        ])
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

  test('未登录不能出题，别人的会话不可见', async (t) => {
    if (!ready(t)) return;
    const anonymous = await call('/quiz/sessions', undefined, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.packId)),
    });
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, ApiErrorCode.UNAUTHORIZED);

    const created = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.packId, { count: 10 })),
    });
    assert.equal(created.status, 201);
    const sessionId = (created.body as unknown as QuizSessionView).id;
    const hidden = await call(`/quiz/sessions/${sessionId}`, ctx.tokenB);
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.code, ApiErrorCode.NOT_FOUND);
  });

  test('下架包拒绝出题，且不落会话', async (t) => {
    if (!ready(t)) return;
    const beforeCount = await sessionCount(ctx.offlinePackId);
    const response = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.offlinePackId)),
    });
    assert.equal(response.status, 409);
    assert.equal(response.body.code, ApiErrorCode.PACK_UNAVAILABLE);
    assert.equal(await sessionCount(ctx.offlinePackId), beforeCount);
  });

  test('未打开 mock 且没有 Key 时显式拒绝', async (t) => {
    if (!ready(t)) return;
    const previousMock = process.env.LLM_MOCK;
    const previousKey = process.env.LLM_API_KEY;
    process.env.LLM_MOCK = 'false';
    process.env.LLM_API_KEY = '';
    try {
      const beforeCount = await sessionCount(ctx.packId);
      const response = await call('/quiz/sessions', ctx.tokenA, {
        method: 'POST',
        body: JSON.stringify(payload(ctx.packId)),
      });
      assert.equal(response.status, 503);
      assert.equal(response.body.code, ApiErrorCode.LLM_NOT_CONFIGURED);
      assert.equal(await sessionCount(ctx.packId), beforeCount);
    } finally {
      process.env.LLM_MOCK = previousMock;
      process.env.LLM_API_KEY = previousKey;
    }
  });

  test('题量和证书外题型会被拒绝', async (t) => {
    if (!ready(t)) return;
    const badCount = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.packId, { count: 15 })),
    });
    assert.equal(badCount.status, 400);
    assert.equal(badCount.body.code, ApiErrorCode.VALIDATION_ERROR);

    const badType = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.limitedPackId, { types: ['multi'] })),
    });
    assert.equal(badType.status, 400);
    assert.equal(badType.body.code, ApiErrorCode.VALIDATION_ERROR);
  });

  test('取消会丢掉已经写入的半卷', async (t) => {
    if (!ready(t)) return;
    const created = await createSession(ctx.packId);
    const pool = requiredPool();
    await pool.query(
      `UPDATE quiz_sessions SET status = 'generating', generated_count = 2 WHERE id = $1`,
      [created.id],
    );
    await pool.query(
      `
        INSERT INTO paper_questions (
          id, session_id, ordinal, type_code, stem, options, answer, source, score
        )
        VALUES
          ($1, $3, 1, 'single', '半卷1', '[{"id":"A","text":"甲"},{"id":"B","text":"乙"}]'::jsonb, '["A"]'::jsonb, 'ai', 1),
          ($2, $3, 2, 'single', '半卷2', '[{"id":"A","text":"甲"},{"id":"B","text":"乙"}]'::jsonb, '["A"]'::jsonb, 'ai', 1)
      `,
      [randomUUID(), randomUUID(), created.id],
    );
    const cancelled = await call(`/quiz/sessions/${created.id}/cancel`, ctx.tokenA, {
      method: 'POST',
    });
    assert.equal(cancelled.status, 200);
    assert.equal((cancelled.body as unknown as QuizSessionView).status, 'cancelled');
    assert.equal((cancelled.body as unknown as QuizSessionView).paper, null);
    assert.equal(await questionCount(created.id), 0);
  });

  test('mock 成卷、错题配额、分值归一化，并能拉卷作答', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    const prompts = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM prompt_templates WHERE status = 'published'`,
    );
    assert.ok((prompts.rows[0]?.count ?? 0) >= 1);

    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const fresh = await generate(ctx.packId);
    assert.equal(fresh.questions.length, 10);
    assert.equal(
      fresh.questions.every((item) => item.source === 'ai'),
      true,
    );
    assert.equal(sumScores(fresh.questions), 100);
    for (const question of fresh.questions) {
      assert.equal('answer' in question, false);
      assert.equal('analysis' in question, false);
      assert.ok(question.stem.length > 0);
      assert.ok(question.options.length >= 2);
    }

    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    for (let index = 0; index < 8; index += 1) {
      await pool.query(
        `
          INSERT INTO wrong_items (id, user_id, cert_id, kp_ids, question_snapshot, status, wrong_count)
          VALUES ($1, $2, $3, $4::uuid[], $5::jsonb, 'pending', $6)
        `,
        [
          randomUUID(),
          ctx.userA,
          ctx.fixture?.certId,
          [ctx.fixture?.kp1],
          JSON.stringify({
            type: 'single',
            stem: `未消灭错题 ${index}`,
            options: [
              { id: 'A', text: '正确' },
              { id: 'B', text: '错误' },
            ],
            answer: ['A'],
            analysis: '不应下发给客户端',
            score: 9,
          }),
          8 - index,
        ],
      );
    }
    const mixed = await generate(ctx.packId);
    const carried = mixed.questions.filter((item) => item.source === 'wrong_carry');
    const generatedByAi = mixed.questions.filter((item) => item.source === 'ai');
    assert.equal(carried.length, 5);
    assert.equal(generatedByAi.length, 5);
    assert.equal(sumScores(mixed.questions), 100);
    assert.equal(
      mixed.questions.some((item) => item.stem.startsWith('未消灭错题')),
      true,
    );

    const started = await call(`/quiz/sessions/${mixed.id}/start`, ctx.tokenA, { method: 'POST' });
    assert.equal(started.status, 200);
    assert.equal((started.body as unknown as QuizSessionView).status, 'in_progress');
    const first = mixed.questions[0];
    assert.ok(first);
    const saved = await call(`/quiz/sessions/${mixed.id}/answers`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ questionId: first.id, selected: [first.options[0]?.id] }),
    });
    assert.equal(saved.status, 200);
    const again = await call(`/quiz/sessions/${mixed.id}`, ctx.tokenA);
    const viewed = (again.body as unknown as QuizSessionView).paper?.questions[0];
    assert.equal(viewed?.selected[0], first.options[0]?.id);
    assert.equal(viewed ? 'answer' in viewed : true, false);

    const blocked = await call(`/quiz/sessions/${mixed.id}/cancel`, ctx.tokenA, { method: 'POST' });
    assert.equal(blocked.status, 409);
    assert.equal(await questionCount(mixed.id), 10);
  });

  test('生成过程中取消或模型失败都不留题目', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    const executor = createPgExecutor(pool);

    const cancelled = await createSession(ctx.packId);
    const cancelOutcome = await runQuizGeneration(executor, cancelled.id, {
      mode: 'mock',
      beforePersist: async (ordinal) => {
        if (ordinal === 3) {
          await pool.query(
            `UPDATE quiz_sessions SET status = 'cancelled', run_token = NULL WHERE id = $1`,
            [cancelled.id],
          );
        }
      },
    });
    assert.equal(cancelOutcome.status, 'cancelled');
    assert.equal(await questionCount(cancelled.id), 0);

    const invalid = await createSession(ctx.packId);
    const invalidOutcome = await runQuizGeneration(executor, invalid.id, {
      mode: 'live',
      provider: 'deepseek',
      apiKey: 'test-key',
      baseUrl: 'http://127.0.0.1:9',
      completeAi: async () => ({ questions: [] }),
    });
    assert.equal(invalidOutcome.status, 'failed');
    if (invalidOutcome.status === 'failed') {
      assert.equal(invalidOutcome.code, ApiErrorCode.LLM_INVALID_OUTPUT);
    }
    assert.equal(await questionCount(invalid.id), 0);
    const invalidView = await call(`/quiz/sessions/${invalid.id}`, ctx.tokenA);
    assert.equal((invalidView.body as unknown as QuizSessionView).status, 'failed');
    assert.equal((invalidView.body as unknown as QuizSessionView).paper, null);

    const unavailable = await createSession(ctx.packId);
    await pool.query(`UPDATE certificates SET status = 'offline' WHERE id = $1`, [
      ctx.fixture?.certId,
    ]);
    try {
      const offlineOutcome = await runQuizGeneration(executor, unavailable.id, { mode: 'mock' });
      assert.equal(offlineOutcome.status, 'failed');
      if (offlineOutcome.status === 'failed') {
        assert.equal(offlineOutcome.code, ApiErrorCode.PACK_UNAVAILABLE);
      }
      assert.equal(await questionCount(unavailable.id), 0);
    } finally {
      await pool.query(`UPDATE certificates SET status = 'online' WHERE id = $1`, [
        ctx.fixture?.certId,
      ]);
    }

    const broken = await createSession(ctx.packId);
    const brokenOutcome = await runQuizGeneration(executor, broken.id, {
      mode: 'live',
      provider: 'tongyi',
      apiKey: 'test-key',
      baseUrl: '',
      completeAi: async () => {
        throw new LlmCallError(ApiErrorCode.LLM_UNAVAILABLE, '模型请求超时');
      },
    });
    assert.equal(brokenOutcome.status, 'failed');
    if (brokenOutcome.status === 'failed') {
      assert.equal(brokenOutcome.code, ApiErrorCode.LLM_UNAVAILABLE);
    }
    assert.equal(await questionCount(broken.id), 0);
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过出题集成测试');
    return false;
  }
  return true;
}

function payload(
  packId: string,
  extra?: { count?: number; types?: string[] },
): Record<string, unknown> {
  return {
    packId,
    count: extra?.count ?? 10,
    difficulty: 'medium',
    types: extra?.types ?? ['single', 'multi', 'judge'],
    timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    mode: 'practice',
  };
}

async function createSession(packId: string): Promise<QuizSessionView> {
  const response = await call('/quiz/sessions', ctx.tokenA, {
    method: 'POST',
    body: JSON.stringify(payload(packId)),
  });
  assert.equal(response.status, 201);
  const body = response.body as unknown as QuizSessionView;
  assert.equal(body.status, 'pending');
  assert.equal(body.paper, null);
  assert.equal(body.progress.total, 10);
  return body;
}

async function generate(
  packId: string,
): Promise<QuizSessionView & { questions: QuizQuestionView[] }> {
  const created = await createSession(packId);
  const outcome = await runQuizGeneration(createPgExecutor(requiredPool()), created.id, {
    mode: 'mock',
  });
  assert.equal(outcome.status, 'ready');
  const response = await call(`/quiz/sessions/${created.id}`, ctx.tokenA);
  assert.equal(response.status, 200);
  const body = response.body as unknown as QuizSessionView;
  assert.equal(body.status, 'ready');
  assert.ok(body.paper);
  return { ...body, questions: body.paper?.questions ?? [] };
}

async function sessionCount(packId: string): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM quiz_sessions WHERE pack_id = $1`,
    [packId],
  );
  return result.rows[0]?.count ?? 0;
}

async function questionCount(sessionId: string): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM paper_questions WHERE session_id = $1`,
    [sessionId],
  );
  return result.rows[0]?.count ?? 0;
}

function sumScores(questions: readonly QuizQuestionView[]): number {
  return questions.reduce((sum, question) => sum + question.score, 0);
}

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('测试数据库不可用');
  }
  return ctx.pool;
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

async function createPack(
  token: string,
  certId: string,
  knowledgePointIds: string[],
): Promise<string> {
  const response = await call('/packs', token, {
    method: 'POST',
    body: JSON.stringify({
      domainId: ctx.fixture?.domainId,
      certId,
      knowledgePointIds,
      name: `出题${certId.slice(0, 4)}`,
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return (response.body as { id: string }).id;
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

async function insertFixture(pool: Pool): Promise<Fixture> {
  const fixture: Fixture = {
    domainId: randomUUID(),
    certId: randomUUID(),
    offlineCertId: randomUUID(),
    limitedCertId: randomUUID(),
    textbookId: randomUUID(),
    kp1: randomUUID(),
    kp2: randomUUID(),
    limitedKp: randomUUID(),
  };
  const suffix = fixture.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '出题领域', 'online', 80)`,
    [fixture.domainId, `quiz-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes,
        extra_constraint, sort_order
      )
      VALUES
        ($1, $4, $5, '出题证书', 'online', 100, 60, ARRAY['single','multi','judge']::text[], '只用简体中文', 1),
        ($2, $4, $6, '出题下架证书', 'online', 100, 60, ARRAY['single']::text[], NULL, 2),
        ($3, $4, $7, '仅单选证书', 'online', 100, 60, ARRAY['single']::text[], NULL, 3)
    `,
    [
      fixture.certId,
      fixture.offlineCertId,
      fixture.limitedCertId,
      fixture.domainId,
      `quiz-cert-${suffix}`,
      `quiz-off-${suffix}`,
      `quiz-single-${suffix}`,
    ],
  );
  await pool.query(
    `INSERT INTO textbooks (id, code, name, status, sort_order) VALUES ($1, $2, '出题教材', 'online', 1)`,
    [fixture.textbookId, `quiz-book-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO textbook_certificates (textbook_id, certificate_id)
      VALUES ($1, $2), ($1, $3), ($1, $4)
    `,
    [fixture.textbookId, fixture.certId, fixture.offlineCertId, fixture.limitedCertId],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES
        ($1, $4, NULL, $5, '出题知识点一', 'knowledge_point', '围绕概念出原创题', 1, 'online', 1),
        ($2, $4, NULL, $6, '出题知识点二', 'knowledge_point', '围绕应用出原创题', 1, 'online', 2),
        ($3, $4, NULL, $7, '单选知识点', 'knowledge_point', '只出单选', 1, 'online', 3)
    `,
    [
      fixture.kp1,
      fixture.kp2,
      fixture.limitedKp,
      fixture.textbookId,
      `quiz-kp-1-${suffix}`,
      `quiz-kp-2-${suffix}`,
      `quiz-kp-3-${suffix}`,
    ],
  );
  return fixture;
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
