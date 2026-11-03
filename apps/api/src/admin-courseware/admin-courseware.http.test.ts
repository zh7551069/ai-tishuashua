import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ADMIN_COURSEWARE_UNREADABLE_FILE,
  ApiErrorCode,
  type AdminCoursewareDetail,
  type AdminCoursewareList,
  type ExtractJobView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'courseware-admin';
const PASSWORD = 'courseware-secret';
const SECRET_OBJECT_KEY = 'courseware/secret-object-key/notes.docx';
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
  pendingId: string;
  pendingJobId: string;
  runningId: string;
  runningJobId: string;
  succeededId: string;
  succeededJobId: string;
  failedId: string;
  failedJobId: string;
  orphanId: string;
  cancelledId: string;
  cancelledJobId: string;
  draftA: string;
  draftB: string;
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
  pendingId: '',
  pendingJobId: '',
  runningId: '',
  runningJobId: '',
  succeededId: '',
  succeededJobId: '',
  failedId: '',
  failedJobId: '',
  orphanId: '',
  cancelledId: '',
  cancelledJobId: '',
  draftA: '',
  draftB: '',
  kpId: '',
};

describe('admin courseware', { concurrency: 1 }, () => {
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
      const uploads = [
        ctx.pendingId,
        ctx.runningId,
        ctx.succeededId,
        ctx.failedId,
        ctx.orphanId,
        ctx.cancelledId,
      ].filter(Boolean);
      if (uploads.length > 0) {
        await pool
          .query('DELETE FROM user_uploads WHERE id = ANY($1::uuid[])', [uploads])
          .catch(() => undefined);
      }
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

  test('没有后管会话或拿微信 token 不能看全站课件', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/courseware');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const wechat = await call('/admin/courseware', { token: ctx.tokenA });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);

    const detail = await call(`/admin/courseware/${ctx.pendingId}`, { token: ctx.tokenB });
    assert.equal(detail.status, 401);

    const admin = await adminToken();
    const crossed = await call(`/courseware/jobs/${ctx.succeededJobId}`, { token: admin });
    assert.equal(crossed.status, 401);
    assert.equal(crossed.body.code, ApiErrorCode.UNAUTHORIZED);
  });

  test('后管默认分页看全部上传，并能按用户、证书和状态筛选', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const all = await call('/admin/courseware', { token: admin });
    assert.equal(all.status, 200);
    const list = all.body as unknown as AdminCoursewareList;
    assert.ok(list.total >= 6);
    assert.equal(list.page, 1);
    assert.equal(list.pageSize, 20);
    assert.equal(JSON.stringify(list).includes('secret-object-key'), false);
    assert.ok(list.items.every((item) => !('drafts' in item) && !('objectKey' in item)));

    const byOwner = await call(`/admin/courseware?userId=${ctx.userA}`, { token: admin });
    const ownerList = byOwner.body as unknown as AdminCoursewareList;
    assert.equal(byOwner.status, 200);
    assert.equal(ownerList.total, 5);
    assert.deepEqual(
      ownerList.items.map((item) => item.id),
      [ctx.pendingId, ctx.succeededId, ctx.failedId, ctx.orphanId, ctx.cancelledId],
    );
    assert.equal(ownerList.items[0]?.userNick, '课件甲');
    assert.equal(ownerList.items[0]?.fileName, '笔记.docx');
    assert.equal(ownerList.items[0]?.jobId, ctx.pendingJobId);
    assert.equal(ownerList.items[0]?.status, 'pending');
    assert.equal(ownerList.items[0]?.stage, 'uploading');
    assert.equal(ownerList.items[0]?.progress, 20);

    const byUser = await call(`/admin/courseware?userId=${ctx.userB}`, { token: admin });
    const userList = byUser.body as unknown as AdminCoursewareList;
    assert.equal(byUser.status, 200);
    assert.equal(userList.total, 1);
    assert.equal(userList.items[0]?.id, ctx.runningId);
    assert.equal(userList.items[0]?.userNick, null);
    assert.equal(userList.items[0]?.status, 'running');
    assert.equal(userList.items[0]?.stage, 'extracting');

    const byCert = await call(`/admin/courseware?certId=${ctx.certB}`, { token: admin });
    const certList = byCert.body as unknown as AdminCoursewareList;
    assert.equal(byCert.status, 200);
    assert.equal(certList.total, 1);
    assert.equal(certList.items[0]?.id, ctx.succeededId);
    assert.equal(certList.items[0]?.certName, '课件证书乙');
    assert.equal(certList.items[0]?.committed, true);
    assert.equal(certList.items[0]?.draftCount, 2);

    const pending = await call(`/admin/courseware?userId=${ctx.userA}&status=pending`, {
      token: admin,
    });
    const pendingList = pending.body as unknown as AdminCoursewareList;
    assert.equal(pending.status, 200);
    assert.deepEqual(
      pendingList.items.map((item) => item.id),
      [ctx.pendingId, ctx.orphanId],
    );
    assert.equal(pendingList.items[1]?.jobId, null);
    assert.equal(pendingList.items[1]?.stage, null);

    const failed = await call(`/admin/courseware?status=failed&userId=${ctx.userA}`, {
      token: admin,
    });
    const failedList = failed.body as unknown as AdminCoursewareList;
    assert.equal(failedList.total, 1);
    assert.equal(failedList.items[0]?.fileName, ADMIN_COURSEWARE_UNREADABLE_FILE);
    assert.equal(failedList.items[0]?.errorCode, 'COURSEWARE_UNREADABLE');

    const page = await call(`/admin/courseware?userId=${ctx.userA}&page=2&pageSize=2`, {
      token: admin,
    });
    const pageList = page.body as unknown as AdminCoursewareList;
    assert.equal(pageList.total, 5);
    assert.equal(pageList.page, 2);
    assert.equal(pageList.pageSize, 2);
    assert.deepEqual(
      pageList.items.map((item) => item.id),
      [ctx.failedId, ctx.orphanId],
    );

    const beyond = await call(`/admin/courseware?userId=${ctx.userA}&page=9&pageSize=2`, {
      token: admin,
    });
    const beyondList = beyond.body as unknown as AdminCoursewareList;
    assert.equal(beyondList.total, 5);
    assert.deepEqual(beyondList.items, []);

    const invalid = await call('/admin/courseware?status=gone', { token: admin });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.code, ApiErrorCode.VALIDATION_ERROR);
  });

  test('详情带草稿和错误，不带对象键，也没有取消路由', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const detail = await call(`/admin/courseware/${ctx.succeededId}`, { token: admin });
    assert.equal(detail.status, 200);
    const item = detail.body as unknown as AdminCoursewareDetail;
    assert.equal(item.jobId, ctx.succeededJobId);
    assert.equal(item.status, 'succeeded');
    assert.equal(item.stage, 'done');
    assert.equal(item.progress, 100);
    assert.equal(item.committed, true);
    assert.deepEqual(
      item.drafts.map((draft) => draft.name),
      ['勾股定理', '三角函数'],
    );
    assert.deepEqual(item.extractedKpIds, [ctx.kpId]);
    assert.deepEqual(item.acceptedDraftIds, [ctx.draftA, ctx.draftB]);
    assert.equal(item.error, null);
    assert.equal(JSON.stringify(item).includes('secret-object-key'), false);
    assert.equal('objectKey' in item, false);

    const failed = await call(`/admin/courseware/${ctx.failedId}`, { token: admin });
    const failedItem = failed.body as unknown as AdminCoursewareDetail;
    assert.equal(failedItem.fileName, ADMIN_COURSEWARE_UNREADABLE_FILE);
    assert.equal(failedItem.extension, null);
    assert.equal(failedItem.error?.code, 'COURSEWARE_UNREADABLE');
    assert.equal(failedItem.drafts.length, 0);

    const orphan = await call(`/admin/courseware/${ctx.orphanId}`, { token: admin });
    const orphanItem = orphan.body as unknown as AdminCoursewareDetail;
    assert.equal(orphanItem.jobId, null);
    assert.equal(orphanItem.stage, null);
    assert.equal(orphanItem.estimatedMinutes, null);
    assert.equal(orphanItem.fileName, '孤本.pdf');

    const missing = await call(`/admin/courseware/${randomUUID()}`, { token: admin });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.code, ApiErrorCode.NOT_FOUND);

    const badId = await call('/admin/courseware/not-a-uuid', { token: admin });
    assert.equal(badId.status, 400);
    assert.equal(badId.body.code, ApiErrorCode.VALIDATION_ERROR);

    const cancel = await call(`/admin/courseware/${ctx.pendingId}/cancel`, {
      method: 'POST',
      token: admin,
    });
    assert.equal(cancel.status, 404);
    const again = await call(`/admin/courseware/${ctx.pendingId}`, { token: admin });
    const againItem = again.body as unknown as AdminCoursewareDetail;
    assert.equal(againItem.status, 'pending');
  });

  test('小程序进度仍然只看自己的任务', async (t) => {
    if (!ready(t)) {
      return;
    }
    const own = await call(`/courseware/jobs/${ctx.succeededJobId}`, { token: ctx.tokenA });
    assert.equal(own.status, 200);
    const job = own.body as unknown as ExtractJobView;
    assert.equal(job.status, 'succeeded');
    assert.equal(job.file.fileName, '讲义.pdf');
    assert.equal(job.committed, true);

    const hidden = await call(`/courseware/jobs/${ctx.succeededJobId}`, { token: ctx.tokenB });
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
  ctx.pendingId = randomUUID();
  ctx.pendingJobId = randomUUID();
  ctx.runningId = randomUUID();
  ctx.runningJobId = randomUUID();
  ctx.succeededId = randomUUID();
  ctx.succeededJobId = randomUUID();
  ctx.failedId = randomUUID();
  ctx.failedJobId = randomUUID();
  ctx.orphanId = randomUUID();
  ctx.cancelledId = randomUUID();
  ctx.cancelledJobId = randomUUID();
  ctx.draftA = randomUUID();
  ctx.draftB = randomUUID();
  ctx.kpId = randomUUID();

  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '课件领域', 'online', 0)`,
    [ctx.domainId, `cw-${ctx.suffix}-d`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score,
        enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $2, $3, '课件证书甲', 'online', 100, 60, ARRAY['single','multi','judge'], 0),
        ($4, $2, $5, '课件证书乙', 'online', 100, 60, ARRAY['single','multi','judge'], 1)
    `,
    [ctx.certA, ctx.domainId, `cw-${ctx.suffix}-a`, ctx.certB, `cw-${ctx.suffix}-b`],
  );

  const loginA = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `courseware-admin-a-${ctx.suffix}`, nick: '课件甲' },
  });
  assert.equal(loginA.status, 200);
  const userA = loginA.body as unknown as WechatLoginResponse;
  ctx.userA = userA.user.id;
  ctx.tokenA = userA.token;

  const loginB = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `courseware-admin-b-${ctx.suffix}` },
  });
  assert.equal(loginB.status, 200);
  const userB = loginB.body as unknown as WechatLoginResponse;
  ctx.userB = userB.user.id;
  ctx.tokenB = userB.token;

  const now = Date.now();
  const at = (offset: number) => new Date(now - offset).toISOString();
  await insertUpload({
    id: ctx.pendingId,
    userId: ctx.userA,
    certId: ctx.certA,
    status: 'pending',
    file: fileMeta('笔记.docx', 'docx', 2048),
    at: at(0),
  });
  await insertUpload({
    id: ctx.runningId,
    userId: ctx.userB,
    certId: ctx.certA,
    status: 'pending',
    file: fileMeta('进行中.pptx', 'pptx', 4096),
    at: at(60_000),
  });
  await insertUpload({
    id: ctx.succeededId,
    userId: ctx.userA,
    certId: ctx.certB,
    status: 'succeeded',
    file: fileMeta('讲义.pdf', 'pdf', 8192),
    at: at(120_000),
  });
  await insertUpload({
    id: ctx.failedId,
    userId: ctx.userA,
    certId: ctx.certA,
    status: 'failed',
    file: { note: 'broken' },
    errorCode: 'COURSEWARE_UNREADABLE',
    errorMessage: '没有从课件里读出可用文字',
    at: at(180_000),
  });
  await insertUpload({
    id: ctx.orphanId,
    userId: ctx.userA,
    certId: ctx.certA,
    status: 'pending',
    file: fileMeta('孤本.pdf', 'pdf', 512),
    at: at(240_000),
  });
  await insertUpload({
    id: ctx.cancelledId,
    userId: ctx.userA,
    certId: ctx.certA,
    status: 'cancelled',
    file: fileMeta('已取消.doc', 'doc', 1024),
    at: at(300_000),
  });

  await insertJob({
    id: ctx.pendingJobId,
    uploadId: ctx.pendingId,
    userId: ctx.userA,
    status: 'pending',
    stage: 'uploading',
    progress: 20,
    minutes: 1,
    at: at(0),
  });
  await insertJob({
    id: ctx.runningJobId,
    uploadId: ctx.runningId,
    userId: ctx.userB,
    status: 'running',
    stage: 'extracting',
    progress: 75,
    minutes: 3,
    at: at(60_000),
  });
  await insertJob({
    id: ctx.succeededJobId,
    uploadId: ctx.succeededId,
    userId: ctx.userA,
    status: 'succeeded',
    stage: 'done',
    progress: 100,
    minutes: 1,
    drafts: [
      {
        id: ctx.draftA,
        name: '勾股定理',
        promptHint: '考察勾股定理',
        excerpt: '直角三角形',
      },
      {
        id: ctx.draftB,
        name: '三角函数',
        promptHint: '考察三角函数',
        excerpt: '正弦',
      },
    ],
    accepted: true,
    acceptedDraftIds: [ctx.draftA, ctx.draftB],
    extractedKpIds: [ctx.kpId],
    at: at(120_000),
  });
  await insertJob({
    id: ctx.failedJobId,
    uploadId: ctx.failedId,
    userId: ctx.userA,
    status: 'failed',
    stage: 'done',
    progress: 75,
    minutes: 1,
    errorCode: 'COURSEWARE_UNREADABLE',
    errorMessage: '没有从课件里读出可用文字',
    at: at(180_000),
  });
  await insertJob({
    id: ctx.cancelledJobId,
    uploadId: ctx.cancelledId,
    userId: ctx.userA,
    status: 'cancelled',
    stage: 'learning',
    progress: 45,
    minutes: 2,
    at: at(300_000),
  });
}

async function insertUpload(input: {
  id: string;
  userId: string;
  certId: string;
  status: string;
  file: unknown;
  errorCode?: string;
  errorMessage?: string;
  at: string;
}): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO user_uploads (
        id, user_id, certificate_id, file_meta, status, error_code, error_message,
        created_at, updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $8)
    `,
    [
      input.id,
      input.userId,
      input.certId,
      JSON.stringify(input.file),
      input.status,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      input.at,
    ],
  );
}

async function insertJob(input: {
  id: string;
  uploadId: string;
  userId: string;
  status: string;
  stage: string;
  progress: number;
  minutes: number;
  drafts?: unknown[];
  accepted?: boolean;
  acceptedDraftIds?: string[];
  extractedKpIds?: string[];
  errorCode?: string;
  errorMessage?: string;
  at: string;
}): Promise<void> {
  await ctx.pool?.query(
    `
      INSERT INTO extract_jobs (
        id, upload_id, user_id, status, stage, progress, estimated_minutes,
        error_code, error_message, drafts, accepted_at, accepted_draft_ids, extracted_kp_ids,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10::jsonb, $11, $12::uuid[], $13::uuid[],
        $14, $14
      )
    `,
    [
      input.id,
      input.uploadId,
      input.userId,
      input.status,
      input.stage,
      input.progress,
      input.minutes,
      input.errorCode ?? null,
      input.errorMessage ?? null,
      JSON.stringify(input.drafts ?? []),
      input.accepted ? input.at : null,
      input.acceptedDraftIds ?? [],
      input.extractedKpIds ?? [],
      input.at,
    ],
  );
}

function fileMeta(fileName: string, extension: string, byteSize: number) {
  return {
    fileName,
    extension,
    mimeType: 'application/octet-stream',
    byteSize,
    objectKey: SECRET_OBJECT_KEY,
  };
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过后管课件集成测试');
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
