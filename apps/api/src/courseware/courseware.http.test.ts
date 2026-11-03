import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { crc32 } from 'node:zlib';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  USER_COURSEWARE_TEXTBOOK,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import {
  EXTRACT_FAIL_MARKER,
  createObjectStorage,
  createPgExecutor,
  readStorageEnv,
  runCoursewareExtraction,
} from '@tishuashua/shared/courseware';
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
  textbookId: string;
  kpId: string;
}

interface JobView {
  id: string;
  uploadId: string;
  certificateId: string;
  status: string;
  stage: string;
  progress: number;
  estimatedMinutes: number;
  drafts: { id: string; name: string }[];
  extractedKpIds: string[];
  committed: boolean;
  error: { code: string; message: string } | null;
  file: { fileName: string; byteSize: number; extension: string };
}

interface TreeView {
  nodes: {
    kind: string;
    name: string;
    children?: { id: string; name: string }[];
  }[];
}

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  dir: string;
  tokens: string[];
  userA: string;
  userB: string;
  tokenA: string;
  tokenB: string;
  packId: string;
  fixture?: Fixture;
} = {
  ready: false,
  base: '',
  dir: '',
  tokens: [],
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
  packId: '',
};

describe('courseware extract', { concurrency: 1 }, () => {
  before(async () => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }
    ctx.dir = mkdtempSync(path.join(tmpdir(), 'courseware-http-'));
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.LLM_MOCK = 'true';
    process.env.LLM_API_KEY = '';
    process.env.OSS_ENDPOINT = '';
    process.env.OSS_BUCKET = '';
    process.env.OSS_ACCESS_KEY_ID = '';
    process.env.OSS_ACCESS_KEY_SECRET = '';
    process.env.OSS_LOCAL_DIR = ctx.dir;

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
    const first = await login('courseware-a');
    const second = await login('courseware-b');
    ctx.userA = first.user.id;
    ctx.tokenA = first.token;
    ctx.userB = second.user.id;
    ctx.tokenB = second.token;
    ctx.packId = await createPack(ctx.tokenA, ctx.fixture.certId, [ctx.fixture.kpId]);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.fixture) {
      const users = [ctx.userA, ctx.userB].filter(Boolean);
      if (users.length > 0) {
        await pool
          .query(
            `
              DELETE FROM pack_knowledge_points
              WHERE knowledge_point_id IN (
                SELECT id FROM knowledge_points WHERE owner_user_id = ANY($1::uuid[])
              )
            `,
            [users],
          )
          .catch(() => undefined);
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users])
          .catch(() => undefined);
      }
      await pool
        .query('DELETE FROM knowledge_points WHERE id = $1', [ctx.fixture.kpId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = $1', [ctx.fixture.textbookId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE id = ANY($1::uuid[])', [
          [ctx.fixture.certId, ctx.fixture.offlineCertId],
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
    if (ctx.dir) {
      rmSync(ctx.dir, { recursive: true, force: true });
    }
  });

  test('未登录不能上传，格式不对或空文件不会落库', async (t) => {
    if (!ready(t) || !ctx.fixture) return;
    const anonymous = await upload(undefined, 'a.pdf', Buffer.from('abc'), ctx.fixture.certId);
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, ApiErrorCode.UNAUTHORIZED);

    const before = await uploadCount(ctx.userA);
    const text = await upload(ctx.tokenA, 'notes.txt', Buffer.from('hello'), ctx.fixture.certId);
    assert.equal(text.status, 400);
    assert.equal(text.body.code, ApiErrorCode.COURSEWARE_UNSUPPORTED);
    const empty = await upload(ctx.tokenA, 'empty.pdf', Buffer.alloc(0), ctx.fixture.certId);
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, ApiErrorCode.VALIDATION_ERROR);
    const offline = await upload(
      ctx.tokenA,
      'notes.docx',
      docx(['光合作用']),
      ctx.fixture.offlineCertId,
    );
    assert.equal(offline.status, 404);
    assert.equal(offline.body.code, ApiErrorCode.NOT_FOUND);
    assert.equal(await uploadCount(ctx.userA), before);
  });

  test('没有 Key 且未打开 mock 时拒绝，不登记上传', async (t) => {
    if (!ready(t) || !ctx.fixture) return;
    const previousMock = process.env.LLM_MOCK;
    const previousKey = process.env.LLM_API_KEY;
    process.env.LLM_MOCK = 'false';
    process.env.LLM_API_KEY = '';
    try {
      const before = await uploadCount(ctx.userA);
      const response = await upload(
        ctx.tokenA,
        'notes.docx',
        docx(['光合作用']),
        ctx.fixture.certId,
      );
      assert.equal(response.status, 503);
      assert.equal(response.body.code, ApiErrorCode.LLM_NOT_CONFIGURED);
      assert.equal(await uploadCount(ctx.userA), before);
    } finally {
      process.env.LLM_MOCK = previousMock;
      process.env.LLM_API_KEY = previousKey;
    }
  });

  test('上传后可轮询进度，取消后提炼不再写入草稿', async (t) => {
    if (!ready(t) || !ctx.fixture || !ctx.pool) return;
    const created = await upload(
      ctx.tokenA,
      'waiting.docx',
      docx(['等待提炼']),
      ctx.fixture.certId,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const job = created.body as unknown as JobView;
    assert.equal(job.status, 'pending');
    assert.equal(job.stage, 'uploading');
    assert.equal(job.progress, 20);
    assert.ok(job.estimatedMinutes >= 1);
    assert.equal(job.file.extension, 'docx');
    assert.deepEqual(job.drafts, []);

    const polled = await call(`/courseware/jobs/${job.id}`, ctx.tokenA);
    assert.equal(polled.status, 200);
    assert.equal((polled.body as unknown as JobView).status, 'pending');
    const hidden = await call(`/courseware/jobs/${job.id}`, ctx.tokenB);
    assert.equal(hidden.status, 404);

    const cancelled = await call(`/courseware/jobs/${job.id}/cancel`, ctx.tokenA, {
      method: 'POST',
    });
    assert.equal(cancelled.status, 200);
    assert.equal((cancelled.body as unknown as JobView).status, 'cancelled');
    const outcome = await runCoursewareExtraction(
      createPgExecutor(ctx.pool),
      { jobId: job.id, fileName: 'waiting.docx', bytes: docx(['等待提炼']) },
      { mode: 'mock' },
    );
    assert.equal(outcome.status, 'cancelled');
    const again = await call(`/courseware/jobs/${job.id}`, ctx.tokenA);
    assert.equal((again.body as unknown as JobView).drafts.length, 0);
    const blocked = await call(`/courseware/jobs/${job.id}/cancel`, ctx.tokenA, { method: 'POST' });
    assert.equal(blocked.status, 200);
  });

  test('mock 提炼成功后可勾选回树并进入刷题包，别人看不到', async (t) => {
    if (!ready(t) || !ctx.fixture || !ctx.pool) return;
    const created = await upload(
      ctx.tokenA,
      '生物.docx',
      docx(['光合作用', '细胞呼吸']),
      ctx.fixture.certId,
    );
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const pending = created.body as unknown as JobView;
    const outcome = await runStored(pending.id, { mode: 'mock' });
    assert.equal(outcome.status, 'succeeded');

    const done = await call(`/courseware/jobs/${pending.id}`, ctx.tokenA);
    const job = done.body as unknown as JobView;
    assert.equal(job.status, 'succeeded');
    assert.equal(job.stage, 'done');
    assert.equal(job.progress, 100);
    assert.deepEqual(
      job.drafts.map((draft) => draft.name),
      ['光合作用', '细胞呼吸'],
    );

    const stranger = await call(`/courseware/jobs/${job.id}/commit`, ctx.tokenB, {
      method: 'POST',
      body: JSON.stringify({ draftIds: job.drafts.map((draft) => draft.id) }),
    });
    assert.equal(stranger.status, 404);

    const committed = await call(`/courseware/jobs/${job.id}/commit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({
        draftIds: [job.drafts[0]!.id],
        packId: ctx.packId,
      }),
    });
    assert.equal(committed.status, 200, JSON.stringify(committed.body));
    const result = committed.body as {
      textbookName: string;
      knowledgePointIds: string[];
      packId: string;
    };
    assert.equal(result.textbookName, USER_COURSEWARE_TEXTBOOK);
    assert.equal(result.knowledgePointIds.length, 1);
    assert.equal(result.packId, ctx.packId);

    const repeated = await call(`/courseware/jobs/${job.id}/commit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ draftIds: [job.drafts[0]!.id], packId: ctx.packId }),
    });
    assert.equal(repeated.status, 200);
    assert.deepEqual(
      (repeated.body as { knowledgePointIds: string[] }).knowledgePointIds,
      result.knowledgePointIds,
    );
    const changed = await call(`/courseware/jobs/${job.id}/commit`, ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({ draftIds: job.drafts.map((draft) => draft.id) }),
    });
    assert.equal(changed.status, 409);

    const mine = await call(
      `/catalog/certificates/${ctx.fixture.certId}/knowledge-tree`,
      ctx.tokenA,
    );
    const mineTree = mine.body as unknown as TreeView;
    const textbook = mineTree.nodes.find((node) => node.name === USER_COURSEWARE_TEXTBOOK);
    assert.ok(textbook);
    assert.deepEqual(
      textbook?.children?.map((child) => child.name),
      ['光合作用'],
    );
    const theirs = await call(
      `/catalog/certificates/${ctx.fixture.certId}/knowledge-tree`,
      ctx.tokenB,
    );
    const theirNames = (theirs.body as unknown as TreeView).nodes.map((node) => node.name);
    assert.equal(theirNames.includes(USER_COURSEWARE_TEXTBOOK), false);

    const pack = await call(`/packs/${ctx.packId}`, ctx.tokenA);
    const ids = (pack.body as { knowledgePointIds: string[] }).knowledgePointIds;
    assert.ok(ids.includes(ctx.fixture.kpId));
    assert.ok(ids.includes(result.knowledgePointIds[0]!));

    const finished = await call(`/courseware/jobs/${job.id}/cancel`, ctx.tokenA, {
      method: 'POST',
    });
    assert.equal(finished.status, 409);
  });

  test('mock 提炼失败和未配置模型都会记在任务上', async (t) => {
    if (!ready(t) || !ctx.fixture || !ctx.pool) return;
    const failedUpload = await upload(
      ctx.tokenA,
      '失败.docx',
      docx(['有内容', EXTRACT_FAIL_MARKER]),
      ctx.fixture.certId,
    );
    assert.equal(failedUpload.status, 201);
    const failedJob = failedUpload.body as unknown as JobView;
    const failed = await runStored(failedJob.id, { mode: 'mock' });
    assert.equal(failed.status, 'failed');
    if (failed.status === 'failed') {
      assert.equal(failed.code, ApiErrorCode.LLM_INVALID_OUTPUT);
    }
    const viewed = await call(`/courseware/jobs/${failedJob.id}`, ctx.tokenA);
    assert.equal((viewed.body as unknown as JobView).status, 'failed');
    assert.equal((viewed.body as unknown as JobView).error?.code, ApiErrorCode.LLM_INVALID_OUTPUT);

    const missingUpload = await upload(
      ctx.tokenA,
      '缺钥匙.docx',
      docx(['光合作用']),
      ctx.fixture.certId,
    );
    const missingJob = missingUpload.body as unknown as JobView;
    const missing = await runStored(missingJob.id, {
      mode: 'unconfigured',
      message: '未配置 LLM_API_KEY。本地提炼请显式设置 LLM_MOCK=true，生产不要打开。',
    });
    assert.equal(missing.status, 'failed');
    if (missing.status === 'failed') {
      assert.equal(missing.code, ApiErrorCode.LLM_NOT_CONFIGURED);
    }
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过课件集成测试');
    return false;
  }
  return true;
}

async function runStored(jobId: string, options: Parameters<typeof runCoursewareExtraction>[2]) {
  const pool = ctx.pool;
  if (!pool) {
    throw new Error('没有数据库');
  }
  const meta = await pool.query<{ file_meta: { objectKey: string; fileName: string } }>(
    `
      SELECT u.file_meta
      FROM extract_jobs j
      JOIN user_uploads u ON u.id = j.upload_id
      WHERE j.id = $1
    `,
    [jobId],
  );
  const file = meta.rows[0]?.file_meta;
  if (!file) {
    throw new Error('没有课件文件');
  }
  const bytes = await createObjectStorage(readStorageEnv()).get(file.objectKey);
  return runCoursewareExtraction(
    createPgExecutor(pool),
    { jobId, fileName: file.fileName, bytes },
    options,
  );
}

async function upload(
  token: string | undefined,
  fileName: string,
  bytes: Buffer,
  certificateId: string,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const form = new FormData();
  form.set('certificateId', certificateId);
  form.set('fileName', fileName);
  form.set('file', new Blob([bytes]), fileName);
  const response = await fetch(`${ctx.base}/courseware/uploads`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
    body: form,
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
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
      name: '课件包',
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

async function uploadCount(userId: string): Promise<number> {
  const result = await ctx.pool!.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM user_uploads WHERE user_id = $1`,
    [userId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function insertFixture(pool: Pool): Promise<Fixture> {
  const fixture: Fixture = {
    domainId: randomUUID(),
    certId: randomUUID(),
    offlineCertId: randomUUID(),
    textbookId: randomUUID(),
    kpId: randomUUID(),
  };
  const suffix = fixture.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '课件领域', 'online', 90)`,
    [fixture.domainId, `cw-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order
      )
      VALUES
        ($1, $3, $4, '课件证书', 'online', 100, 60, ARRAY['single']::text[], 1),
        ($2, $3, $5, '课件下架证书', 'offline', 100, 60, ARRAY['single']::text[], 2)
    `,
    [
      fixture.certId,
      fixture.offlineCertId,
      fixture.domainId,
      `cw-cert-${suffix}`,
      `cw-off-${suffix}`,
    ],
  );
  await pool.query(
    `INSERT INTO textbooks (id, code, name, status, sort_order) VALUES ($1, $2, '官方教材', 'online', 1)`,
    [fixture.textbookId, `cw-book-${suffix}`],
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
      VALUES ($1, $2, NULL, $3, '官方知识点', 'knowledge_point', '围绕概念出题', 1, 'online', 1)
    `,
    [fixture.kpId, fixture.textbookId, `cw-kp-${suffix}`],
  );
  return fixture;
}

function docx(paragraphs: string[]): Buffer {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs
    .map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`)
    .join('')}</w:body></w:document>`;
  return zipStore([{ name: 'word/document.xml', data: Buffer.from(xml) }]);
}

function zipStore(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const checksum = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localFull = Buffer.concat([local, name, file.data]);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(localFull);
    centrals.push(Buffer.concat([central, name]));
    offset += localFull.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
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
