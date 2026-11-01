import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type CertificateList,
  type DomainList,
  type KnowledgeTree,
  type PackList,
  type PackView,
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
  certA: string;
  certB: string;
  certOffline: string;
  textbookA: string;
  textbookB: string;
  textbookOffline: string;
  kp1: string;
  kp2: string;
  kpGroup: string;
  kpChild: string;
  kpOffline: string;
  kpHiddenBook: string;
  kpIndependent: string;
  kpOther: string;
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
  fixture?: Fixture;
} = {
  ready: false,
  base: '',
  tokens: [],
  userA: '',
  userB: '',
  tokenA: '',
  tokenB: '',
};

describe('catalog and packs', { concurrency: 1 }, () => {
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
    ctx.fixture = await insertFixture(ctx.pool);

    const first = await login('pack-a');
    const second = await login('pack-b');
    ctx.userA = first.user.id;
    ctx.tokenA = first.token;
    ctx.userB = second.user.id;
    ctx.tokenB = second.token;
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.fixture) {
      const ids = [ctx.userA, ctx.userB].filter(Boolean);
      if (ids.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids])
          .catch(() => undefined);
      }
      const knowledgeIds = [
        ctx.fixture.kp1,
        ctx.fixture.kp2,
        ctx.fixture.kpChild,
        ctx.fixture.kpOffline,
        ctx.fixture.kpHiddenBook,
        ctx.fixture.kpIndependent,
        ctx.fixture.kpOther,
        ctx.fixture.kpGroup,
      ];
      await pool
        .query('DELETE FROM knowledge_points WHERE id = ANY($1::uuid[])', [knowledgeIds])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = ANY($1::uuid[])', [
          [ctx.fixture.textbookA, ctx.fixture.textbookB, ctx.fixture.textbookOffline],
        ])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE id = ANY($1::uuid[])', [
          [ctx.fixture.certA, ctx.fixture.certB, ctx.fixture.certOffline],
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

  test('目录只返回上架证书，树是教材加知识点', async (t) => {
    if (!ready(t)) {
      return;
    }
    const anonymous = await call('/catalog/domains');
    assert.equal(anonymous.status, 401);
    assert.equal(anonymous.body.code, ApiErrorCode.UNAUTHORIZED);

    const domains = await call('/catalog/domains', ctx.tokenA);
    assert.equal(domains.status, 200);
    const domainItems = (domains.body as unknown as DomainList).items;
    const teacher = domainItems.find((item) => item.code === 'teacher');
    const finance = domainItems.find((item) => item.code === 'finance');
    const fixtureDomain = domainItems.find((item) => item.id === ctx.fixture?.domainId);
    assert.ok(teacher);
    assert.ok(finance);
    assert.equal(fixtureDomain?.name, '集成领域');

    const certs = await call(`/catalog/domains/${teacher.id}/certificates`, ctx.tokenA);
    assert.equal(certs.status, 200);
    const certItems = (certs.body as unknown as CertificateList).items;
    const secondary = certItems.find((item) => item.code === 'teacher-secondary');
    const primary = certItems.find((item) => item.code === 'teacher-primary');
    assert.ok(secondary);
    assert.ok(primary);
    assert.equal(secondary.totalScore, 120);
    assert.equal(secondary.passScore, 70);
    assert.deepEqual(secondary.enabledQuestionTypeCodes, ['single', 'multi', 'judge']);

    const secondaryTree = await treeOf(secondary.id);
    assert.equal(secondaryTree.certificateName, '中学教师资格');
    const quality = textbookNamed(secondaryTree, '综合素质');
    assert.ok(quality.children.some((child) => child.name === '职业理念'));
    assert.ok(quality.children.some((child) => child.name === '逻辑思维'));
    assert.equal(
      flatNames(secondaryTree).some((name) => name === '教学评价' || name === '综合素质章节'),
      false,
    );
    assert.ok(
      secondaryTree.nodes.some(
        (node) => node.kind === 'knowledge_point' && node.name === '文化素养',
      ),
    );

    const primaryTree = await treeOf(primary.id);
    assert.ok(
      textbookNamed(primaryTree, '综合素质').children.some((child) => child.name === '职业理念'),
    );
    assert.equal(flatNames(primaryTree).includes('会计概述'), false);

    const financeCerts = await call(`/catalog/domains/${finance.id}/certificates`, ctx.tokenA);
    const junior = (financeCerts.body as unknown as CertificateList).items.find(
      (item) => item.code === 'junior-accountant',
    );
    assert.ok(junior);
    const juniorTree = await treeOf(junior.id);
    assert.ok(flatNames(juniorTree).includes('会计概述'));
    assert.equal(flatNames(juniorTree).includes('职业理念'), false);

    const fixtureCerts = await call(
      `/catalog/domains/${ctx.fixture?.domainId}/certificates`,
      ctx.tokenA,
    );
    const fixtureItems = (fixtureCerts.body as unknown as CertificateList).items;
    assert.equal(
      fixtureItems.some((item) => item.id === ctx.fixture?.certOffline),
      false,
    );
    assert.equal(fixtureItems.length, 2);

    const fixtureTree = await treeOf(ctx.fixture?.certA ?? '');
    const names = new Set(flatNames(fixtureTree));
    for (const expected of ['集成教材', '知识点一', '知识点二', '分组下的知识点', '独立知识点']) {
      assert.equal(names.has(expected), true, expected);
    }
    assert.equal(names.has('分组节点'), false);
    assert.equal(names.has('下架知识点'), false);
    assert.equal(names.has('下架教材知识点'), false);

    const missing = await call(
      `/catalog/certificates/${ctx.fixture?.certOffline}/knowledge-tree`,
      ctx.tokenA,
    );
    assert.equal(missing.status, 404);

    const placeholder = await call('/certificates');
    assert.equal(placeholder.status, 200);
    assert.equal((placeholder.body as { implemented?: boolean }).implemented, false);

    const tables = await ctx.pool?.query<{
      quiz_sessions: string | null;
      paper_questions: string | null;
      wrong_items: string | null;
      prompt_templates: string | null;
      user_uploads: string | null;
      extract_jobs: string | null;
    }>(`
      SELECT
        to_regclass('public.quiz_sessions') AS quiz_sessions,
        to_regclass('public.paper_questions') AS paper_questions,
        to_regclass('public.wrong_items') AS wrong_items,
        to_regclass('public.prompt_templates') AS prompt_templates,
        to_regclass('public.user_uploads') AS user_uploads,
        to_regclass('public.extract_jobs') AS extract_jobs
    `);
    const row = tables?.rows[0];
    assert.ok(row?.quiz_sessions);
    assert.ok(row?.paper_questions);
    assert.ok(row?.wrong_items);
    assert.ok(row?.prompt_templates);
    assert.ok(row?.user_uploads);
    assert.ok(row?.extract_jobs);

    const weight = await ctx.pool?.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'knowledge_points' AND column_name = 'weight'`,
    );
    assert.equal(weight?.rowCount, 0);
  });

  test('刷题包可建切改删，证书下架后只可删除', async (t) => {
    if (!ready(t)) {
      return;
    }
    const fixture = ctx.fixture;
    assert.ok(fixture);

    const noToken = await call('/packs', undefined, { method: 'POST', body: '{}' });
    assert.equal(noToken.status, 401);

    const empty = await call('/packs', ctx.tokenA, {
      method: 'POST',
      body: JSON.stringify({
        domainId: fixture.domainId,
        certId: fixture.certA,
        knowledgePointIds: [],
      }),
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, ApiErrorCode.VALIDATION_ERROR);

    const textbookRejected = await createPack(ctx.tokenA, fixture.certA, [fixture.textbookA]);
    assert.equal(textbookRejected.status, 400);
    const groupRejected = await createPack(ctx.tokenA, fixture.certA, [fixture.kpGroup]);
    assert.equal(groupRejected.status, 400);
    const otherRejected = await createPack(ctx.tokenA, fixture.certA, [fixture.kpOther]);
    assert.equal(otherRejected.status, 400);
    const duplicate = await createPack(ctx.tokenA, fixture.certA, [fixture.kp1, fixture.kp1]);
    assert.equal(duplicate.status, 400);

    const created = await createPack(
      ctx.tokenA,
      fixture.certA,
      [fixture.kp1, fixture.kpIndependent],
      '中学包',
    );
    assert.equal(created.status, 201);
    const pack1 = created.body as unknown as PackView;
    assert.equal(pack1.active, true);
    assert.equal(pack1.unavailable, false);
    assert.equal(pack1.name, '中学包');
    assert.deepEqual(pack1.knowledgePointIds, [fixture.kp1, fixture.kpIndependent]);
    assert.equal(pack1.knowledgePointCount, 2);
    assert.equal(pack1.domainName, '集成领域');

    const renamed = await call(`/packs/${pack1.id}`, ctx.tokenA, {
      method: 'PUT',
      body: JSON.stringify({ name: '中学冲刺' }),
    });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.body as unknown as PackView).name, '中学冲刺');

    const pack2Response = await createPack(ctx.tokenA, fixture.certB, [fixture.kpOther]);
    assert.equal(pack2Response.status, 201);
    const pack2 = pack2Response.body as unknown as PackView;
    assert.equal(pack2.active, true);
    assert.equal(pack2.name, '证书乙');

    const listed = await call('/packs', ctx.tokenA);
    const list = listed.body as unknown as PackList;
    assert.equal(list.activePackId, pack2.id);
    assert.equal(list.items.find((item) => item.id === pack1.id)?.active, false);

    const activated = await call(`/packs/${pack1.id}/activate`, ctx.tokenA, { method: 'POST' });
    assert.equal(activated.status, 200);
    assert.equal((activated.body as unknown as PackView).active, true);

    const foreign = await call(`/packs/${pack1.id}`, ctx.tokenB);
    assert.equal(foreign.status, 404);
    const foreignWrite = await call(`/packs/${pack1.id}`, ctx.tokenB, {
      method: 'PUT',
      body: JSON.stringify({ name: '越权' }),
    });
    assert.equal(foreignWrite.status, 404);

    await ctx.pool?.query(`UPDATE certificates SET status = 'offline' WHERE id = $1`, [
      fixture.certA,
    ]);

    const unavailable = await call(`/packs/${pack1.id}`, ctx.tokenA);
    assert.equal(unavailable.status, 200);
    assert.equal((unavailable.body as unknown as PackView).unavailable, true);
    const stillOpen = await call(`/packs/${pack2.id}`, ctx.tokenA);
    assert.equal((stillOpen.body as unknown as PackView).unavailable, false);

    const blockedRename = await call(`/packs/${pack1.id}`, ctx.tokenA, {
      method: 'PUT',
      body: JSON.stringify({ name: '不能改' }),
    });
    assert.equal(blockedRename.status, 409);
    assert.equal(blockedRename.body.code, ApiErrorCode.PACK_UNAVAILABLE);
    const blockedPoints = await call(`/packs/${pack1.id}`, ctx.tokenA, {
      method: 'PUT',
      body: JSON.stringify({ knowledgePointIds: [fixture.kp2] }),
    });
    assert.equal(blockedPoints.status, 409);

    const blockedCreate = await createPack(ctx.tokenA, fixture.certA, [fixture.kp2]);
    assert.equal(blockedCreate.status, 400);

    const kept = await call(`/packs/${pack1.id}/activate`, ctx.tokenA, { method: 'POST' });
    assert.equal(kept.status, 200);
    assert.equal((kept.body as unknown as PackView).unavailable, true);

    const removed = await call(`/packs/${pack1.id}`, ctx.tokenA, { method: 'DELETE' });
    assert.equal(removed.status, 200);
    assert.equal((removed.body as { activePackId?: string }).activePackId, pack2.id);

    const afterDelete = await call('/packs', ctx.tokenA);
    const afterList = afterDelete.body as unknown as PackList;
    assert.equal(afterList.activePackId, pack2.id);
    assert.equal(
      afterList.items.some((item) => item.id === pack1.id),
      false,
    );

    const removedLast = await call(`/packs/${pack2.id}`, ctx.tokenA, { method: 'DELETE' });
    assert.equal(removedLast.status, 200);
    assert.equal((removedLast.body as { activePackId?: string | null }).activePackId, null);
    const none = await call('/packs', ctx.tokenA);
    assert.equal((none.body as unknown as PackList).activePackId, null);
    assert.equal((none.body as unknown as PackList).items.length, 0);

    const hiddenTree = await call(
      `/catalog/certificates/${fixture.certA}/knowledge-tree`,
      ctx.tokenA,
    );
    assert.equal(hiddenTree.status, 404);
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过刷题包集成测试');
    return false;
  }
  return true;
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
  name?: string,
) {
  return call('/packs', token, {
    method: 'POST',
    body: JSON.stringify({
      domainId: ctx.fixture?.domainId,
      certId,
      knowledgePointIds,
      ...(name ? { name } : {}),
    }),
  });
}

async function treeOf(certificateId: string): Promise<KnowledgeTree> {
  const response = await call(`/catalog/certificates/${certificateId}/knowledge-tree`, ctx.tokenA);
  assert.equal(response.status, 200);
  return response.body as unknown as KnowledgeTree;
}

function textbookNamed(tree: KnowledgeTree, name: string) {
  const node = tree.nodes.find((item) => item.kind === 'textbook' && item.name === name);
  assert.ok(node && node.kind === 'textbook');
  if (!node || node.kind !== 'textbook') {
    throw new Error(`缺少教材 ${name}`);
  }
  return node;
}

function flatNames(tree: KnowledgeTree): string[] {
  const names: string[] = [];
  for (const node of tree.nodes) {
    names.push(node.name);
    if (node.kind === 'textbook') {
      names.push(...node.children.map((child) => child.name));
    }
  }
  return names;
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
    certA: randomUUID(),
    certB: randomUUID(),
    certOffline: randomUUID(),
    textbookA: randomUUID(),
    textbookB: randomUUID(),
    textbookOffline: randomUUID(),
    kp1: randomUUID(),
    kp2: randomUUID(),
    kpGroup: randomUUID(),
    kpChild: randomUUID(),
    kpOffline: randomUUID(),
    kpHiddenBook: randomUUID(),
    kpIndependent: randomUUID(),
    kpOther: randomUUID(),
  };
  const suffix = fixture.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '集成领域', 'online', 50)`,
    [fixture.domainId, `it-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order)
      VALUES
        ($1, $4, $5, '证书甲', 'online', 100, 60, ARRAY['single']::text[], 1),
        ($2, $4, $6, '证书乙', 'online', 100, 60, ARRAY['single']::text[], 2),
        ($3, $4, $7, '证书下架', 'offline', 100, 60, ARRAY['single']::text[], 3)
    `,
    [
      fixture.certA,
      fixture.certB,
      fixture.certOffline,
      fixture.domainId,
      `it-cert-a-${suffix}`,
      `it-cert-b-${suffix}`,
      `it-cert-off-${suffix}`,
    ],
  );
  await pool.query(
    `
      INSERT INTO textbooks (id, code, name, status, sort_order)
      VALUES
        ($1, $4, '集成教材', 'online', 1),
        ($2, $5, '另一教材', 'online', 1),
        ($3, $6, '下架教材', 'offline', 2)
    `,
    [
      fixture.textbookA,
      fixture.textbookB,
      fixture.textbookOffline,
      `it-book-a-${suffix}`,
      `it-book-b-${suffix}`,
      `it-book-off-${suffix}`,
    ],
  );
  await pool.query(
    `
      INSERT INTO textbook_certificates (textbook_id, certificate_id)
      VALUES ($1, $3), ($2, $4), ($5, $3)
    `,
    [fixture.textbookA, fixture.textbookB, fixture.certA, fixture.certB, fixture.textbookOffline],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES
        ($1, $2, NULL, $3, '知识点一', 'knowledge_point', '提示一', 1, 'online', 1),
        ($4, $2, NULL, $5, '知识点二', 'knowledge_point', '提示二', 1, 'online', 2),
        ($6, $2, NULL, $7, '分组节点', 'group', NULL, 1, 'online', 3),
        ($8, $2, NULL, $9, '下架知识点', 'knowledge_point', '提示', 1, 'offline', 4),
        ($10, $11, NULL, $12, '下架教材知识点', 'knowledge_point', '提示', 1, 'online', 1),
        ($13, NULL, NULL, $14, '独立知识点', 'knowledge_point', '提示', 1, 'online', 1),
        ($15, $16, NULL, $17, '其他证书知识点', 'knowledge_point', '提示', 1, 'online', 1)
    `,
    [
      fixture.kp1,
      fixture.textbookA,
      `it-kp-1-${suffix}`,
      fixture.kp2,
      `it-kp-2-${suffix}`,
      fixture.kpGroup,
      `it-kp-group-${suffix}`,
      fixture.kpOffline,
      `it-kp-off-${suffix}`,
      fixture.kpHiddenBook,
      fixture.textbookOffline,
      `it-kp-hidden-${suffix}`,
      fixture.kpIndependent,
      `it-kp-free-${suffix}`,
      fixture.kpOther,
      fixture.textbookB,
      `it-kp-other-${suffix}`,
    ],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES ($1, $2, $3, $4, '分组下的知识点', 'knowledge_point', '提示', 2, 'online', 5)
    `,
    [fixture.kpChild, fixture.textbookA, fixture.kpGroup, `it-kp-child-${suffix}`],
  );
  await pool.query(
    `INSERT INTO knowledge_point_certificates (knowledge_point_id, certificate_id) VALUES ($1, $2)`,
    [fixture.kpIndependent, fixture.certA],
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
