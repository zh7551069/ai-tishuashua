import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type AdminCertificateLinkDetail,
  type AdminCertificateLinkList,
  type AdminScoreDetail,
  type AdminScoreList,
  type CertificateQueryList,
  type QuizScoreList,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'certificates-admin';
const PASSWORD = 'certificates-secret';
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
  'RATE_LIMIT_PUBLIC_MAX',
] as const;

const savedEnv = new Map<string, string | undefined>();
const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  suffix: string;
  domain1: string;
  domain2: string;
  certA: string;
  certB: string;
  certC: string;
  userA: string;
  userB: string;
  tokenA: string;
  tokenB: string;
  packA: string;
  packC: string;
  scoreNew: string;
  scoreBad: string;
  scoreProgress: string;
  scoreB: string;
  scoreFallback: string;
  scoreOrphan: string;
  atNew: string;
  atBad: string;
  atUpload: string;
  atScoreB: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  domain1: '',
  domain2: '',
  certA: '',
  certB: '',
  certC: '',
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
  packA: '',
  packC: '',
  scoreNew: '',
  scoreBad: '',
  scoreProgress: '',
  scoreB: '',
  scoreFallback: '',
  scoreOrphan: '',
  atNew: '',
  atBad: '',
  atUpload: '',
  atScoreB: '',
};

describe('admin certificates and scores', { concurrency: 1 }, () => {
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
    process.env.RATE_LIMIT_PUBLIC_MAX = '100000';

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
    if (pool) {
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
      }
      const domains = [ctx.domain1, ctx.domain2].filter(Boolean);
      if (domains.length > 0) {
        await pool
          .query('DELETE FROM certificates WHERE domain_id = ANY($1::uuid[])', [domains])
          .catch(() => undefined);
        await pool
          .query('DELETE FROM domains WHERE id = ANY($1::uuid[])', [domains])
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

  test('没有后管会话或拿微信 token 不能看全站关联和成绩', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missingLinks = await call('/admin/certificate-links');
    assert.equal(missingLinks.status, 401);
    assert.equal(missingLinks.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechatScores = await call('/admin/scores', { token: ctx.tokenA });
    assert.equal(wechatScores.status, 401);
    assert.equal(wechatScores.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechatDetail = await call(`/admin/scores/${ctx.scoreNew}`, { token: ctx.tokenB });
    assert.equal(wechatDetail.status, 401);

    const wechatLink = await call(`/admin/certificate-links/${ctx.userA}/${ctx.certA}`, {
      token: ctx.tokenA,
    });
    assert.equal(wechatLink.status, 401);

    const admin = await adminToken();
    const crossedCertificates = await call('/certificates', { token: admin });
    assert.equal(crossedCertificates.status, 401);
    const crossedScores = await call('/quiz/sessions', { token: admin });
    assert.equal(crossedScores.status, 401);
    assert.equal(crossedScores.body.code, ApiErrorCode.UNAUTHORIZED);
  });

  test('成绩占位仍然不要求登录，也不是交卷成绩', async (t) => {
    if (!ready(t)) {
      return;
    }
    const placeholder = await call('/certificates/scores');
    assert.equal(placeholder.status, 200);
    assert.equal(placeholder.body.implemented, false);
    assert.equal(placeholder.body.module, 'certificate');
    assert.equal(placeholder.body.action, 'scores');
  });

  test('后管可以按用户、证书、领域和时间分页查看关联', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const byOwner = await call(`/admin/certificate-links?userId=${ctx.userA}`, { token: admin });
    assert.equal(byOwner.status, 200);
    const owner = byOwner.body as unknown as AdminCertificateLinkList;
    assert.equal(owner.page, 1);
    assert.equal(owner.pageSize, 20);
    assert.equal(owner.total, 2);
    assert.deepEqual(
      owner.items.map((item) => item.id),
      [ctx.certA, ctx.certB],
    );
    assert.equal(owner.items[0]?.userNick, '关联甲');
    assert.equal(owner.items[0]?.packCount, 1);
    assert.equal(owner.items[0]?.activePackId, ctx.packA);
    assert.equal(owner.items[0]?.pendingWrongCount, 1);
    assert.equal(owner.items[0]?.submittedCount, 2);
    assert.equal(owner.items[0]?.uploadCount, 0);
    assert.equal(owner.items[0]?.latestScore?.sessionId, ctx.scoreNew);
    assert.equal(owner.items[0]?.latestScore?.earnedScore, 80);
    assert.equal('packTouchedAt' in (owner.items[0] ?? {}), false);

    const offline = owner.items[1];
    assert.equal(offline?.status, 'offline');
    assert.equal(offline?.unavailable, true);
    assert.equal(offline?.passScore, null);
    assert.equal(offline?.uploadCount, 1);
    assert.equal(offline?.latestScore, null);

    const byCert = await call(`/admin/certificate-links?certId=${ctx.certB}`, { token: admin });
    const certList = byCert.body as unknown as AdminCertificateLinkList;
    assert.equal(certList.total, 2);
    assert.deepEqual(
      certList.items.map((item) => item.userId),
      [ctx.userA, ctx.userB],
    );
    assert.equal(certList.items[1]?.userNick, null);

    const byDomain = await call(`/admin/certificate-links?domainId=${ctx.domain2}`, {
      token: admin,
    });
    const domainList = byDomain.body as unknown as AdminCertificateLinkList;
    assert.equal(domainList.total, 1);
    assert.equal(domainList.items[0]?.userId, ctx.userB);
    assert.equal(domainList.items[0]?.id, ctx.certC);
    assert.equal(domainList.items[0]?.name, '证书丙');

    const from = new Date(Date.parse(ctx.atNew) - 30_000).toISOString();
    const to = new Date(Date.parse(ctx.atNew) + 30_000).toISOString();
    const byTime = await call(
      `/admin/certificate-links?userId=${ctx.userA}&touchedFrom=${encodeURIComponent(from)}&touchedTo=${encodeURIComponent(to)}`,
      { token: admin },
    );
    const timeList = byTime.body as unknown as AdminCertificateLinkList;
    assert.equal(timeList.total, 1);
    assert.equal(timeList.items[0]?.id, ctx.certA);

    const page = await call(`/admin/certificate-links?userId=${ctx.userA}&page=2&pageSize=1`, {
      token: admin,
    });
    const pageList = page.body as unknown as AdminCertificateLinkList;
    assert.equal(pageList.total, 2);
    assert.equal(pageList.page, 2);
    assert.equal(pageList.pageSize, 1);
    assert.equal(pageList.items[0]?.id, ctx.certB);

    const beyond = await call(`/admin/certificate-links?userId=${ctx.userA}&page=9`, {
      token: admin,
    });
    const beyondList = beyond.body as unknown as AdminCertificateLinkList;
    assert.equal(beyondList.total, 2);
    assert.deepEqual(beyondList.items, []);

    const empty = await call(`/admin/certificate-links?userId=${randomUUID()}`, { token: admin });
    const emptyList = empty.body as unknown as AdminCertificateLinkList;
    assert.equal(empty.status, 200);
    assert.equal(emptyList.total, 0);
    assert.deepEqual(emptyList.items, []);
  });

  test('关联详情只读，并和小程序证书卡对得上', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const detail = await call(`/admin/certificate-links/${ctx.userA}/${ctx.certA}`, {
      token: admin,
    });
    assert.equal(detail.status, 200);
    const link = detail.body as unknown as AdminCertificateLinkDetail;
    assert.equal(link.domainName, '成绩领域');
    assert.equal(link.extraConstraint, '简体中文');
    assert.deepEqual(link.enabledQuestionTypeCodes, ['single', 'multi']);
    assert.equal(link.totalScore, 100);
    assert.equal(link.passScore, 60);
    assert.equal(link.unavailable, false);
    assert.ok(link.packTouchedAt);
    assert.ok(link.wrongTouchedAt);
    assert.equal(link.uploadTouchedAt, null);
    assert.ok(link.submittedTouchedAt);
    assert.equal(link.latestScore?.passed, true);

    const mini = await call('/certificates', { token: ctx.tokenA });
    assert.equal(mini.status, 200);
    const cards = mini.body as unknown as CertificateQueryList;
    assert.deepEqual(
      cards.items.map((item) => item.id),
      [ctx.certA, ctx.certB],
    );
    const card = cards.items[0];
    assert.equal(card?.packCount, link.packCount);
    assert.equal(card?.submittedCount, link.submittedCount);
    assert.equal(card?.pendingWrongCount, link.pendingWrongCount);
    assert.equal(card?.latestScore?.sessionId, link.latestScore?.sessionId);
    assert.equal(card?.latestScore?.earnedScore, link.latestScore?.earnedScore);
    assert.equal(
      cards.items.some((item) => item.id === ctx.certC),
      false,
    );

    const uploadOnly = await call(`/admin/certificate-links/${ctx.userA}/${ctx.certB}`, {
      token: admin,
    });
    const uploadLink = uploadOnly.body as unknown as AdminCertificateLinkDetail;
    assert.equal(uploadLink.uploadCount, 1);
    assert.ok(uploadLink.uploadTouchedAt);
    assert.equal(uploadLink.packTouchedAt, null);
    assert.equal(uploadLink.submittedTouchedAt, null);

    const missing = await call(`/admin/certificate-links/${ctx.userA}/${ctx.certC}`, {
      token: admin,
    });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const notUuid = await call(`/admin/certificate-links/${ctx.userA}/not-a-uuid`, {
      token: admin,
    });
    assert.equal(notUuid.status, 400);

    const before = await ctx.pool?.query<{ pass_score: number }>(
      'SELECT pass_score FROM certificates WHERE id = $1',
      [ctx.certA],
    );
    const write = await call(`/admin/certificate-links/${ctx.userA}/${ctx.certA}`, {
      method: 'PUT',
      token: admin,
      body: { passScore: 0 },
    });
    assert.equal(write.status, 404);
    const after = await ctx.pool?.query<{ pass_score: number }>(
      'SELECT pass_score FROM certificates WHERE id = $1',
      [ctx.certA],
    );
    assert.equal(before?.rows[0]?.pass_score, 60);
    assert.equal(after?.rows[0]?.pass_score, 60);
  });

  test('后管可以分页查看全站已交卷，并按用户、证书、领域、模式和时间筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const byOwner = await call(`/admin/scores?userId=${ctx.userA}`, { token: admin });
    assert.equal(byOwner.status, 200);
    const owner = byOwner.body as unknown as AdminScoreList;
    assert.equal(owner.total, 2);
    assert.equal(owner.page, 1);
    assert.equal(owner.pageSize, 20);
    assert.deepEqual(
      owner.items.map((item) => item.id),
      [ctx.scoreNew, ctx.scoreBad],
    );
    assert.equal(owner.items[0]?.readable, true);
    assert.equal(owner.items[0]?.earnedScore, 80);
    assert.equal(owner.items[0]?.certName, '成绩甲');
    assert.equal(owner.items[0]?.resolvedCertName, '证书甲');
    assert.equal(owner.items[0]?.packName, '甲包');
    assert.equal(owner.items[0]?.mode, 'exam');
    assert.equal(owner.items[0]?.userNick, '关联甲');
    assert.equal('wrongCount' in (owner.items[0] ?? {}), false);
    assert.equal('questions' in (owner.items[0] ?? {}), false);
    assert.equal(owner.items[1]?.readable, false);
    assert.equal(owner.items[1]?.earnedScore, null);
    assert.equal(owner.items[1]?.reason, 'manual');

    const byOther = await call(`/admin/scores?userId=${ctx.userB}`, { token: admin });
    const other = byOther.body as unknown as AdminScoreList;
    assert.equal(other.total, 3);
    assert.equal(other.items[0]?.id, ctx.scoreB);
    assert.equal(other.items[0]?.userNick, null);
    assert.equal(other.items[0]?.reason, 'timeout');
    assert.equal(other.items[2]?.id, ctx.scoreOrphan);
    assert.equal(other.items[2]?.certId, null);
    assert.equal(other.items[2]?.certName, '已删除证书');

    const byCert = await call(`/admin/scores?certId=${ctx.certC}`, { token: admin });
    const certList = byCert.body as unknown as AdminScoreList;
    assert.equal(certList.total, 1);
    assert.equal(certList.items[0]?.id, ctx.scoreFallback);
    assert.equal(certList.items[0]?.certName, '');
    assert.equal(certList.items[0]?.packName, '');
    assert.equal(certList.items[0]?.resolvedCertName, '证书丙');
    assert.equal(certList.items[0]?.domainName, '另一领域');

    const byDomain = await call(`/admin/scores?domainId=${ctx.domain2}&mode=practice`, {
      token: admin,
    });
    const domainList = byDomain.body as unknown as AdminScoreList;
    assert.equal(domainList.total, 1);
    assert.equal(domainList.items[0]?.id, ctx.scoreFallback);

    const exam = await call(`/admin/scores?userId=${ctx.userA}&mode=exam`, { token: admin });
    const examList = exam.body as unknown as AdminScoreList;
    assert.equal(examList.total, 1);
    assert.equal(examList.items[0]?.id, ctx.scoreNew);

    const from = new Date(Date.parse(ctx.atNew) - 30_000).toISOString();
    const to = new Date(Date.parse(ctx.atNew) + 30_000).toISOString();
    const byTime = await call(
      `/admin/scores?userId=${ctx.userA}&submittedFrom=${encodeURIComponent(from)}&submittedTo=${encodeURIComponent(to)}`,
      { token: admin },
    );
    const timeList = byTime.body as unknown as AdminScoreList;
    assert.equal(timeList.total, 1);
    assert.equal(timeList.items[0]?.id, ctx.scoreNew);

    const exact = await call(
      `/admin/scores?userId=${ctx.userB}&submittedFrom=${encodeURIComponent(ctx.atScoreB)}&submittedTo=${encodeURIComponent(ctx.atScoreB)}`,
      { token: admin },
    );
    const exactList = exact.body as unknown as AdminScoreList;
    assert.equal(exactList.total, 1);
    assert.equal(exactList.items[0]?.id, ctx.scoreB);

    const page = await call(`/admin/scores?userId=${ctx.userA}&page=2&pageSize=1`, {
      token: admin,
    });
    const pageList = page.body as unknown as AdminScoreList;
    assert.equal(pageList.total, 2);
    assert.equal(pageList.items[0]?.id, ctx.scoreBad);

    const none = await call(`/admin/scores?userId=${randomUUID()}`, { token: admin });
    const noneList = none.body as unknown as AdminScoreList;
    assert.equal(noneList.total, 0);
    assert.deepEqual(noneList.items, []);
  });

  test('成绩详情只读，小程序成绩列表仍然只看自己的可读交卷', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const detail = await call(`/admin/scores/${ctx.scoreNew}`, { token: admin });
    assert.equal(detail.status, 200);
    const score = detail.body as unknown as AdminScoreDetail;
    assert.equal(score.wrongCount, 1);
    assert.equal(score.unansweredCount, 1);
    assert.equal(score.partialCount, 0);
    assert.equal(score.correctCount, 8);
    assert.equal(score.questionCount, 10);
    assert.equal(score.accuracy, 0.8);
    assert.equal(score.scoreRate, 0.8);
    assert.equal(score.passed, true);
    assert.equal(score.passScore, 60);
    assert.equal(score.reason, 'manual');
    assert.ok(score.startedAt);
    assert.ok(score.createdAt);
    assert.equal('questions' in score, false);
    assert.equal('openId' in score, false);

    const mini = await call('/quiz/sessions', { token: ctx.tokenA });
    assert.equal(mini.status, 200);
    const own = mini.body as unknown as QuizScoreList;
    assert.equal(own.items.length, 1);
    assert.equal(own.items[0]?.id, ctx.scoreNew);
    assert.equal(own.items[0]?.earnedScore, score.earnedScore);
    assert.equal(own.items[0]?.certName, score.certName);
    assert.equal(own.items[0]?.packName, score.packName);
    assert.equal(own.items[0]?.accuracy, score.accuracy);
    assert.equal(own.items[0]?.reason, score.reason);

    const otherMini = await call('/quiz/sessions', { token: ctx.tokenB });
    const other = otherMini.body as unknown as QuizScoreList;
    assert.equal(other.items.length, 3);
    assert.equal(other.items[0]?.id, ctx.scoreB);
    assert.equal(other.items[0]?.reason, 'timeout');
    assert.equal(
      other.items.some((item) => item.id === ctx.scoreNew),
      false,
    );

    const unreadable = await call(`/admin/scores/${ctx.scoreBad}`, { token: admin });
    const bad = unreadable.body as unknown as AdminScoreDetail;
    assert.equal(bad.readable, false);
    assert.equal(bad.earnedScore, null);
    assert.equal(bad.wrongCount, null);

    const progress = await call(`/admin/scores/${ctx.scoreProgress}`, { token: admin });
    assert.equal(progress.status, 404);
    const missing = await call(`/admin/scores/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);
    const notUuid = await call('/admin/scores/not-a-uuid', { token: admin });
    assert.equal(notUuid.status, 400);

    const before = await ctx.pool?.query<{ pass_snapshot: { earnedScore?: number } }>(
      'SELECT pass_snapshot FROM quiz_sessions WHERE id = $1',
      [ctx.scoreNew],
    );
    const write = await call(`/admin/scores/${ctx.scoreNew}`, {
      method: 'PUT',
      token: admin,
      body: { earnedScore: 0 },
    });
    assert.equal(write.status, 404);
    const after = await ctx.pool?.query<{ pass_snapshot: { earnedScore?: number } }>(
      'SELECT pass_snapshot FROM quiz_sessions WHERE id = $1',
      [ctx.scoreNew],
    );
    assert.equal(before?.rows[0]?.pass_snapshot.earnedScore, 80);
    assert.equal(after?.rows[0]?.pass_snapshot.earnedScore, 80);
  });

  test('非法筛选返回 400', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const badUser = await call('/admin/certificate-links?userId=abc', { token: admin });
    assert.equal(badUser.status, 400);
    assert.equal(badUser.body.code, ApiErrorCode.VALIDATION_ERROR);

    const badRange = await call(
      '/admin/certificate-links?touchedFrom=2026-11-03T03:00:00.000Z&touchedTo=2026-11-03T01:00:00.000Z',
      { token: admin },
    );
    assert.equal(badRange.status, 400);

    const badMode = await call('/admin/scores?mode=quiz', { token: admin });
    assert.equal(badMode.status, 400);
    const badTime = await call('/admin/scores?submittedFrom=昨天', { token: admin });
    assert.equal(badTime.status, 400);
    const badPage = await call('/admin/scores?pageSize=101', { token: admin });
    assert.equal(badPage.status, 400);
  });
});

async function seed(): Promise<void> {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('测试数据库未连接');
  }
  const base = Date.parse('2026-06-01T08:00:00.000Z');
  const at = (minutes: number) => new Date(base - minutes * 60_000).toISOString();
  ctx.atNew = at(0);
  ctx.atUpload = at(2);
  ctx.atBad = at(3);
  ctx.atScoreB = at(4);
  ctx.domain1 = randomUUID();
  ctx.domain2 = randomUUID();
  ctx.certA = randomUUID();
  ctx.certB = randomUUID();
  ctx.certC = randomUUID();
  ctx.packA = randomUUID();
  ctx.packC = randomUUID();
  ctx.scoreNew = randomUUID();
  ctx.scoreBad = randomUUID();
  ctx.scoreProgress = randomUUID();
  ctx.scoreB = randomUUID();
  ctx.scoreFallback = randomUUID();
  ctx.scoreOrphan = randomUUID();

  await pool.query(
    `
      INSERT INTO domains (id, code, name, status, sort_order)
      VALUES
        ($1, $2, '成绩领域', 'online', 0),
        ($3, $4, '另一领域', 'online', 1)
    `,
    [ctx.domain1, `ac-${ctx.suffix}-d1`, ctx.domain2, `ac-${ctx.suffix}-d2`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, extra_constraint, sort_order
      )
      VALUES
        ($1, $2, $3, '证书甲', 'online', 100, 60, ARRAY['single','multi']::text[], '简体中文', 0),
        ($4, $2, $5, '证书乙', 'offline', 80, NULL, ARRAY['single']::text[], NULL, 1),
        ($6, $7, $8, '证书丙', 'online', 120, 70, ARRAY['judge']::text[], NULL, 0)
    `,
    [
      ctx.certA,
      ctx.domain1,
      `ac-${ctx.suffix}-a`,
      ctx.certB,
      `ac-${ctx.suffix}-b`,
      ctx.certC,
      ctx.domain2,
      `ac-${ctx.suffix}-c`,
    ],
  );

  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `cert-admin-a-${ctx.suffix}`, nick: '关联甲' },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `cert-admin-b-${ctx.suffix}` },
  });
  assert.equal(loginB.status, 200);
  const userB = loginB.body as unknown as WechatLoginResponse;
  ctx.userB = userB.user.id;
  ctx.tokenB = userB.token;

  await pool.query(
    `
      INSERT INTO packs (id, user_id, domain_id, cert_id, name, active, updated_at)
      VALUES
        ($1, $2, $3, $4, '甲包', true, $5),
        ($6, $7, $8, $9, '丙包', true, $10)
    `,
    [
      ctx.packA,
      ctx.userA,
      ctx.domain1,
      ctx.certA,
      ctx.atNew,
      ctx.packC,
      ctx.userB,
      ctx.domain2,
      ctx.certC,
      at(5),
    ],
  );
  await pool.query(
    `
      INSERT INTO wrong_items (
        id, user_id, cert_id, question_snapshot, status, wrong_count, updated_at
      )
      VALUES ($1, $2, $3, '{"type":"single","stem":"关联错题"}'::jsonb, 'pending', 1, $4)
    `,
    [randomUUID(), ctx.userA, ctx.certA, at(1)],
  );
  await pool.query(
    `
      INSERT INTO user_uploads (id, user_id, certificate_id, file_meta, status, updated_at)
      VALUES ($1, $2, $3, '{}'::jsonb, 'succeeded', $4)
    `,
    [randomUUID(), ctx.userA, ctx.certB, ctx.atUpload],
  );

  await insertSubmitted(pool, {
    id: ctx.scoreNew,
    userId: ctx.userA,
    packId: ctx.packA,
    mode: 'exam',
    reason: 'manual',
    snapshot: { certId: ctx.certA, certName: '成绩甲', name: '甲包' },
    score: storedScore(80, 100, true, 60),
    submittedAt: ctx.atNew,
    startedAt: at(10),
  });
  await insertSubmitted(pool, {
    id: ctx.scoreBad,
    userId: ctx.userA,
    packId: ctx.packA,
    mode: 'practice',
    reason: 'manual',
    snapshot: { certId: ctx.certA, certName: '成绩甲', name: '甲包' },
    score: { reason: 'manual' },
    submittedAt: ctx.atBad,
    startedAt: null,
  });
  await pool.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_id, pack_snapshot, mode, settings, status, source,
        question_count, generated_count
      )
      VALUES ($1, $2, $3, $4::jsonb, 'practice', '{}'::jsonb, 'in_progress', 'normal', 10, 10)
    `,
    [
      ctx.scoreProgress,
      ctx.userA,
      ctx.packA,
      JSON.stringify({ certId: ctx.certA, certName: '成绩甲', name: '甲包' }),
    ],
  );
  await insertSubmitted(pool, {
    id: ctx.scoreB,
    userId: ctx.userB,
    packId: null,
    mode: 'practice',
    reason: 'timeout',
    snapshot: { certId: ctx.certB, certName: '证书乙', name: '已删的包' },
    score: storedScore(40, 80, null, null, 'manual'),
    submittedAt: ctx.atScoreB,
    startedAt: null,
  });
  await insertSubmitted(pool, {
    id: ctx.scoreFallback,
    userId: ctx.userB,
    packId: ctx.packC,
    mode: 'practice',
    reason: 'manual',
    snapshot: {},
    score: storedScore(90, 120, true, 70),
    submittedAt: at(5),
    startedAt: null,
  });
  await insertSubmitted(pool, {
    id: ctx.scoreOrphan,
    userId: ctx.userB,
    packId: null,
    mode: 'practice',
    reason: 'manual',
    snapshot: { certId: randomUUID(), certName: '已删除证书', name: '孤儿包' },
    score: storedScore(10, 100, false, 60),
    submittedAt: at(6),
    startedAt: null,
  });
}

async function insertSubmitted(
  pool: Pool,
  input: {
    id: string;
    userId: string;
    packId: string | null;
    mode: 'practice' | 'exam';
    reason: 'manual' | 'timeout';
    snapshot: Record<string, unknown>;
    score: Record<string, unknown>;
    submittedAt: string;
    startedAt: string | null;
  },
): Promise<void> {
  await pool.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_id, pack_snapshot, mode, settings, score, pass_snapshot,
        status, source, question_count, generated_count, submit_reason, submitted_at, started_at
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5, '{}'::jsonb, $6, $7::jsonb,
        'submitted', 'normal', 10, 10, $8, $9, $10
      )
    `,
    [
      input.id,
      input.userId,
      input.packId,
      JSON.stringify(input.snapshot),
      input.mode,
      typeof input.score.earnedScore === 'number' ? input.score.earnedScore : null,
      JSON.stringify(input.score),
      input.reason,
      input.submittedAt,
      input.startedAt,
    ],
  );
}

function storedScore(
  earnedScore: number,
  totalScore: number,
  passed: boolean | null,
  passScore: number | null,
  reason: 'manual' | 'timeout' = 'manual',
): Record<string, unknown> {
  return {
    earnedScore,
    totalScore,
    correctCount: reason === 'manual' && earnedScore === 80 ? 8 : 1,
    wrongCount: reason === 'manual' && earnedScore === 80 ? 1 : 0,
    unansweredCount: reason === 'manual' && earnedScore === 80 ? 1 : 0,
    partialCount: 0,
    questionCount: reason === 'manual' && earnedScore === 80 ? 10 : 1,
    accuracy: reason === 'manual' && earnedScore === 80 ? 0.8 : earnedScore / totalScore,
    scoreRate: earnedScore / totalScore,
    passed,
    passScore,
    reason,
  };
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管证书与成绩集成测试');
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
