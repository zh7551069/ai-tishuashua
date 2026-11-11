import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ADMIN_CERTIFICATE_UNREADABLE_PACK,
  ApiErrorCode,
  type AdminCertificateScoreDetail,
  type AdminCertificateScoreList,
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
const SECRET_MARKER = 'session-secret-marker';
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
  userA: string;
  userB: string;
  tokenA: string;
  tokenB: string;
  openIdA: string;
  packMixed: string;
  packOnlyPack: string;
  newestId: string;
  practiceId: string;
  packOnlyId: string;
  /** source=normal，快照只有刷题包名称。用来证明小程序列表仍能读出这种快照。 */
  packSnapshotId: string;
  unreadableId: string;
  unlinkedId: string;
  userBId: string;
  inProgressId: string;
  ghostCertId: string;
  questionA: string;
  questionB: string;
  kpId: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  domainId: '',
  certA: '',
  certB: '',
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
  openIdA: '',
  packMixed: '',
  packOnlyPack: '',
  newestId: '',
  practiceId: '',
  packOnlyId: '',
  packSnapshotId: '',
  unreadableId: '',
  unlinkedId: '',
  userBId: '',
  inProgressId: '',
  ghostCertId: '',
  questionA: '',
  questionB: '',
  kpId: '',
};

describe('admin certificates', { concurrency: 1 }, () => {
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
      if (ctx.domainId) {
        await pool
          .query('DELETE FROM certificates WHERE domain_id = $1', [ctx.domainId])
          .catch(() => undefined);
        await pool
          .query('DELETE FROM domains WHERE id = $1', [ctx.domainId])
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

  test('没有后管会话或拿微信 token 不能看全站成绩', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/certificates');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call('/admin/certificates', { token: ctx.tokenA });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);

    const detail = await call(`/admin/certificates/${ctx.newestId}`, { token: ctx.tokenB });
    assert.equal(detail.status, 401);

    const admin = await adminToken();
    const crossed = await call('/quiz/sessions', { token: admin });
    assert.equal(crossed.status, 401);
    assert.equal(crossed.body.code, ApiErrorCode.UNAUTHORIZED);

    const paper = await call(`/quiz/sessions/${ctx.newestId}`, { token: admin });
    assert.equal(paper.status, 401);
  });

  test('后管默认分页看已交卷，并能按用户、证书和模式筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const all = await call('/admin/certificates', { token: admin });
    assert.equal(all.status, 200);
    const list = all.body as unknown as AdminCertificateScoreList;
    assert.ok(list.total >= 6);
    assert.equal(list.page, 1);
    assert.equal(list.pageSize, 20);
    assert.equal(JSON.stringify(list).includes(SECRET_MARKER), false);
    assert.equal(JSON.stringify(list).includes(ctx.openIdA), false);
    assert.ok(list.items.every((item) => !('questions' in item) && !('runToken' in item)));

    const byOwner = await call(`/admin/certificates?userId=${ctx.userA}`, { token: admin });
    const ownerList = byOwner.body as unknown as AdminCertificateScoreList;
    assert.equal(byOwner.status, 200);
    assert.equal(ownerList.total, 6);
    assert.deepEqual(
      ownerList.items.map((item) => item.id),
      [
        ctx.newestId,
        ctx.practiceId,
        ctx.packOnlyId,
        ctx.unreadableId,
        ctx.unlinkedId,
        ctx.packSnapshotId,
      ],
    );
    assert.equal(
      ownerList.items.some((item) => item.id === ctx.inProgressId),
      false,
    );
    assert.equal(ownerList.items[0]?.userNick, '成绩甲');
    assert.equal(ownerList.items[0]?.mode, 'exam');
    assert.equal(ownerList.items[0]?.certId, ctx.certA);
    assert.equal(ownerList.items[0]?.certName, '成绩证书甲');
    assert.equal(ownerList.items[0]?.earnedScore, 88);
    assert.equal(ownerList.items[0]?.reason, 'timeout');
    assert.equal(ownerList.items[0]?.scoreReadable, true);

    const byUser = await call(`/admin/certificates?userId=${ctx.userB}`, { token: admin });
    const userList = byUser.body as unknown as AdminCertificateScoreList;
    assert.equal(byUser.status, 200);
    assert.equal(userList.total, 1);
    assert.equal(userList.items[0]?.id, ctx.userBId);
    assert.equal(userList.items[0]?.userNick, null);
    assert.equal(userList.items[0]?.certId, ctx.certB);

    const byCert = await call(`/admin/certificates?certId=${ctx.certB}`, { token: admin });
    const certList = byCert.body as unknown as AdminCertificateScoreList;
    assert.equal(byCert.status, 200);
    assert.equal(certList.total, 2);
    assert.deepEqual(
      certList.items.map((item) => item.id),
      [ctx.packOnlyId, ctx.userBId],
    );
    assert.equal(certList.items[0]?.certName, '成绩证书乙');
    assert.equal(certList.items[0]?.source, 'wrongSet');
    assert.equal(certList.items[0]?.packName, '只靠刷题包');

    const practice = await call(`/admin/certificates?userId=${ctx.userA}&mode=practice`, {
      token: admin,
    });
    const practiceList = practice.body as unknown as AdminCertificateScoreList;
    assert.equal(practice.status, 200);
    assert.deepEqual(
      practiceList.items.map((item) => item.id),
      [ctx.practiceId, ctx.unlinkedId, ctx.packSnapshotId],
    );
    assert.equal(practiceList.items[0]?.passed, false);
    assert.equal(practiceList.items[1]?.certId, null);
    assert.equal(practiceList.items[1]?.snapshotCertName, '已删除证书');
    assert.equal(practiceList.items[1]?.passed, null);
    assert.equal(practiceList.items[1]?.scoreReadable, true);

    const exams = await call(`/admin/certificates?userId=${ctx.userA}&mode=exam`, {
      token: admin,
    });
    const examList = exams.body as unknown as AdminCertificateScoreList;
    assert.equal(examList.total, 3);
    assert.equal(examList.items[2]?.id, ctx.unreadableId);
    assert.equal(examList.items[2]?.scoreReadable, false);
    assert.equal(examList.items[2]?.earnedScore, null);

    const ghost = await call(`/admin/certificates?certId=${ctx.ghostCertId}`, { token: admin });
    const ghostList = ghost.body as unknown as AdminCertificateScoreList;
    assert.equal(ghost.status, 200);
    assert.equal(ghostList.total, 0);
    assert.deepEqual(ghostList.items, []);

    const page = await call(`/admin/certificates?userId=${ctx.userA}&page=2&pageSize=2`, {
      token: admin,
    });
    const pageList = page.body as unknown as AdminCertificateScoreList;
    assert.equal(pageList.total, 6);
    assert.equal(pageList.page, 2);
    assert.equal(pageList.pageSize, 2);
    assert.deepEqual(
      pageList.items.map((item) => item.id),
      [ctx.packOnlyId, ctx.unreadableId],
    );

    const beyond = await call(`/admin/certificates?userId=${ctx.userA}&page=9&pageSize=2`, {
      token: admin,
    });
    const beyondList = beyond.body as unknown as AdminCertificateScoreList;
    assert.equal(beyondList.total, 6);
    assert.deepEqual(beyondList.items, []);

    const invalid = await call('/admin/certificates?mode=submitted', { token: admin });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, ApiErrorCode.VALIDATION_ERROR);
  });

  test('详情带题目和当时的分数，不改成绩，也没有改分路由', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const detail = await call(`/admin/certificates/${ctx.newestId}`, { token: admin });
    assert.equal(detail.status, 200);
    const item = detail.body as unknown as AdminCertificateScoreDetail;
    assert.equal(item.certId, ctx.certA);
    assert.equal(item.packId, ctx.packMixed);
    assert.equal(item.earnedScore, 88);
    assert.equal(item.totalScore, 100);
    assert.equal(item.passed, true);
    assert.equal(item.passScore, 60);
    assert.equal(item.reason, 'timeout');
    assert.equal(item.wrongCount, 1);
    assert.equal(item.partialCount, 1);
    assert.equal(item.questions.length, 2);
    assert.equal(item.questions[0]?.stem, '单选题干');
    assert.deepEqual(item.questions[0]?.answer, ['A']);
    assert.deepEqual(item.questions[0]?.selected, ['B']);
    assert.equal(item.questions[0]?.source, 'ai');
    assert.deepEqual(item.questions[1]?.answer, ['A', 'B']);
    assert.deepEqual(item.questions[1]?.kpIds, [ctx.kpId]);
    assert.equal(item.questions[1]?.source, 'wrong_carry');
    assert.equal('outcome' in (item.questions[0] ?? {}), false);
    assert.equal(JSON.stringify(item).includes(SECRET_MARKER), false);
    assert.equal(JSON.stringify(item).includes(ctx.openIdA), false);
    assert.equal('runToken' in item, false);

    const broken = await call(`/admin/certificates/${ctx.unreadableId}`, { token: admin });
    const brokenItem = broken.body as unknown as AdminCertificateScoreDetail;
    assert.equal(brokenItem.scoreReadable, false);
    assert.equal(brokenItem.earnedScore, null);
    assert.equal(brokenItem.certId, ctx.certA);
    assert.equal(brokenItem.packName, ADMIN_CERTIFICATE_UNREADABLE_PACK);
    assert.equal(brokenItem.questions.length, 0);

    const unlinked = await call(`/admin/certificates/${ctx.unlinkedId}`, { token: admin });
    const unlinkedItem = unlinked.body as unknown as AdminCertificateScoreDetail;
    assert.equal(unlinkedItem.certId, null);
    assert.equal(unlinkedItem.snapshotCertName, '已删除证书');
    assert.equal(unlinkedItem.packName, '散卷');
    assert.equal(unlinkedItem.passScore, null);

    const packOnly = await call(`/admin/certificates/${ctx.packOnlyId}`, { token: admin });
    const packOnlyItem = packOnly.body as unknown as AdminCertificateScoreDetail;
    assert.equal(packOnlyItem.certId, ctx.certB);
    assert.equal(packOnlyItem.domainName, '成绩领域');

    const missing = await call(`/admin/certificates/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const pending = await call(`/admin/certificates/${ctx.inProgressId}`, { token: admin });
    assert.equal(pending.status, 404);
    assert.equal(pending.body.code, ApiErrorCode.NOT_FOUND);

    const badId = await call('/admin/certificates/not-a-uuid', { token: admin });
    assert.equal(badId.status, 400);
    assert.equal(badId.body.code, ApiErrorCode.VALIDATION_ERROR);

    const before = await ctx.pool?.query<{ score: string | null; status: string }>(
      'SELECT score, status FROM quiz_sessions WHERE id = $1',
      [ctx.newestId],
    );
    const rewrite = await call(`/admin/certificates/${ctx.newestId}/score`, {
      method: 'POST',
      token: admin,
      body: { earnedScore: 0 },
    });
    assert.equal(rewrite.status, 404);
    const after = await ctx.pool?.query<{ score: string | null; status: string }>(
      'SELECT score, status FROM quiz_sessions WHERE id = $1',
      [ctx.newestId],
    );
    assert.equal(Number(before?.rows[0]?.score), 88);
    assert.equal(before?.rows[0]?.status, 'submitted');
    assert.equal(Number(after?.rows[0]?.score), 88);
    assert.equal(after?.rows[0]?.status, 'submitted');

    const stillOpen = await ctx.pool?.query<{ status: string }>(
      'SELECT status FROM quiz_sessions WHERE id = $1',
      [ctx.inProgressId],
    );
    assert.equal(stillOpen?.rows[0]?.status, 'in_progress');
  });

  test('小程序成绩列表仍然只看自己的已交卷，并且丢掉读不出的快照', async (t) => {
    if (!ready(t)) {
      return;
    }
    const own = await call('/quiz/sessions', { token: ctx.tokenA });
    assert.equal(own.status, 200);
    const scores = own.body as unknown as QuizScoreList;
    const ids = scores.items.map((item) => item.id);
    assert.equal(ids.includes(ctx.newestId), true);
    assert.equal(ids.includes(ctx.practiceId), true);
    // wrongSet 按 TB-6 契约不进小程序成绩列表。只靠刷题包名称的快照改由 normal 会话覆盖。
    assert.equal(ids.includes(ctx.packOnlyId), false);
    assert.equal(ids.includes(ctx.packSnapshotId), true);
    assert.equal(ids.includes(ctx.unlinkedId), true);
    assert.equal(ids.includes(ctx.unreadableId), false);
    assert.equal(ids.includes(ctx.userBId), false);
    assert.equal(ids.includes(ctx.inProgressId), false);

    const other = await call('/quiz/sessions', { token: ctx.tokenB });
    const otherScores = other.body as unknown as QuizScoreList;
    assert.deepEqual(
      otherScores.items.map((item) => item.id),
      [ctx.userBId],
    );

    const hidden = await call(`/quiz/sessions/${ctx.newestId}`, { token: ctx.tokenB });
    assert.equal(hidden.status, 404);
    assert.equal(hidden.body.code, ApiErrorCode.NOT_FOUND);
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
  ctx.packMixed = randomUUID();
  ctx.packOnlyPack = randomUUID();
  ctx.newestId = randomUUID();
  ctx.practiceId = randomUUID();
  ctx.packOnlyId = randomUUID();
  ctx.packSnapshotId = randomUUID();
  ctx.unreadableId = randomUUID();
  ctx.unlinkedId = randomUUID();
  ctx.userBId = randomUUID();
  ctx.inProgressId = randomUUID();
  ctx.ghostCertId = randomUUID();
  ctx.questionA = randomUUID();
  ctx.questionB = randomUUID();
  ctx.kpId = randomUUID();

  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '成绩领域', 'online', 0)`,
    [ctx.domainId, `sc-${ctx.suffix}-d`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $2, $3, '成绩证书甲', 'online', 100, 60, ARRAY['single','multi','judge'], 0),
        ($4, $2, $5, '成绩证书乙', 'offline', 100, 60, ARRAY['single','multi','judge'], 1)
    `,
    [ctx.certA, ctx.domainId, `sc-${ctx.suffix}-a`, ctx.certB, `sc-${ctx.suffix}-b`],
  );

  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `certificates-admin-a-${ctx.suffix}`, nick: '成绩甲' },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `certificates-admin-b-${ctx.suffix}` },
  });
  assert.equal(loginB.status, 200);
  const userB = loginB.body as unknown as WechatLoginResponse;
  ctx.userB = userB.user.id;
  ctx.tokenB = userB.token;

  const openId = await pool.query<{ wx_open_id: string }>(
    'SELECT wx_open_id FROM users WHERE id = $1',
    [ctx.userA],
  );
  ctx.openIdA = openId.rows[0]?.wx_open_id ?? '';
  assert.ok(ctx.openIdA);

  await pool.query(
    `
      INSERT INTO packs (id, user_id, domain_id, cert_id, name, active)
      VALUES
        ($1, $2, $3, $4, '混合包', false),
        ($5, $2, $3, $4, '乙证书包', false)
    `,
    [ctx.packMixed, ctx.userA, ctx.domainId, ctx.certB, ctx.packOnlyPack],
  );

  const now = Date.now();
  const at = (offset: number) => new Date(now - offset).toISOString();
  await insertSession({
    id: ctx.newestId,
    userId: ctx.userA,
    packId: ctx.packMixed,
    mode: 'exam',
    source: 'normal',
    status: 'submitted',
    snapshot: {
      name: '甲的考试',
      certId: ctx.certA,
      certName: '快照甲',
      domainName: '快照领域',
    },
    score: 88,
    pass: storedScore({
      earnedScore: 88,
      correctCount: 8,
      wrongCount: 1,
      partialCount: 1,
      questionCount: 10,
      accuracy: 0.8,
      scoreRate: 0.88,
      passed: true,
      reason: 'manual',
    }),
    reason: 'timeout',
    settings: { hidden: SECRET_MARKER },
    runToken: randomUUID(),
    submittedAt: at(0),
    startedAt: at(3_600_000),
  });
  await insertSession({
    id: ctx.practiceId,
    userId: ctx.userA,
    packId: null,
    mode: 'practice',
    source: 'normal',
    status: 'submitted',
    snapshot: { name: '甲的练习', certId: ctx.certA, certName: '快照甲' },
    score: 40,
    pass: storedScore({
      earnedScore: 40,
      correctCount: 4,
      wrongCount: 6,
      accuracy: 0.4,
      scoreRate: 0.4,
      passed: false,
    }),
    reason: 'manual',
    submittedAt: at(60_000),
  });
  await insertSession({
    id: ctx.packOnlyId,
    userId: ctx.userA,
    packId: ctx.packOnlyPack,
    mode: 'exam',
    source: 'wrongSet',
    status: 'submitted',
    snapshot: { name: '只靠刷题包' },
    score: 70,
    pass: storedScore({ earnedScore: 70, scoreRate: 0.7, passed: true }),
    reason: 'manual',
    submittedAt: at(120_000),
  });
  await insertSession({
    id: ctx.unreadableId,
    userId: ctx.userA,
    packId: null,
    mode: 'exam',
    source: 'normal',
    status: 'submitted',
    snapshot: { certId: ctx.certA, certName: '快照甲' },
    score: 15,
    pass: { note: 'not-a-score' },
    reason: 'manual',
    submittedAt: at(180_000),
  });
  await insertSession({
    id: ctx.unlinkedId,
    userId: ctx.userA,
    packId: null,
    mode: 'practice',
    source: 'normal',
    status: 'submitted',
    snapshot: { name: '散卷', certId: ctx.ghostCertId, certName: '已删除证书' },
    score: 10,
    pass: storedScore({
      earnedScore: 10,
      totalScore: 100,
      questionCount: 1,
      correctCount: 1,
      accuracy: 1,
      scoreRate: 0.1,
      passed: null,
      passScore: null,
    }),
    reason: 'manual',
    submittedAt: at(240_000),
  });
  await insertSession({
    id: ctx.packSnapshotId,
    userId: ctx.userA,
    packId: null,
    mode: 'practice',
    source: 'normal',
    status: 'submitted',
    snapshot: { name: '只靠刷题包快照' },
    score: 70,
    pass: storedScore({ earnedScore: 70, scoreRate: 0.7, passed: true }),
    reason: 'manual',
    submittedAt: at(360_000),
  });
  await insertSession({
    id: ctx.userBId,
    userId: ctx.userB,
    packId: null,
    mode: 'exam',
    source: 'normal',
    status: 'submitted',
    snapshot: { name: '乙的考试', certId: ctx.certB, certName: '快照乙' },
    score: 90,
    pass: storedScore({ earnedScore: 90, scoreRate: 0.9, passed: true }),
    reason: 'manual',
    submittedAt: at(300_000),
  });
  await insertSession({
    id: ctx.inProgressId,
    userId: ctx.userA,
    packId: null,
    mode: 'practice',
    source: 'normal',
    status: 'in_progress',
    snapshot: { name: '还在答', certId: ctx.certA, certName: '快照甲' },
    score: null,
    pass: null,
    reason: null,
    submittedAt: null,
  });

  await pool.query(
    `
      INSERT INTO paper_questions (
        id, session_id, ordinal, type_code, stem, options, answer, analysis, kp_ids, source, score
      )
      VALUES
        ($1, $2, 1, 'single', '单选题干', $3::jsonb, $4::jsonb, '选 A', '{}', 'ai', 5),
        ($5, $2, 2, 'multi', '多选题干', $6::jsonb, $7::jsonb, '两个都对', $8::uuid[], 'wrong_carry', 5)
    `,
    [
      ctx.questionA,
      ctx.newestId,
      JSON.stringify([
        { id: 'A', text: '对' },
        { id: 'B', text: '错' },
      ]),
      JSON.stringify(['A']),
      ctx.questionB,
      JSON.stringify([
        { id: 'A', text: '甲' },
        { id: 'B', text: '乙' },
        { id: 'C', text: '丙' },
      ]),
      JSON.stringify(['A', 'B']),
      [ctx.kpId],
    ],
  );
  await pool.query(
    `
      INSERT INTO quiz_answers (question_id, session_id, selected)
      VALUES ($1, $2, $3::jsonb), ($4, $2, $5::jsonb)
    `,
    [ctx.questionA, ctx.newestId, JSON.stringify(['B']), ctx.questionB, JSON.stringify(['A'])],
  );
}

async function insertSession(input: {
  id: string;
  userId: string;
  packId: string | null;
  mode: string;
  source: string;
  status: string;
  snapshot: Record<string, unknown>;
  score: number | null;
  pass: Record<string, unknown> | null;
  reason: string | null;
  settings?: Record<string, unknown>;
  runToken?: string;
  submittedAt: string | null;
  startedAt?: string;
}): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO quiz_sessions (
        id, user_id, pack_id, pack_snapshot, mode, settings, score, pass_snapshot,
        status, source, question_count, generated_count, submit_reason, submitted_at,
        started_at, run_token
      )
      VALUES (
        $1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8::jsonb,
        $9, $10, 10, 10, $11, $12,
        $13, $14
      )
    `,
    [
      input.id,
      input.userId,
      input.packId,
      JSON.stringify(input.snapshot),
      input.mode,
      JSON.stringify(input.settings ?? {}),
      input.score,
      input.pass ? JSON.stringify(input.pass) : null,
      input.status,
      input.source,
      input.reason,
      input.submittedAt,
      input.startedAt ?? null,
      input.runToken ?? null,
    ],
  );
}

function storedScore(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    earnedScore: 0,
    totalScore: 100,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    partialCount: 0,
    questionCount: 10,
    accuracy: 0,
    scoreRate: 0,
    passed: false,
    passScore: 60,
    reason: 'manual',
    ...overrides,
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
