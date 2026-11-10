import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  businessDate,
  dailyPlanPercent,
  dailyPlanWeek,
  type DailyPlanView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { DailyPlanRepository } from './daily-plan.repository';
import { readDailyPlanMetrics, resetDailyPlanMetrics } from './daily-plan.metrics';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

interface Fixture {
  domainId: string;
  certId: string;
  offlineCertId: string;
  textbookId: string;
  kp1: string;
  kp2: string;
  kp3: string;
  kpOffline: string;
  kpGroup: string;
  kpOther: string;
}

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  fixture?: Fixture;
  userIds: string[];
} = {
  ready: false,
  base: '',
  userIds: [],
};

describe('daily plan', { concurrency: 1 }, () => {
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
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.fixture) {
      if (ctx.userIds.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
          .catch(() => undefined);
      }
      await pool
        .query('DELETE FROM knowledge_points WHERE textbook_id = $1 OR id = $2', [
          ctx.fixture.textbookId,
          ctx.fixture.kpOther,
        ])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = $1', [ctx.fixture.textbookId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE domain_id = $1', [ctx.fixture.domainId])
        .catch(() => undefined);
      await pool.query('DELETE FROM domains WHERE id = $1', [ctx.fixture.domainId]).catch(() => undefined);
    }
    await ctx.app?.close();
    await ctx.pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('未登录不能读每日计划', async (t) => {
    if (!ready(t)) {
      return;
    }
    const response = await call('/me/daily-plan');
    assert.equal(response.status, 401);
  });

  test('0 个包是空态，忽略 ?date=', async (t) => {
    if (!ready(t)) {
      return;
    }
    const user = await login('daily-empty');
    const response = await call('/me/daily-plan?date=1999-01-01', user.token);
    assert.equal(response.status, 200);
    const body = response.body as unknown as DailyPlanView;
    assert.equal(body.businessDate, businessDate());
    assert.equal(body.weekStartsOn, 'monday');
    assert.equal(body.empty, true);
    assert.equal(body.activePackId, null);
    assert.equal(body.activePack, null);
    assert.deepEqual(body.packs, []);
    assert.deepEqual(body.summary, {
      availablePackCount: 0,
      completedCount: 0,
      totalCount: 0,
      remainingCount: 0,
      percent: 0,
    });
    assert.equal(body.week.length, 7);
    assert.deepEqual(
      body.week.map((day) => ({ date: day.date, weekday: day.weekday })),
      dailyPlanWeek(body.businessDate),
    );
    assert.equal(
      body.week.every((day) => day.hasCompletion === false),
      true,
    );
  });

  test('单包计数、待练优先，签到不点亮周条', async (t) => {
    if (!ready(t)) {
      return;
    }
    const fixture = requiredFixture();
    const user = await login('daily-one');
    const packId = await insertPack(user.user.id, fixture.certId, '单包', true, [
      fixture.kp2,
      fixture.kp3,
      fixture.kp1,
      fixture.kpOffline,
      fixture.kpGroup,
    ]);
    const today = businessDate();
    const week = dailyPlanWeek(today);
    const other = week.find((day) => day.date !== today)?.date ?? today;
    const quiet = week.find((day) => day.date !== today && day.date !== other)?.date ?? today;
    await insertCompletion(user.user.id, today, packId, fixture.kp1);
    await insertCompletion(user.user.id, today, packId, fixture.kpOffline);
    await insertCompletion(user.user.id, other, packId, fixture.kp2);
    await ctx.pool?.query(
      `
        INSERT INTO growth_task_states (user_id, business_date, checkin_done)
        VALUES ($1, $2::date, true)
        ON CONFLICT (user_id, business_date)
        DO UPDATE SET checkin_done = true
      `,
      [user.user.id, quiet],
    );

    const response = await call('/me/daily-plan', user.token);
    assert.equal(response.status, 200);
    const body = response.body as unknown as DailyPlanView;
    assert.equal(body.empty, false);
    assert.equal(body.activePackId, packId);
    assert.equal(body.summary.availablePackCount, 1);
    assert.equal(body.summary.totalCount, 3);
    assert.equal(body.summary.completedCount, 1);
    assert.equal(body.summary.remainingCount, 2);
    assert.equal(body.summary.percent, 33);
    assert.equal(body.summary.percent, dailyPlanPercent(1, 3));
    const active = body.activePack;
    assert.ok(active);
    assert.equal(active.knowledgePointCount, 3);
    assert.equal(active.completedCount, 1);
    assert.equal(active.percent, 33);
    assert.deepEqual(
      active.items.map((item) => item.knowledgePointId),
      [fixture.kp2, fixture.kp3, fixture.kp1],
    );
    assert.deepEqual(
      active.items.map((item) => item.done),
      [false, false, true],
    );
    assert.equal(active.items[2]?.completedAt?.includes('T'), true);
    assert.equal(body.packs.length, 1);
    const todayMark = body.week.find((day) => day.date === today);
    const otherMark = body.week.find((day) => day.date === other);
    const quietMark = body.week.find((day) => day.date === quiet);
    assert.equal(todayMark?.hasCompletion, true);
    assert.equal(otherMark?.hasCompletion, true);
    assert.equal(quietMark?.hasCompletion, false);
  });

  test('多包汇总只计入可用包，不可用包仍出现在芯片', async (t) => {
    if (!ready(t)) {
      return;
    }
    const fixture = requiredFixture();
    const user = await login('daily-many');
    const hidden = await insertPack(user.user.id, fixture.offlineCertId, '下架包', false, [
      fixture.kp1,
      fixture.kp2,
    ]);
    const second = await insertPack(user.user.id, fixture.certId, '第二包', false, [fixture.kp1]);
    const active = await insertPack(user.user.id, fixture.certId, '当前包', true, [
      fixture.kp1,
      fixture.kp2,
      fixture.kp3,
    ]);
    const today = businessDate();
    await insertCompletion(user.user.id, today, active, fixture.kp1);
    await insertCompletion(user.user.id, today, hidden, fixture.kp1);
    await insertCompletion(user.user.id, today, hidden, fixture.kp2);

    const response = await call('/me/daily-plan', user.token);
    assert.equal(response.status, 200);
    const body = response.body as unknown as DailyPlanView;
    assert.equal(body.empty, false);
    assert.equal(body.activePackId, active);
    assert.equal(body.summary.availablePackCount, 2);
    assert.equal(body.summary.totalCount, 4);
    assert.equal(body.summary.completedCount, 1);
    assert.equal(body.summary.remainingCount, 3);
    assert.equal(body.summary.percent, dailyPlanPercent(1, 4));
    assert.equal(body.packs.length, 3);
    const unavailable = body.packs.find((pack) => pack.packId === hidden);
    assert.equal(unavailable?.unavailable, true);
    assert.equal(unavailable?.knowledgePointCount, 2);
    assert.equal(unavailable?.completedCount, 2);
    assert.equal(body.packs.find((pack) => pack.packId === second)?.completedCount, 0);
    assert.equal(body.activePack?.items.length, 3);
    assert.equal(body.packs.some((pack) => pack.packId === second), true);
  });

  test('normal+practice 按试卷并集写入，重复交卷保留首次', async (t) => {
    if (!ready(t)) {
      return;
    }
    resetDailyPlanMetrics();
    const fixture = requiredFixture();
    const user = await login('daily-write');
    const packId = await insertPack(user.user.id, fixture.certId, '回写包', true, [
      fixture.kp1,
      fixture.kp2,
      fixture.kp3,
      fixture.kpOffline,
      fixture.kpGroup,
    ]);
    const sessionId = randomUUID();
    await insertSession({
      id: sessionId,
      userId: user.user.id,
      packId,
      mode: 'practice',
      source: 'normal',
      status: 'ready',
      requested: [fixture.kp3],
    });
    await insertQuestion(sessionId, 1, [fixture.kp1, fixture.kpOther]);
    await insertQuestion(sessionId, 2, [fixture.kp2]);
    await insertQuestion(sessionId, 3, [fixture.kpOffline]);
    await insertQuestion(sessionId, 4, [fixture.kpGroup]);
    await insertQuestion(sessionId, 5, []);

    const first = await call(`/quiz/sessions/${sessionId}/submit`, user.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const firstRows = await completionRows(user.user.id, packId);
    const ids = firstRows.map((row) => row.knowledge_point_id).sort();
    assert.deepEqual(ids, [fixture.kp1, fixture.kp2, fixture.kpOffline].sort());
    assert.equal(
      firstRows.every((row) => row.source_session_id === sessionId),
      true,
    );
    const firstStamp = firstRows.find((row) => row.knowledge_point_id === fixture.kp1)?.completed_at;
    assert.equal(readDailyPlanMetrics().daily_plan_upsert_success >= 1, true);

    const second = await call(`/quiz/sessions/${sessionId}/submit`, user.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(second.status, 200);
    const secondRows = await completionRows(user.user.id, packId);
    assert.equal(secondRows.length, firstRows.length);
    assert.equal(
      secondRows.find((row) => row.knowledge_point_id === fixture.kp1)?.completed_at.getTime(),
      firstStamp?.getTime(),
    );
    assert.equal(
      secondRows.find((row) => row.knowledge_point_id === fixture.kp1)?.source_session_id,
      sessionId,
    );

    const later = randomUUID();
    await insertSession({
      id: later,
      userId: user.user.id,
      packId,
      mode: 'practice',
      source: 'normal',
      status: 'ready',
      requested: [],
    });
    await insertQuestion(later, 1, [fixture.kp1]);
    const laterSubmit = await call(`/quiz/sessions/${later}/submit`, user.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(laterSubmit.status, 200);
    const afterLater = await completionRows(user.user.id, packId);
    assert.equal(
      afterLater.find((row) => row.knowledge_point_id === fixture.kp1)?.source_session_id,
      sessionId,
    );
  });

  test('exam、复练、变异、错题集和取消不写入', async (t) => {
    if (!ready(t)) {
      return;
    }
    resetDailyPlanMetrics();
    const fixture = requiredFixture();
    const user = await login('daily-skip');
    const packId = await insertPack(user.user.id, fixture.certId, '过滤包', true, [
      fixture.kp1,
      fixture.kp2,
      fixture.kp3,
    ]);
    const cases: Array<{ mode: 'practice' | 'exam'; source: string; kp: string }> = [
      { mode: 'exam', source: 'normal', kp: fixture.kp1 },
      { mode: 'practice', source: 'retrain_similar', kp: fixture.kp2 },
      { mode: 'practice', source: 'variant', kp: fixture.kp3 },
      { mode: 'practice', source: 'wrongSet', kp: fixture.kp1 },
    ];
    for (const item of cases) {
      const id = randomUUID();
      await insertSession({
        id,
        userId: user.user.id,
        packId,
        mode: item.mode,
        source: item.source,
        status: 'ready',
        requested: [item.kp],
      });
      await insertQuestion(id, 1, [item.kp]);
      const response = await call(`/quiz/sessions/${id}/submit`, user.token, {
        method: 'POST',
        body: '{}',
      });
      assert.equal(response.status, 200, `${item.source}/${item.mode} ${JSON.stringify(response.body)}`);
    }
    const pending = randomUUID();
    await insertSession({
      id: pending,
      userId: user.user.id,
      packId,
      mode: 'practice',
      source: 'normal',
      status: 'pending',
      requested: [fixture.kp1],
    });
    const cancelled = await call(`/quiz/sessions/${pending}/cancel`, user.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(cancelled.status, 200);
    assert.deepEqual(await completionRows(user.user.id, packId), []);
    assert.equal(readDailyPlanMetrics().daily_plan_upsert_success, 0);
    assert.equal(readDailyPlanMetrics().daily_plan_upsert_fail, 0);
  });

  test('回写失败时交卷仍然成功', async (t) => {
    if (!ready(t) || !ctx.app) {
      return;
    }
    resetDailyPlanMetrics();
    const fixture = requiredFixture();
    const user = await login('daily-fail');
    const packId = await insertPack(user.user.id, fixture.certId, '失败包', true, [fixture.kp1]);
    const sessionId = randomUUID();
    await insertSession({
      id: sessionId,
      userId: user.user.id,
      packId,
      mode: 'practice',
      source: 'normal',
      status: 'ready',
      requested: [],
    });
    await insertQuestion(sessionId, 1, [fixture.kp1]);
    const repo = ctx.app.get(DailyPlanRepository);
    const original = repo.upsertCompletions.bind(repo);
    repo.upsertCompletions = async () => {
      throw new Error('boom-daily-plan');
    };
    const errors: string[] = [];
    const previous = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((item) => String(item)).join(' '));
    };
    try {
      const response = await call(`/quiz/sessions/${sessionId}/submit`, user.token, {
        method: 'POST',
        body: '{}',
      });
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const stored = await ctx.pool?.query<{ status: string }>(
        `SELECT status FROM quiz_sessions WHERE id = $1`,
        [sessionId],
      );
      assert.equal(stored?.rows[0]?.status, 'submitted');
      assert.deepEqual(await completionRows(user.user.id, packId), []);
      assert.equal(readDailyPlanMetrics().daily_plan_upsert_fail, 1);
      const line = errors.find((item) => item.includes('daily-plan upsert failed'));
      assert.ok(line);
      assert.match(line, new RegExp(`userId=${user.user.id}`));
      assert.match(line, new RegExp(`sessionId=${sessionId}`));
      assert.match(line, /businessDate=\d{4}-\d{2}-\d{2}/);
      assert.match(line, new RegExp(`packId=${packId}`));
      assert.match(line, /coveredKp=1/);
      assert.match(line, /boom-daily-plan/);
    } finally {
      console.error = previous;
      repo.upsertCompletions = original;
    }
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过每日计划集成测试');
    return false;
  }
  return true;
}

function requiredFixture(): Fixture {
  if (!ctx.fixture || !ctx.pool) {
    throw new Error('夹具未就绪');
  }
  return ctx.fixture;
}

async function login(code: string): Promise<WechatLoginResponse> {
  const response = await call('/auth/wechat/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ code: `${code}-${randomUUID()}`, nick: code }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as unknown as WechatLoginResponse;
  ctx.userIds.push(body.user.id);
  return body;
}

async function insertPack(
  userId: string,
  certId: string,
  name: string,
  active: boolean,
  knowledgePointIds: string[],
): Promise<string> {
  const fixture = requiredFixture();
  const id = randomUUID();
  if (active) {
    await ctx.pool?.query(`UPDATE packs SET active = false WHERE user_id = $1 AND active = true`, [
      userId,
    ]);
  }
  await ctx.pool?.query(
    `
      INSERT INTO packs (id, user_id, domain_id, cert_id, name, active)
      VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, userId, fixture.domainId, certId, name, active],
  );
  if (knowledgePointIds.length > 0) {
    await ctx.pool?.query(
      `
        INSERT INTO pack_knowledge_points (pack_id, knowledge_point_id, position)
        SELECT $1, item.id, item.ordinal::integer
        FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, ordinal)
      `,
      [id, knowledgePointIds],
    );
  }
  return id;
}

async function insertCompletion(
  userId: string,
  day: string,
  packId: string,
  knowledgePointId: string,
): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO daily_plan_item_completions (
        user_id, business_date, pack_id, knowledge_point_id, completed_at
      )
      VALUES ($1, $2::date, $3, $4, now())
    `,
    [userId, day, packId, knowledgePointId],
  );
}

async function insertSession(input: {
  id: string;
  userId: string;
  packId: string;
  mode: string;
  source: string;
  status: string;
  requested: string[];
}): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_id, pack_snapshot, mode, settings, status, source,
        question_count, generated_count, knowledge_point_ids, started_at
      )
      VALUES (
        $1, $2, $3, '{}'::jsonb, $4, '{}'::jsonb, $5, $6,
        1, 1, $7::uuid[], now()
      )
    `,
    [
      input.id,
      input.userId,
      input.packId,
      input.mode,
      input.status,
      input.source,
      input.requested,
    ],
  );
}

async function insertQuestion(sessionId: string, ordinal: number, kpIds: string[]): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO paper_questions (
        id, session_id, ordinal, type_code, stem, options, answer, analysis, kp_ids, source, score
      )
      VALUES (
        $1, $2, $3, 'single', $4, '[{"id":"A","text":"甲"}]'::jsonb, '["A"]'::jsonb,
        '解析', $5::uuid[], 'ai', 1
      )
    `,
    [randomUUID(), sessionId, ordinal, `题干${ordinal}`, kpIds],
  );
}

async function completionRows(
  userId: string,
  packId: string,
): Promise<Array<{ knowledge_point_id: string; completed_at: Date; source_session_id: string | null }>> {
  const result = await ctx.pool?.query<{
    knowledge_point_id: string;
    completed_at: Date;
    source_session_id: string | null;
  }>(
    `
      SELECT knowledge_point_id, completed_at, source_session_id
      FROM daily_plan_item_completions
      WHERE user_id = $1 AND pack_id = $2
      ORDER BY knowledge_point_id
    `,
    [userId, packId],
  );
  return result?.rows ?? [];
}

async function insertFixture(pool: Pool): Promise<Fixture> {
  const fixture: Fixture = {
    domainId: randomUUID(),
    certId: randomUUID(),
    offlineCertId: randomUUID(),
    textbookId: randomUUID(),
    kp1: randomUUID(),
    kp2: randomUUID(),
    kp3: randomUUID(),
    kpOffline: randomUUID(),
    kpGroup: randomUUID(),
    kpOther: randomUUID(),
  };
  const suffix = fixture.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '每日领域', 'online', 80)`,
    [fixture.domainId, `dp-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $3, $4, '每日证书', 'online', 100, 60, ARRAY['single']::text[], 1),
        ($2, $3, $5, '下架证书', 'offline', 100, 60, ARRAY['single']::text[], 2)
    `,
    [fixture.certId, fixture.offlineCertId, fixture.domainId, `dp-cert-${suffix}`, `dp-off-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbooks (id, code, name, status, sort_order) VALUES ($1, $2, '每日教材', 'online', 1)`,
    [fixture.textbookId, `dp-book-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbook_certificates (textbook_id, certificate_id) VALUES ($1, $2), ($1, $3)`,
    [fixture.textbookId, fixture.certId, fixture.offlineCertId],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES
        ($1, $7, NULL, $8, '知识点甲', 'knowledge_point', '提示', 1, 'online', 1),
        ($2, $7, NULL, $9, '知识点乙', 'knowledge_point', '提示', 1, 'online', 2),
        ($3, $7, NULL, $10, '知识点丙', 'knowledge_point', '提示', 1, 'online', 3),
        ($4, $7, NULL, $11, '下架知识点', 'knowledge_point', '提示', 1, 'offline', 4),
        ($5, $7, NULL, $12, '分组', 'group', NULL, 1, 'online', 5),
        ($6, NULL, NULL, $13, '包外知识点', 'knowledge_point', '提示', 1, 'online', 1)
    `,
    [
      fixture.kp1,
      fixture.kp2,
      fixture.kp3,
      fixture.kpOffline,
      fixture.kpGroup,
      fixture.kpOther,
      fixture.textbookId,
      `dp-kp1-${suffix}`,
      `dp-kp2-${suffix}`,
      `dp-kp3-${suffix}`,
      `dp-kpoff-${suffix}`,
      `dp-group-${suffix}`,
      `dp-other-${suffix}`,
    ],
  );
  return fixture;
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
