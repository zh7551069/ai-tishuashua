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
    assert.equal(viewed?.review, null);
    assert.equal(JSON.stringify(again.body).includes(MOCK_ANALYSIS), false);

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

  test('未交卷不泄答案，交卷后判分并写入错题本', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const paper = await generate(ctx.packId);
    const hidden = JSON.stringify(paper);
    assert.equal(hidden.includes(MOCK_ANALYSIS), false);
    assert.equal(
      paper.questions.every((question) => question.review === null),
      true,
    );
    assert.equal(paper.result, null);

    const stored = await storedQuestions(paper.id);
    assert.equal(stored.length, 10);
    const firstSingle = stored.find((question) => question.type_code === 'single');
    const multi = stored.find((question) => question.type_code === 'multi');
    const judge = stored.find((question) => question.type_code === 'judge');
    const blank = stored.find(
      (question) => question.type_code === 'single' && question.id !== firstSingle?.id,
    );
    assert.ok(firstSingle && multi && judge && blank);
    assert.ok(multi.answer.length >= 2);

    await saveSelection(paper.id, firstSingle.id, firstSingle.answer);
    await saveSelection(paper.id, multi.id, [multi.answer[0] ?? '']);
    const wrongJudge = judge.options.find((option) => !judge.answer.includes(option.id));
    assert.ok(wrongJudge);
    await saveSelection(paper.id, judge.id, [wrongJudge.id]);
    for (const question of stored) {
      if (
        question.id === firstSingle.id ||
        question.id === multi.id ||
        question.id === judge.id ||
        question.id === blank.id
      ) {
        continue;
      }
      await saveSelection(paper.id, question.id, question.answer);
    }

    const submitted = await call(`/quiz/sessions/${paper.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(submitted.status, 200);
    const scored = submitted.body as unknown as QuizSessionView;
    assert.equal(scored.status, 'submitted');
    assert.equal(scored.result?.reason, 'manual');
    assert.equal(scored.result?.totalScore, 100);
    assert.equal(scored.result?.passScore, 60);
    assert.equal(scored.paper?.questions.length, 10);

    const byId = new Map(scored.paper?.questions.map((question) => [question.id, question]));
    const correctReview = byId.get(firstSingle.id)?.review;
    const partialReview = byId.get(multi.id)?.review;
    const wrongReview = byId.get(judge.id)?.review;
    const blankReview = byId.get(blank.id)?.review;
    assert.equal(correctReview?.outcome, 'correct');
    assert.equal(correctReview?.earnedScore, firstSingle.score);
    assert.deepEqual(correctReview?.answer, firstSingle.answer);
    assert.equal(correctReview?.analysis, MOCK_ANALYSIS);
    assert.equal(partialReview?.outcome, 'partial');
    assert.equal(partialReview?.earnedScore, Math.floor(multi.score / 2));
    assert.equal(wrongReview?.outcome, 'wrong');
    assert.equal(wrongReview?.earnedScore, 0);
    assert.equal(blankReview?.outcome, 'unanswered');
    assert.equal(blankReview?.earnedScore, 0);
    assert.equal(scored.result?.correctCount, 7);
    assert.equal(scored.result?.partialCount, 1);
    assert.equal(scored.result?.wrongCount, 1);
    assert.equal(scored.result?.unansweredCount, 1);
    assert.equal(scored.result?.accuracy, 0.7);
    const earned =
      firstSingle.score +
      Math.floor(multi.score / 2) +
      stored
        .filter(
          (question) =>
            question.id !== firstSingle.id &&
            question.id !== multi.id &&
            question.id !== judge.id &&
            question.id !== blank.id,
        )
        .reduce((sum, question) => sum + question.score, 0);
    assert.equal(scored.result?.earnedScore, earned);
    assert.equal(scored.result?.passed, earned >= 60);

    const blocked = await call(`/quiz/sessions/${paper.id}/answers`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ questionId: firstSingle.id, selected: ['Z'] }),
    });
    assert.equal(blocked.status, 409);

    const again = await call(`/quiz/sessions/${paper.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(again.status, 200);
    assert.equal(await wrongCount(ctx.userA), 3);
    const wrongRows = await pool.query<{ wrong_count: number }>(
      `SELECT wrong_count FROM wrong_items WHERE user_id = $1 AND status = 'pending'`,
      [ctx.userA],
    );
    assert.equal(
      wrongRows.rows.every((row) => Number(row.wrong_count) === 1),
      true,
    );

    const list = await call('/wrong-book', ctx.tokenA);
    assert.equal(list.status, 200);
    const items = (list.body as { items?: { id: string; stem: string; answer: string[] }[] }).items;
    assert.equal(items?.length, 3);
    assert.equal(items?.some((item) => item.stem === multi.stem) ?? false, true);
    const hiddenFromOther = await call('/wrong-book', ctx.tokenB);
    assert.equal(((hiddenFromOther.body as { items?: unknown[] }).items ?? []).length, 0);
    const firstWrong = items?.[0];
    assert.ok(firstWrong);
    const detail = await call(`/wrong-book/${firstWrong.id}`, ctx.tokenA);
    assert.equal(detail.status, 200);
    assert.ok(((detail.body as { answer?: string[] }).answer ?? []).length > 0);
    const foreign = await call(`/wrong-book/${firstWrong.id}`, ctx.tokenB);
    assert.equal(foreign.status, 404);

    const scores = await call('/quiz/sessions', ctx.tokenA);
    assert.equal(scores.status, 200);
    const scoreBody = scores.body as {
      items?: { id: string; earnedScore: number }[];
      total?: number;
      limit?: number;
      hasMore?: boolean;
    };
    const scoreItems = scoreBody.items;
    const mine = scoreItems?.find((item) => item.id === paper.id);
    assert.equal(mine?.earnedScore, earned);
    assert.equal(mine ? 'answer' in mine : true, false);
    assert.equal(scoreBody.limit, 50);
    assert.equal(typeof scoreBody.total, 'number');
    assert.equal(scoreBody.hasMore, (scoreBody.total ?? 0) > 50);

    const cleared = await call(`/wrong-book/${firstWrong.id}/clear`, ctx.tokenA, {
      method: 'POST',
    });
    assert.equal(cleared.status, 200);
    assert.equal((cleared.body as { status?: string }).status, 'cleared');
    const pending = await call('/wrong-book', ctx.tokenA);
    assert.equal(
      ((pending.body as { items?: { id: string }[] }).items ?? []).some(
        (item) => item.id === firstWrong.id,
      ),
      false,
    );
    const clearedList = await call('/wrong-book?status=cleared', ctx.tokenA);
    assert.equal(
      ((clearedList.body as { items?: { id: string }[] }).items ?? []).some(
        (item) => item.id === firstWrong.id,
      ),
      true,
    );
  });

  test('答对同一道错题后会把它标为已消灭', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    await pool.query(
      `
        INSERT INTO wrong_items (id, user_id, cert_id, kp_ids, question_snapshot, status, wrong_count)
        VALUES ($1, $2, $3, $4::uuid[], $5::jsonb, 'pending', 2)
      `,
      [
        randomUUID(),
        ctx.userA,
        ctx.fixture?.certId,
        [ctx.fixture?.kp1],
        JSON.stringify({
          type: 'single',
          stem: '待消灭的原题',
          options: [
            { id: 'A', text: '对' },
            { id: 'B', text: '错' },
          ],
          answer: ['A'],
          analysis: '选 A',
          score: 4,
        }),
      ],
    );
    const paper = await generate(ctx.packId);
    const carried = paper.questions.find((question) => question.stem === '待消灭的原题');
    assert.equal(carried?.source, 'wrong_carry');
    assert.ok(carried);
    const stored = await storedQuestions(paper.id);
    for (const question of stored) {
      await saveSelection(paper.id, question.id, question.answer);
    }
    const submitted = await call(`/quiz/sessions/${paper.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(submitted.status, 200);
    assert.equal((submitted.body as unknown as QuizSessionView).result?.correctCount, 10);
    const pending = await call('/wrong-book?status=pending', ctx.tokenA);
    assert.equal(((pending.body as { items?: unknown[] }).items ?? []).length, 0);
    const cleared = await call('/wrong-book?status=cleared', ctx.tokenA);
    const clearedItems = (cleared.body as { items?: { stem: string }[] }).items ?? [];
    assert.equal(
      clearedItems.some((item) => item.stem === '待消灭的原题'),
      true,
    );
  });

  test('考试到点强制收卷，练习到点不收卷', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);

    const exam = await generate(ctx.packId, {
      mode: 'exam',
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    });
    const started = await call(`/quiz/sessions/${exam.id}/start`, ctx.tokenA, { method: 'POST' });
    assert.equal(started.status, 200);
    const open = started.body as unknown as QuizSessionView;
    assert.equal(open.status, 'in_progress');
    assert.equal(typeof open.deadlineAt, 'string');
    assert.equal(open.paper?.questions[0]?.review, null);
    assert.equal(JSON.stringify(open).includes(MOCK_ANALYSIS), false);

    const early = await call(`/quiz/sessions/${exam.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ reason: 'timeout' }),
    });
    assert.equal(early.status, 200);
    assert.equal((early.body as unknown as QuizSessionView).result?.reason, 'manual');

    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const timed = await generate(ctx.packId, {
      mode: 'exam',
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    });
    await call(`/quiz/sessions/${timed.id}/start`, ctx.tokenA, { method: 'POST' });
    await pool.query(
      `UPDATE quiz_sessions SET started_at = now() - interval '31 minutes' WHERE id = $1`,
      [timed.id],
    );
    const closed = await call(`/quiz/sessions/${timed.id}`, ctx.tokenA);
    const closedBody = closed.body as unknown as QuizSessionView;
    assert.equal(closed.status, 200);
    assert.equal(closedBody.status, 'submitted');
    assert.equal(closedBody.result?.reason, 'timeout');
    assert.equal(closedBody.paper?.questions[0]?.review?.analysis, MOCK_ANALYSIS);
    assert.equal(await wrongCount(ctx.userA), 10);
    const lateAnswer = await call(`/quiz/sessions/${timed.id}/answers`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({
        questionId: timed.questions[0]?.id,
        selected: [timed.questions[0]?.options[0]?.id],
      }),
    });
    assert.equal(lateAnswer.status, 409);

    const perQuestion = await generate(ctx.packId, {
      mode: 'exam',
      timer: { enabled: true, kind: 'per_question', perQuestionSeconds: 60 },
    });
    await call(`/quiz/sessions/${perQuestion.id}/start`, ctx.tokenA, { method: 'POST' });
    await pool.query(
      `UPDATE quiz_sessions SET started_at = now() - interval '30 minutes' WHERE id = $1`,
      [perQuestion.id],
    );
    const perClosed = await call(`/quiz/sessions/${perQuestion.id}`, ctx.tokenA);
    assert.equal((perClosed.body as unknown as QuizSessionView).status, 'submitted');
    assert.equal((perClosed.body as unknown as QuizSessionView).result?.reason, 'timeout');

    const practice = await generate(ctx.packId, {
      mode: 'practice',
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    });
    await call(`/quiz/sessions/${practice.id}/start`, ctx.tokenA, { method: 'POST' });
    await pool.query(
      `UPDATE quiz_sessions SET started_at = now() - interval '2 hours' WHERE id = $1`,
      [practice.id],
    );
    const still = await call(`/quiz/sessions/${practice.id}`, ctx.tokenA);
    const stillBody = still.body as unknown as QuizSessionView;
    assert.equal(stillBody.status, 'in_progress');
    assert.equal(stillBody.deadlineAt, null);
    assert.equal(stillBody.paper?.questions[0]?.review, null);
    assert.equal(JSON.stringify(stillBody).includes(MOCK_ANALYSIS), false);

    const pending = await createSession(ctx.packId);
    const rejected = await call(`/quiz/sessions/${pending.id}/submit`, ctx.tokenA, {
      method: 'POST',
    });
    assert.equal(rejected.status, 409);
    const foreign = await call(`/quiz/sessions/${practice.id}/submit`, ctx.tokenB, {
      method: 'POST',
    });
    assert.equal(foreign.status, 404);
  });

  test('成绩超过 50 条时返回 hasMore，并且不带出更早的记录', async (t) => {
    if (!ready(t)) return;
    const account = await login('quiz-score-limit');
    const pool = requiredPool();
    const newestFirst = Array.from({ length: 51 }, () => randomUUID());
    const oldestId = newestFirst[50];
    const stillShownId = newestFirst[49];
    const newestId = newestFirst[0];
    assert.ok(oldestId && stillShownId && newestId);
    const unreadableId = randomUUID();
    const inProgressId = randomUUID();
    const otherId = randomUUID();
    const base = Date.now();
    const at = (index: number) => new Date(base - index * 60_000).toISOString();
    try {
      await insertScoreRows(
        account.user.id,
        newestFirst.slice(0, 50).map((id, index) => ({ id, submittedAt: at(index) })),
      );
      await insertScoreRows(account.user.id, [
        {
          id: inProgressId,
          submittedAt: at(1),
          status: 'in_progress',
          pass: null,
          reason: null,
        },
      ]);
      await insertScoreRows(ctx.userB, [{ id: otherId, submittedAt: at(0) }]);

      const first = await call('/quiz/sessions', account.token);
      assert.equal(first.status, 200);
      const firstBody = first.body as {
        items: { id: string }[];
        total: number;
        limit: number;
        hasMore: boolean;
      };
      assert.equal(firstBody.limit, 50);
      assert.equal(firstBody.total, 50);
      assert.equal(firstBody.hasMore, false);
      assert.equal(firstBody.items.length, 50);
      assert.equal(firstBody.items[0]?.id, newestId);
      assert.equal(
        firstBody.items.some((item) => item.id === inProgressId),
        false,
      );
      assert.equal(
        firstBody.items.some((item) => item.id === otherId),
        false,
      );

      await insertScoreRows(account.user.id, [
        { id: oldestId, submittedAt: at(80) },
        {
          id: unreadableId,
          submittedAt: at(90),
          pass: { note: 'not-a-score' },
        },
      ]);

      const second = await call('/quiz/sessions', account.token);
      assert.equal(second.status, 200);
      const secondBody = second.body as {
        items: { id: string }[];
        total: number;
        limit: number;
        hasMore: boolean;
      };
      const shown = secondBody.items.map((item) => item.id);
      assert.equal(secondBody.limit, 50);
      assert.equal(secondBody.total, 52);
      assert.equal(secondBody.hasMore, true);
      assert.equal(shown.length, 50);
      assert.equal(shown[0], newestId);
      assert.equal(shown.includes(stillShownId), true);
      assert.equal(shown.includes(oldestId), false);
      assert.equal(shown.includes(unreadableId), false);
      assert.equal(shown.includes(inProgressId), false);
      assert.equal(shown.includes(otherId), false);
    } finally {
      await pool.query('DELETE FROM users WHERE id = $1', [account.user.id]).catch(() => undefined);
      await pool.query('DELETE FROM quiz_sessions WHERE id = $1', [otherId]).catch(() => undefined);
    }
  });

  test('错题本下发 kpIds，复练同类只覆盖本次会话且不改包', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    const fixture = requiredFixture();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const wrongId = await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp2],
      stem: '复练原题',
    });
    const detail = await call(`/wrong-book/${wrongId}`, ctx.tokenA);
    assert.equal(detail.status, 200);
    const detailBody = detail.body as { kpIds?: string[]; kpNames?: string[] };
    assert.deepEqual(detailBody.kpIds, [fixture.kp2]);
    assert.deepEqual(detailBody.kpNames, ['出题知识点二']);
    const list = await call('/wrong-book?status=all', ctx.tokenA);
    const listed = ((list.body as { items?: { id: string; kpIds?: string[] }[] }).items ?? []).find(
      (item) => item.id === wrongId,
    );
    assert.deepEqual(listed?.kpIds, [fixture.kp2]);

    const before = await packBinding(ctx.packId);
    const beforeCount = await sessionCount(ctx.packId);
    const rejected = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(
        payload(ctx.packId, {
          source: 'retrain_similar',
          knowledgePointIds: [fixture.limitedKp],
        }),
      ),
    });
    assert.equal(rejected.status, 400);
    assert.equal(rejected.body.code, ApiErrorCode.VALIDATION_ERROR);
    assert.match(String(rejected.body.message), /没有可用的知识点/);
    assert.equal(await sessionCount(ctx.packId), beforeCount);

    await pool.query(`UPDATE knowledge_points SET status = 'offline' WHERE id = $1`, [fixture.kp1]);
    try {
      const offline = await call('/quiz/sessions', ctx.tokenA, {
        method: 'POST',
        body: JSON.stringify(
          payload(ctx.packId, {
            source: 'retrain_similar',
            knowledgePointIds: [fixture.kp1],
          }),
        ),
      });
      assert.equal(offline.status, 400);
      assert.equal(offline.body.code, ApiErrorCode.VALIDATION_ERROR);
      assert.equal(await sessionCount(ctx.packId), beforeCount);
    } finally {
      await pool.query(`UPDATE knowledge_points SET status = 'online' WHERE id = $1`, [
        fixture.kp1,
      ]);
    }

    const closed = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(payload(ctx.packId, { source: 'wrongSet' })),
    });
    assert.equal(closed.status, 400);
    assert.match(String(closed.body.message), /暂未开放/);
    assert.equal(await sessionCount(ctx.packId), beforeCount);

    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const paper = await generate(ctx.packId, {
      source: 'retrain_similar',
      mode: 'exam',
      knowledgePointIds: [fixture.kp2],
    });
    assert.equal(paper.source, 'retrain_similar');
    assert.equal(paper.mode, 'exam');
    assert.equal(paper.questions.length, 10);
    assert.equal(
      paper.questions.every((question) => question.stem.includes('出题知识点二')),
      true,
    );
    assert.equal(
      paper.questions.some((question) => question.stem.includes('出题知识点一')),
      false,
    );
    const stored = await storedQuestions(paper.id);
    assert.equal(
      stored.every(
        (question) => question.kp_ids.length === 1 && question.kp_ids[0] === fixture.kp2,
      ),
      true,
    );
    const row = await sessionRow(paper.id);
    assert.deepEqual(row?.knowledge_point_ids, [fixture.kp2]);
    assert.equal(row?.wrong_item_id, null);
    assert.deepEqual(await packBinding(ctx.packId), before);
    const submitted = await call(`/quiz/sessions/${paper.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(submitted.status, 200);
    const scores = await call('/quiz/sessions', ctx.tokenA);
    const score = (
      (scores.body as { items?: { id: string; source?: string }[] }).items ?? []
    ).find((item) => item.id === paper.id);
    assert.equal(score?.source, 'retrain_similar');

    const carriedWrong = await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp2],
      stem: '同类可带入',
    });
    const outside = await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp1],
      stem: '包外知识点不带入',
    });
    const mixed = await generate(ctx.packId, {
      source: 'retrain_similar',
      knowledgePointIds: [fixture.kp2],
    });
    assert.equal(
      mixed.questions.some(
        (question) => question.stem === '同类可带入' && question.source === 'wrong_carry',
      ),
      true,
    );
    assert.equal(
      mixed.questions.some((question) => question.stem === '包外知识点不带入'),
      false,
    );
    assert.ok(carriedWrong && outside);
  });

  test('题型变异只出 1 道练习题，答对不消灭原错，并计入成绩', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    const fixture = requiredFixture();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const before = await packBinding(ctx.packId);
    const beforeCount = await sessionCount(ctx.packId);
    const wrongId = await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp1],
      stem: '待变异的原题干',
      analysis: 'VARIANT_ANALYSIS_SENTINEL',
    });
    await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp1],
      stem: '不应带入的错题',
    });

    const badCount = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, wrongId, { count: 10 })),
    });
    assert.equal(badCount.status, 400);
    assert.match(String(badCount.body.message), /只能出 1 道题/);
    const badMode = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, wrongId, { mode: 'exam' })),
    });
    assert.equal(badMode.status, 400);
    assert.match(String(badMode.body.message), /仅支持练习/);
    const foreign = await insertWrong({
      userId: ctx.userB,
      certId: fixture.certId,
      kpIds: [fixture.kp1],
      stem: '别人的错题',
    });
    const hidden = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, foreign)),
    });
    assert.equal(hidden.status, 404);
    const otherCert = await insertWrong({
      certId: fixture.limitedCertId,
      kpIds: [fixture.limitedKp],
      stem: '另一证书',
    });
    const mismatched = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, otherCert)),
    });
    assert.equal(mismatched.status, 400);
    assert.match(String(mismatched.body.message), /同一证书/);
    assert.equal(await sessionCount(ctx.packId), beforeCount);

    const created = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({
        ...variantPayload(ctx.packId, wrongId, { knowledgePointIds: [fixture.kp2] }),
        types: undefined,
      }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const pending = created.body as unknown as QuizSessionView;
    assert.equal(pending.source, 'variant');
    assert.equal(pending.mode, 'practice');
    assert.equal(pending.progress.total, 1);
    assert.equal(pending.paper, null);
    const meta = await sessionRow(pending.id);
    assert.equal(meta?.source, 'variant');
    assert.equal(meta?.question_count, 1);
    assert.equal(meta?.wrong_item_id, wrongId);
    assert.deepEqual(meta?.knowledge_point_ids, [fixture.kp1]);
    assert.deepEqual(await packBinding(ctx.packId), before);

    const outcome = await runQuizGeneration(createPgExecutor(pool), pending.id, { mode: 'mock' });
    assert.equal(outcome.status, 'ready');
    const readyPaper = await call(`/quiz/sessions/${pending.id}`, ctx.tokenA);
    const paper = readyPaper.body as unknown as QuizSessionView;
    assert.equal(paper.paper?.questions.length, 1);
    const question = paper.paper?.questions[0];
    assert.equal(question?.source, 'ai_variant');
    assert.equal(question?.type, 'multi');
    assert.notEqual(question?.stem, '待变异的原题干');
    assert.notEqual(question?.stem, '不应带入的错题');
    assert.match(question?.stem ?? '', /待变异|变异/);
    assert.equal(JSON.stringify(paper).includes('VARIANT_ANALYSIS_SENTINEL'), false);

    const revived = await runQuizGeneration(createPgExecutor(pool), pending.id, { mode: 'mock' });
    assert.equal(revived.status, 'skipped');

    const stored = await storedQuestions(pending.id);
    const only = stored[0];
    assert.ok(only);
    await saveSelection(pending.id, only.id, only.answer);
    const submitted = await call(`/quiz/sessions/${pending.id}/submit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(submitted.status, 200);
    const original = await pool.query<{ status: string }>(
      `SELECT status FROM wrong_items WHERE id = $1`,
      [wrongId],
    );
    assert.equal(original.rows[0]?.status, 'pending');
    const cloned = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM wrong_items WHERE user_id = $1 AND question_snapshot->>'stem' = $2`,
      [ctx.userA, only.stem],
    );
    assert.equal(cloned.rows[0]?.count, 0);
    const scores = await call('/quiz/sessions', ctx.tokenA);
    const score = ((scores.body as { items?: { id: string; source?: string }[] }).items ?? []).find(
      (item) => item.id === pending.id,
    );
    assert.equal(score?.source, 'variant');

    const failed = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, wrongId)),
    });
    const failedId = (failed.body as unknown as QuizSessionView).id;
    const broken = await runQuizGeneration(createPgExecutor(pool), failedId, {
      mode: 'live',
      provider: 'deepseek',
      apiKey: 'test',
      baseUrl: 'http://127.0.0.1',
      completeAi: async () => ({
        questions: [
          {
            type: 'multi',
            stem: '待变异的原题干',
            options: [
              { id: 'A', text: '甲' },
              { id: 'B', text: '乙' },
              { id: 'C', text: '丙' },
            ],
            answer: ['A', 'B'],
            analysis: '新解析',
            score: 1,
            knowledgePointId: fixture.kp1,
          },
        ],
      }),
    });
    assert.equal(broken.status, 'failed');
    if (broken.status === 'failed') {
      assert.equal(broken.code, ApiErrorCode.LLM_INVALID_OUTPUT);
    }
    const again = await runQuizGeneration(createPgExecutor(pool), failedId, { mode: 'mock' });
    assert.equal(again.status, 'failed');
    const retry = await call('/quiz/sessions', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify(variantPayload(ctx.packId, wrongId)),
    });
    const retryId = (retry.body as unknown as QuizSessionView).id;
    assert.notEqual(retryId, failedId);
    const retried = await runQuizGeneration(createPgExecutor(pool), retryId, { mode: 'mock' });
    assert.equal(retried.status, 'ready');
  });

  test('变异 Prompt 使用证书覆盖，用户提示不含原题解析', async (t) => {
    if (!ready(t)) return;
    const pool = requiredPool();
    const fixture = requiredFixture();
    await pool.query(`DELETE FROM wrong_items WHERE user_id = $1`, [ctx.userA]);
    const wrongId = await insertWrong({
      certId: fixture.certId,
      kpIds: [fixture.kp1],
      stem: '证书覆盖原题干',
      analysis: 'VARIANT_ANALYSIS_SENTINEL',
    });
    const promptId = randomUUID();
    await pool.query(
      `
        INSERT INTO prompt_templates (id, scope, scope_ref_id, templates, variables, version, status)
        VALUES ($1, 'certificate', $2, $3::jsonb, '[]'::jsonb, 1, 'published')
      `,
      [
        promptId,
        fixture.certId,
        JSON.stringify({
          system: 'CERT_VARIANT_MARKER',
          user: '普通出题不会被变异读取',
          variant: {
            system: 'CERT_VARIANT_MARKER',
            user: '证书覆盖变异 {{originalStem}}',
          },
        }),
      ],
    );
    try {
      const created = await call('/quiz/sessions', ctx.tokenA, {
        method: 'POST',
        body: JSON.stringify(variantPayload(ctx.packId, wrongId)),
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const sessionId = (created.body as unknown as QuizSessionView).id;
      let captured = { system: '', user: '' };
      const outcome = await runQuizGeneration(createPgExecutor(pool), sessionId, {
        mode: 'live',
        provider: 'deepseek',
        apiKey: 'test',
        baseUrl: 'http://127.0.0.1',
        completeAi: async (prompt) => {
          captured = prompt;
          return {
            questions: [
              {
                type: 'judge',
                stem: `证书覆盖后的新题干 ${sessionId.slice(0, 8)}`,
                options: [
                  { id: 'T', text: '正确' },
                  { id: 'F', text: '错误' },
                ],
                answer: ['T'],
                analysis: '新解析',
                score: 1,
                knowledgePointId: fixture.kp1,
              },
            ],
          };
        },
      });
      assert.equal(outcome.status, 'ready');
      assert.match(captured.system, /CERT_VARIANT_MARKER/);
      assert.match(captured.system, /不得检索或引用教材全文/);
      assert.match(captured.user, /证书覆盖变异 证书覆盖原题干/);
      assert.equal(captured.user.includes('VARIANT_ANALYSIS_SENTINEL'), false);
      assert.equal(captured.user.includes('普通出题不会被变异读取'), false);
    } finally {
      await pool.query('DELETE FROM prompt_templates WHERE id = $1', [promptId]);
    }
  });
});

const MOCK_ANALYSIS = '这是本地 mock 题目，没有调用模型。';

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过出题集成测试');
    return false;
  }
  return true;
}

function payload(packId: string, extra?: Record<string, unknown>): Record<string, unknown> {
  return {
    packId,
    count: 10,
    difficulty: 'medium',
    types: ['single', 'multi', 'judge'],
    timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
    mode: 'practice',
    ...extra,
  };
}

function variantPayload(
  packId: string,
  wrongItemId: string,
  extra?: Record<string, unknown>,
): Record<string, unknown> {
  return payload(packId, {
    source: 'variant',
    count: 1,
    mode: 'practice',
    timer: { enabled: false },
    wrongItemId,
    ...extra,
  });
}

function requiredFixture(): Fixture {
  if (!ctx.fixture) {
    throw new Error('测试证书没有准备好');
  }
  return ctx.fixture;
}

async function insertWrong(input: {
  userId?: string;
  certId: string;
  kpIds: string[];
  stem: string;
  status?: string;
  analysis?: string;
}): Promise<string> {
  const id = randomUUID();
  await requiredPool().query(
    `
      INSERT INTO wrong_items (id, user_id, cert_id, kp_ids, question_snapshot, status, wrong_count)
      VALUES ($1, $2, $3, $4::uuid[], $5::jsonb, $6, 1)
    `,
    [
      id,
      input.userId ?? ctx.userA,
      input.certId,
      input.kpIds,
      JSON.stringify({
        type: 'single',
        stem: input.stem,
        options: [
          { id: 'A', text: '甲' },
          { id: 'B', text: '乙' },
        ],
        answer: ['A'],
        analysis: input.analysis ?? '选甲',
        score: 4,
      }),
      input.status ?? 'pending',
    ],
  );
  return id;
}

async function packBinding(packId: string): Promise<{ active: boolean | null; points: string[] }> {
  const points = await requiredPool().query<{ knowledge_point_id: string }>(
    `
      SELECT knowledge_point_id
      FROM pack_knowledge_points
      WHERE pack_id = $1
      ORDER BY position
    `,
    [packId],
  );
  const pack = await requiredPool().query<{ active: boolean }>(
    `SELECT active FROM packs WHERE id = $1`,
    [packId],
  );
  return {
    active: pack.rows[0]?.active ?? null,
    points: points.rows.map((row) => row.knowledge_point_id),
  };
}

async function sessionRow(id: string): Promise<
  | {
      source: string;
      mode: string;
      question_count: number;
      knowledge_point_ids: string[] | null;
      wrong_item_id: string | null;
    }
  | undefined
> {
  const result = await requiredPool().query<{
    source: string;
    mode: string;
    question_count: number;
    knowledge_point_ids: string[] | null;
    wrong_item_id: string | null;
  }>(
    `
      SELECT source, mode, question_count, knowledge_point_ids, wrong_item_id
      FROM quiz_sessions
      WHERE id = $1
    `,
    [id],
  );
  return result.rows[0];
}

async function createSession(
  packId: string,
  extra?: Record<string, unknown>,
): Promise<QuizSessionView> {
  const response = await call('/quiz/sessions', ctx.tokenA, {
    method: 'POST',
    body: JSON.stringify(payload(packId, extra)),
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
  extra?: Record<string, unknown>,
): Promise<QuizSessionView & { questions: QuizQuestionView[] }> {
  const created = await createSession(packId, extra);
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

async function saveSelection(
  sessionId: string,
  questionId: string,
  selected: string[],
): Promise<void> {
  const response = await call(`/quiz/sessions/${sessionId}/answers`, ctx.tokenA, {
    method: 'POST',
    body: JSON.stringify({ questionId, selected }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
}

async function storedQuestions(sessionId: string): Promise<
  {
    id: string;
    type_code: string;
    stem: string;
    answer: string[];
    score: number;
    source: string;
    kp_ids: string[];
    options: { id: string; text: string }[];
  }[]
> {
  const result = await requiredPool().query<{
    id: string;
    type_code: string;
    stem: string;
    answer: unknown;
    score: number | string;
    source: string;
    kp_ids: string[] | null;
    options: unknown;
  }>(
    `
      SELECT id, type_code, stem, answer, score, source, kp_ids, options
      FROM paper_questions
      WHERE session_id = $1
      ORDER BY ordinal
    `,
    [sessionId],
  );
  return result.rows.map((row) => ({
    id: row.id,
    type_code: row.type_code,
    stem: row.stem,
    answer: Array.isArray(row.answer)
      ? row.answer.filter((item): item is string => typeof item === 'string')
      : [],
    score: Number(row.score),
    source: row.source,
    kp_ids: row.kp_ids ?? [],
    options: Array.isArray(row.options)
      ? row.options.flatMap((item) => {
          if (!item || typeof item !== 'object' || !('id' in item) || !('text' in item)) {
            return [];
          }
          const id = (item as { id: unknown }).id;
          const text = (item as { text: unknown }).text;
          return typeof id === 'string' && typeof text === 'string' ? [{ id, text }] : [];
        })
      : [],
  }));
}

async function wrongCount(userId: string): Promise<number> {
  const result = await requiredPool().query<{ count: number }>(
    `SELECT count(*)::int AS count FROM wrong_items WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0]?.count ?? 0;
}

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('测试数据库不可用');
  }
  return ctx.pool;
}

const READABLE_SCORE = {
  earnedScore: 80,
  totalScore: 100,
  correctCount: 8,
  wrongCount: 2,
  unansweredCount: 0,
  partialCount: 0,
  questionCount: 10,
  accuracy: 0.8,
  scoreRate: 0.8,
  passed: true,
  passScore: 60,
  reason: 'manual',
};

async function insertScoreRows(
  userId: string,
  rows: {
    id: string;
    submittedAt: string;
    status?: string;
    pass?: Record<string, unknown> | null;
    reason?: string | null;
  }[],
): Promise<void> {
  if (rows.length === 0) {
    return;
  }
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const status = row.status ?? 'submitted';
    const offset = values.length;
    values.push(
      row.id,
      userId,
      JSON.stringify({ name: '截断包', certName: '截断证书' }),
      status === 'submitted' ? 80 : null,
      row.pass === null ? null : JSON.stringify(row.pass ?? READABLE_SCORE),
      status,
      row.reason === undefined ? 'manual' : row.reason,
      row.submittedAt,
    );
    return `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, 'practice', $${offset + 4}, $${offset + 5}::jsonb, $${offset + 6}, 'normal', $${offset + 7}, $${offset + 8}, $${offset + 8})`;
  });
  await requiredPool().query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_snapshot, mode, score, pass_snapshot, status, source,
        submit_reason, submitted_at, created_at
      )
      VALUES ${tuples.join(', ')}
    `,
    values,
  );
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
