import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  type AdminCatalogTree,
  type AdminCertificate,
  type AdminDomain,
  type AdminKnowledgeNode,
  type AdminTextbookSummary,
  type CertificateList,
  type DomainList,
  type KnowledgeTree,
  type PackView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'catalog-admin';
const PASSWORD = 'catalog-secret';
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
  userId: string;
} = {
  ready: false,
  base: '',
  suffix: '',
  userId: '',
};

describe('admin catalog', { concurrency: 1 }, () => {
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
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool && ctx.suffix) {
      const like = `cat-${ctx.suffix}%`;
      if (ctx.userId) {
        await pool.query('DELETE FROM users WHERE id = $1', [ctx.userId]).catch(() => undefined);
      }
      await pool.query('DELETE FROM textbooks WHERE code LIKE $1', [like]).catch(() => undefined);
      await pool
        .query('DELETE FROM knowledge_points WHERE code LIKE $1', [like])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE code LIKE $1', [like])
        .catch(() => undefined);
      await pool.query('DELETE FROM domains WHERE code LIKE $1', [like]).catch(() => undefined);
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

  test('没有后管会话不能改目录', async (t) => {
    if (!ready(t)) {
      return;
    }
    const missing = await call('/admin/catalog/domains');
    assert.equal(missing.status, 401);
    assert.equal(missing.body.code, ApiErrorCode.UNAUTHORIZED);

    const login = await call('/auth/wechat/login', {
      method: 'POST',
      body: { code: `catalog-user-${ctx.suffix}`, nick: '目录同学' },
    });
    assert.equal(login.status, 200);
    const user = login.body as unknown as WechatLoginResponse;
    ctx.userId = user.user.id;

    const wechat = await call('/admin/catalog/domains', { token: user.token });
    assert.equal(wechat.status, 401);
    assert.equal(wechat.body.code, ApiErrorCode.UNAUTHORIZED);

    const admin = await adminToken();
    const extra = await call('/admin/catalog/domains', {
      method: 'POST',
      token: admin,
      body: { code: 'x', name: '多余字段', weight: 1 },
    });
    assert.equal(extra.status, 400);
    assert.equal(extra.body.code, ApiErrorCode.VALIDATION_ERROR);

    const empty = await call('/admin/catalog/domains', {
      method: 'POST',
      token: admin,
      body: {},
    });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.code, ApiErrorCode.VALIDATION_ERROR);
  });

  test('后管改过的目录会出现在小程序，证书下架后刷题包只可删除', async (t) => {
    if (!ready(t)) {
      return;
    }
    const admin = await adminToken();
    const user = await call('/auth/wechat/login', {
      method: 'POST',
      body: { code: `catalog-user-${ctx.suffix}`, nick: '目录同学' },
    });
    assert.equal(user.status, 200);
    const session = user.body as unknown as WechatLoginResponse;
    ctx.userId = session.user.id;
    const code = `cat-${ctx.suffix}`;

    const created = await call('/admin/catalog/domains', {
      method: 'POST',
      token: admin,
      body: { code: code.toUpperCase(), name: '目录测试', sortOrder: 9 },
    });
    assert.equal(created.status, 201);
    const domain = created.body as unknown as AdminDomain;
    assert.equal(domain.code, code);
    assert.equal(domain.status, 'online');

    const duplicate = await call('/admin/catalog/domains', {
      method: 'POST',
      token: admin,
      body: { code, name: '重复' },
    });
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, ApiErrorCode.VALIDATION_ERROR);

    const publicDomains = await call('/catalog/domains', { token: session.token });
    assert.equal(publicDomains.status, 200);
    assert.equal(
      (publicDomains.body as unknown as DomainList).items.some((item) => item.id === domain.id),
      true,
    );

    const badScore = await call(`/admin/catalog/domains/${domain.id}/certificates`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-bad`, name: '分数不对', totalScore: 90, passScore: 100 },
    });
    assert.equal(badScore.status, 400);
    assert.equal(badScore.body.code, ApiErrorCode.VALIDATION_ERROR);

    const certRes = await call(`/admin/catalog/domains/${domain.id}/certificates`, {
      method: 'POST',
      token: admin,
      body: {
        code: `${code}-a`,
        name: '目录证书',
        totalScore: 90,
        passScore: 60,
        enabledQuestionTypeCodes: ['single'],
      },
    });
    assert.equal(certRes.status, 201);
    const cert = certRes.body as unknown as AdminCertificate;
    assert.deepEqual(cert.enabledQuestionTypeCodes, ['single']);

    const otherRes = await call(`/admin/catalog/domains/${domain.id}/certificates`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-b`, name: '另一张证书', totalScore: 100 },
    });
    assert.equal(otherRes.status, 201);
    const other = otherRes.body as unknown as AdminCertificate;

    const publicCerts = await call(`/catalog/domains/${domain.id}/certificates`, {
      token: session.token,
    });
    assert.equal(publicCerts.status, 200);
    const listed = (publicCerts.body as unknown as CertificateList).items.find(
      (item) => item.id === cert.id,
    );
    assert.equal(listed?.totalScore, 90);
    assert.deepEqual(listed?.enabledQuestionTypeCodes, ['single']);

    const bookRes = await call(`/admin/catalog/certificates/${cert.id}/textbooks`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-book`, name: '目录教材' },
    });
    assert.equal(bookRes.status, 201);
    const book = bookRes.body as unknown as AdminTextbookSummary;

    const emptyBook = await call(`/admin/catalog/certificates/${cert.id}/textbooks`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-empty`, name: '空教材' },
    });
    assert.equal(emptyBook.status, 201);

    const groupRes = await call(`/admin/catalog/textbooks/${book.id}/nodes`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-group`, name: '目录分组', kind: 'group' },
    });
    assert.equal(groupRes.status, 201);
    const group = groupRes.body as unknown as AdminKnowledgeNode;
    assert.equal(group.kind, 'group');
    assert.equal(group.promptHint, null);

    const childRes = await call(`/admin/catalog/textbooks/${book.id}/nodes`, {
      method: 'POST',
      token: admin,
      body: {
        code: `${code}-child`,
        name: '目录子知识点',
        parentId: group.id,
        promptHint: '围绕目录子知识点出题',
      },
    });
    assert.equal(childRes.status, 201);
    const child = childRes.body as unknown as AdminKnowledgeNode;
    assert.equal(child.level, 2);
    assert.equal(child.parentId, group.id);

    const moved = await call(`/admin/catalog/knowledge-points/${child.id}`, {
      method: 'PUT',
      token: admin,
      body: { parentId: null },
    });
    assert.equal(moved.status, 200);
    assert.equal((moved.body as unknown as AdminKnowledgeNode).level, 1);

    const nested = await call(`/admin/catalog/knowledge-points/${child.id}`, {
      method: 'PUT',
      token: admin,
      body: { parentId: group.id },
    });
    assert.equal(nested.status, 200);
    assert.equal((nested.body as unknown as AdminKnowledgeNode).level, 2);

    const freeRes = await call(`/admin/catalog/certificates/${cert.id}/knowledge-points`, {
      method: 'POST',
      token: admin,
      body: { code: `${code}-free`, name: '独立知识点', promptHint: '独立出题' },
    });
    assert.equal(freeRes.status, 201);
    const free = freeRes.body as unknown as AdminKnowledgeNode;

    await ctx.pool?.query(
      `
        INSERT INTO textbooks (id, code, name, status, sort_order, owner_user_id)
        VALUES ($1, $2, '用户课件', 'online', 1, $3)
      `,
      [randomUUID(), `${code}-user`, ctx.userId],
    );
    const userBook = await ctx.pool?.query<{ id: string }>(
      `SELECT id FROM textbooks WHERE code = $1`,
      [`${code}-user`],
    );
    const userBookId = userBook?.rows[0]?.id;
    assert.ok(userBookId);
    await ctx.pool?.query(
      `INSERT INTO textbook_certificates (textbook_id, certificate_id) VALUES ($1, $2)`,
      [userBookId, cert.id],
    );

    const adminTree = await call(`/admin/catalog/certificates/${cert.id}/tree`, { token: admin });
    assert.equal(adminTree.status, 200);
    const maintained = adminTree.body as unknown as AdminCatalogTree;
    assert.equal(JSON.stringify(maintained).includes(ctx.userId), false);
    assert.equal(JSON.stringify(maintained).includes('用户课件'), false);
    assert.equal(
      maintained.textbooks.some((item) => item.name === '空教材' && item.nodes.length === 0),
      true,
    );
    const maintainedBook = maintained.textbooks.find((item) => item.id === book.id);
    assert.equal(
      maintainedBook?.nodes.some((node) => node.name === '目录分组'),
      true,
    );
    assert.equal(findNode(maintainedBook?.nodes ?? [], '目录子知识点')?.parentId, group.id);

    const linked = await call(`/admin/catalog/certificates/${other.id}/textbooks/link`, {
      method: 'POST',
      token: admin,
      body: { textbookId: book.id },
    });
    assert.equal(linked.status, 201);
    assert.equal(
      (linked.body as unknown as AdminTextbookSummary).certificateIds.includes(other.id),
      true,
    );
    const otherTree = await call(`/admin/catalog/certificates/${other.id}/tree`, { token: admin });
    assert.equal(
      (otherTree.body as unknown as AdminCatalogTree).textbooks.some((item) => item.id === book.id),
      true,
    );
    const unlinked = await call(`/admin/catalog/certificates/${other.id}/textbooks/${book.id}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(unlinked.status, 200);
    const otherAfter = await call(`/admin/catalog/certificates/${other.id}/tree`, { token: admin });
    assert.equal(
      (otherAfter.body as unknown as AdminCatalogTree).textbooks.some(
        (item) => item.id === book.id,
      ),
      false,
    );

    const hiddenUser = await call(`/admin/catalog/textbooks/${userBookId}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(hiddenUser.status, 404);

    const publicTree = await call(`/catalog/certificates/${cert.id}/knowledge-tree`, {
      token: session.token,
    });
    assert.equal(publicTree.status, 200);
    const visible = publicTree.body as unknown as KnowledgeTree;
    assert.deepEqual(childNames(visible, '目录教材'), ['目录子知识点']);
    assert.equal(
      visible.nodes.some((node) => node.name === '独立知识点' && node.kind === 'knowledge_point'),
      true,
    );
    assert.equal(JSON.stringify(visible).includes('目录分组'), false);
    assert.equal(JSON.stringify(visible).includes('空教材'), false);
    assert.equal(JSON.stringify(visible).includes('用户课件'), false);

    const offlinePoint = await call(`/admin/catalog/knowledge-points/${child.id}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'offline' },
    });
    assert.equal(offlinePoint.status, 200);
    const hiddenTree = await call(`/catalog/certificates/${cert.id}/knowledge-tree`, {
      token: session.token,
    });
    assert.equal(JSON.stringify(hiddenTree.body).includes('目录子知识点'), false);
    const stillThere = await call(`/admin/catalog/certificates/${cert.id}/tree`, { token: admin });
    assert.equal(
      findNode(
        (stillThere.body as unknown as AdminCatalogTree).textbooks.find(
          (item) => item.id === book.id,
        )?.nodes ?? [],
        '目录子知识点',
      )?.status,
      'offline',
    );
    const onlinePoint = await call(`/admin/catalog/knowledge-points/${child.id}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'online' },
    });
    assert.equal(onlinePoint.status, 200);

    const packRes = await call('/packs', {
      method: 'POST',
      token: session.token,
      body: { domainId: domain.id, certId: cert.id, knowledgePointIds: [child.id] },
    });
    assert.equal(packRes.status, 201);
    const pack = packRes.body as unknown as PackView;

    const blockedPoint = await call(`/admin/catalog/knowledge-points/${child.id}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(blockedPoint.status, 409);
    assert.equal(blockedPoint.body.code, ApiErrorCode.CATALOG_IN_USE);
    const blockedBook = await call(`/admin/catalog/textbooks/${book.id}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(blockedBook.status, 409);
    assert.equal(blockedBook.body.code, ApiErrorCode.CATALOG_IN_USE);

    const domainOff = await call(`/admin/catalog/domains/${domain.id}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'offline' },
    });
    assert.equal(domainOff.status, 200);
    const hiddenDomains = await call('/catalog/domains', { token: session.token });
    assert.equal(
      (hiddenDomains.body as unknown as DomainList).items.some((item) => item.id === domain.id),
      false,
    );
    const renamed = await call(`/packs/${pack.id}`, {
      method: 'PUT',
      token: session.token,
      body: { name: '领域下架仍可改' },
    });
    assert.equal(renamed.status, 200);
    assert.equal((renamed.body as unknown as PackView).unavailable, false);

    const domainOn = await call(`/admin/catalog/domains/${domain.id}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'online' },
    });
    assert.equal(domainOn.status, 200);

    const certOff = await call(`/admin/catalog/certificates/${cert.id}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'offline' },
    });
    assert.equal(certOff.status, 200);
    const afterOff = await call(`/catalog/domains/${domain.id}/certificates`, {
      token: session.token,
    });
    assert.equal(
      (afterOff.body as unknown as CertificateList).items.some((item) => item.id === cert.id),
      false,
    );
    const treeGone = await call(`/catalog/certificates/${cert.id}/knowledge-tree`, {
      token: session.token,
    });
    assert.equal(treeGone.status, 404);
    const frozen = await call(`/packs/${pack.id}`, { token: session.token });
    assert.equal((frozen.body as unknown as PackView).unavailable, true);
    const blockedRename = await call(`/packs/${pack.id}`, {
      method: 'PUT',
      token: session.token,
      body: { name: '不能改' },
    });
    assert.equal(blockedRename.status, 409);
    assert.equal(blockedRename.body.code, ApiErrorCode.PACK_UNAVAILABLE);
    const blockedCert = await call(`/admin/catalog/certificates/${cert.id}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(blockedCert.status, 409);
    assert.equal(blockedCert.body.code, ApiErrorCode.CATALOG_IN_USE);

    const removedPack = await call(`/packs/${pack.id}`, { method: 'DELETE', token: session.token });
    assert.equal(removedPack.status, 200);

    const blockedDomain = await call(`/admin/catalog/domains/${domain.id}`, {
      method: 'DELETE',
      token: admin,
    });
    assert.equal(blockedDomain.status, 409);
    assert.equal(blockedDomain.body.code, ApiErrorCode.CATALOG_IN_USE);

    assert.equal(
      (await call(`/admin/catalog/textbooks/${book.id}`, { method: 'DELETE', token: admin }))
        .status,
      200,
    );
    assert.equal(
      (await call(`/admin/catalog/knowledge-points/${free.id}`, { method: 'DELETE', token: admin }))
        .status,
      200,
    );
    assert.equal(
      (await call(`/admin/catalog/certificates/${cert.id}`, { method: 'DELETE', token: admin }))
        .status,
      200,
    );
    assert.equal(
      (await call(`/admin/catalog/certificates/${other.id}`, { method: 'DELETE', token: admin }))
        .status,
      200,
    );
    assert.equal(
      (await call(`/admin/catalog/domains/${domain.id}`, { method: 'DELETE', token: admin }))
        .status,
      200,
    );
    const gone = await call(`/admin/catalog/domains/${domain.id}`, {
      method: 'PUT',
      token: admin,
      body: { name: '没有了' },
    });
    assert.equal(gone.status, 404);
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('PostgreSQL 或 Redis 不可用，跳过目录维护集成测试');
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
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function childNames(tree: KnowledgeTree, textbookName: string): string[] {
  const textbook = tree.nodes.find(
    (node) => node.kind === 'textbook' && node.name === textbookName,
  );
  if (!textbook || textbook.kind !== 'textbook') {
    return [];
  }
  return textbook.children.map((child) => child.name);
}

function findNode(
  nodes: readonly AdminKnowledgeNode[],
  name: string,
): AdminKnowledgeNode | undefined {
  for (const node of nodes) {
    if (node.name === name) {
      return node;
    }
    const child = findNode(node.children, name);
    if (child) {
      return child;
    }
  }
  return undefined;
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
