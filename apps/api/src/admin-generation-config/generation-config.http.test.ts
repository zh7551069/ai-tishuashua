import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mockAiQuestions, type WechatLoginResponse } from '@tishuashua/shared';
import {
  createPgExecutor,
  runQuizGeneration,
  type SqlExecutor,
} from '@tishuashua/shared/generation';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const USERNAME = 'tb11-admin';
const PASSWORD = 'tb11-secret';
const DOMAIN_ID = '22222222-2222-4222-8222-222222222222';
const CERT_ID = '22222222-2222-4222-8222-222222222201';
const KP_ID = '22222222-2222-4222-8222-222222222401';
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
  'LLM_MOCK',
  'LLM_API_KEY',
] as const;

const savedEnv = new Map<string, string | undefined>();
const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  admin: string;
  userIds: string[];
  promptIds: string[];
  typeCodes: string[];
} = {
  ready: false,
  base: '',
  admin: '',
  userIds: [],
  promptIds: [],
  typeCodes: [],
};

describe('TB-11 generation config', { concurrency: 1 }, () => {
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
    process.env.LLM_MOCK = 'true';
    process.env.LLM_API_KEY = '';
    process.env.RATE_LIMIT_ADMIN_API_MAX = '100000';
    process.env.RATE_LIMIT_ADMIN_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_API_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_IP_MAX = '100000';
    process.env.RATE_LIMIT_WECHAT_LOGIN_MAX = '100000';

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 2 });
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
    ctx.admin = await adminToken();
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool) {
      if (ctx.promptIds.length > 0) {
        await pool
          .query('DELETE FROM prompt_template_versions WHERE template_id = ANY($1::uuid[])', [
            ctx.promptIds,
          ])
          .catch(() => undefined);
        await pool
          .query('DELETE FROM prompt_templates WHERE id = ANY($1::uuid[])', [ctx.promptIds])
          .catch(() => undefined);
      }
      await pool
        .query('DELETE FROM cert_question_type_configs WHERE certificate_id = $1', [CERT_ID])
        .catch(() => undefined);
      if (ctx.typeCodes.length > 0) {
        await pool
          .query('DELETE FROM question_types WHERE code = ANY($1::text[])', [ctx.typeCodes])
          .catch(() => undefined);
      }
      for (const userId of ctx.userIds) {
        await pool
          .query('DELETE FROM quiz_generation_logs WHERE user_id = $1', [userId])
          .catch(() => undefined);
        await pool.query('DELETE FROM users WHERE id = $1', [userId]).catch(() => undefined);
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

  test('草稿、发布快照、回滚和锁定', async (t) => {
    if (!ready(t)) {
      return;
    }
    const code = `gen_tb11_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const created = await call('/admin/prompt-templates', {
      method: 'POST',
      token: ctx.admin,
      body: {
        name: 'TB11 草稿',
        code,
        scope: 'certificate',
        scopeRefId: CERT_ID,
        systemPrompt: '你是出题助手',
        userPromptTemplate: '未知 {{foo}}',
        variables: ['foo'],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = String(created.body.id);
    ctx.promptIds.push(id);
    assert.equal(created.body.status, 'draft');
    assert.equal(created.body.version, 0);
    assert.equal(created.body.hasDirtyDraft, true);

    const listed = await call(`/admin/prompt-templates?q=${code}`, { token: ctx.admin });
    assert.equal(listed.status, 200);
    const listedItem = (listed.body.items as Array<Record<string, unknown>>)[0];
    assert.equal(listedItem?.code, code);
    assert.equal('templates' in (listedItem ?? {}), false);

    const badPublish = await call(`/admin/prompt-templates/${id}/publish`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(badPublish.status, 400);
    assert.match(String(badPublish.body.message), /\{\{foo\}\}/);

    const saved = await call(`/admin/prompt-templates/${id}`, {
      method: 'PUT',
      token: ctx.admin,
      body: {
        systemPrompt: '你是出题助手 TB11_SYS',
        userPromptTemplate: '证书 {{certificateName}}。TB11_PUBLISHED。共 {{count}} 题。',
        variables: ['certificateName', 'count'],
      },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));

    const published = await call(`/admin/prompt-templates/${id}/publish`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(published.status, 200, JSON.stringify(published.body));
    assert.equal(published.body.version, 1);
    const versionOne = await versionBody(id, 1);
    assert.match(JSON.stringify(versionOne), /TB11_PUBLISHED/);

    const dirty = await call(`/admin/prompt-templates/${id}`, {
      method: 'PUT',
      token: ctx.admin,
      body: {
        systemPrompt: '你是出题助手 TB11_SYS',
        userPromptTemplate: '证书 {{certificateName}}。TB11_DIRTY。共 {{count}} 题。',
      },
    });
    assert.equal(dirty.status, 200, JSON.stringify(dirty.body));
    assert.equal(dirty.body.hasDirtyDraft, true);
    assert.match(JSON.stringify(await versionBody(id, 1)), /TB11_PUBLISHED/);
    assert.equal(JSON.stringify(await versionBody(id, 1)).includes('TB11_DIRTY'), false);

    const first = await generateAndCapture();
    assert.match(first.prompt.user, /TB11_PUBLISHED/);
    assert.equal(first.prompt.user.includes('TB11_DIRTY'), false);
    assert.equal(first.log.used_builtin, false);
    assert.equal(first.log.template_code, code);
    assert.equal(Number(first.log.template_version), 1);
    assert.equal(first.log.success, true);

    const again = await call(`/admin/prompt-templates/${id}/publish`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(again.status, 200, JSON.stringify(again.body));
    assert.equal(again.body.version, 2);
    assert.match(JSON.stringify(await versionBody(id, 1)), /TB11_PUBLISHED/);
    assert.equal(JSON.stringify(await versionBody(id, 1)).includes('TB11_DIRTY'), false);
    assert.match(JSON.stringify(await versionBody(id, 2)), /TB11_DIRTY/);

    const second = await generateAndCapture();
    assert.match(second.prompt.user, /TB11_DIRTY/);
    assert.equal(Number(second.log.template_version), 2);

    const rolled = await call(`/admin/prompt-templates/${id}/rollback`, {
      method: 'POST',
      token: ctx.admin,
      body: { version: 1 },
    });
    assert.equal(rolled.status, 200, JSON.stringify(rolled.body));
    assert.equal(rolled.body.version, 3);
    assert.equal(JSON.stringify(await versionBody(id, 3)), JSON.stringify(await versionBody(id, 1)));
    assert.match(JSON.stringify(await versionBody(id, 1)), /TB11_PUBLISHED/);
    const third = await generateAndCapture();
    assert.match(third.prompt.user, /TB11_PUBLISHED/);
    assert.equal(third.prompt.user.includes('TB11_DIRTY'), false);
    assert.equal(Number(third.log.template_version), 3);

    const audits = await requiredPool().query<{ action: string }>(
      `
        SELECT action
        FROM admin_audit_logs
        WHERE target = $1
        ORDER BY id ASC
      `,
      [`prompt:${code}`],
    );
    const actions = audits.rows.map((row) => row.action);
    assert.ok(actions.includes('prompt.publish'));
    assert.ok(actions.includes('prompt.rollback'));
    const rollback = await requiredPool().query<{ after: { version?: number; rolledBackFrom?: number } }>(
      `
        SELECT after
        FROM admin_audit_logs
        WHERE target = $1 AND action = 'prompt.rollback'
        ORDER BY id DESC
        LIMIT 1
      `,
      [`prompt:${code}`],
    );
    assert.equal(rollback.rows[0]?.after.version, 3);
    assert.equal(rollback.rows[0]?.after.rolledBackFrom, 1);

    const locked = await call(`/admin/prompt-templates/${id}/lock`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(locked.status, 200);
    assert.equal(locked.body.locked, true);
    const lockedSave = await call(`/admin/prompt-templates/${id}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { name: '不能改' },
    });
    assert.equal(lockedSave.status, 400);
    assert.match(String(lockedSave.body.message), /锁定/);
    const lockedPublish = await call(`/admin/prompt-templates/${id}/publish`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(lockedPublish.status, 400);
    const lockedRollback = await call(`/admin/prompt-templates/${id}/rollback`, {
      method: 'POST',
      token: ctx.admin,
      body: { version: 1 },
    });
    assert.equal(lockedRollback.status, 400);
    const unlocked = await call(`/admin/prompt-templates/${id}/unlock`, {
      method: 'POST',
      token: ctx.admin,
    });
    assert.equal(unlocked.status, 200);
    const renamed = await call(`/admin/prompt-templates/${id}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { name: '解锁后可改' },
    });
    assert.equal(renamed.status, 200, JSON.stringify(renamed.body));
    const lockAudits = await requiredPool().query<{ action: string }>(
      `
        SELECT action FROM admin_audit_logs
        WHERE target = $1 AND action IN ('prompt.lock', 'prompt.unlock')
      `,
      [`prompt:${code}`],
    );
    assert.deepEqual(
      lockAudits.rows.map((row) => row.action).sort(),
      ['prompt.lock', 'prompt.unlock'],
    );

    const codeChange = await call(`/admin/prompt-templates/${id}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { code: 'gen_other' },
    });
    assert.equal(codeChange.status, 400);

    const trial = await fetch(`${ctx.base}/admin/prompt-templates/${id}/trial`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ctx.admin}` },
    });
    assert.equal(trial.status, 404);
    const oversized = await call('/admin/prompt-templates?pageSize=101', { token: ctx.admin });
    assert.equal(oversized.status, 400);
    const stats = await call('/admin/prompt-templates/stats', { token: ctx.admin });
    assert.equal(stats.status, 200);
    assert.equal(typeof stats.body.pendingDraftCount, 'number');
  });

  test('没有已发布快照时出题仍成功并记 usedBuiltin', async (t) => {
    if (!ready(t)) {
      return;
    }
    const sessionId = await createSession();
    const pool = requiredPool();
    const outcome = await runQuizGeneration(hidingPrompts(pool), sessionId, { mode: 'mock' }, {
      getFreeUserBankFirst: async () => false,
    });
    assert.equal(outcome.status, 'ready', JSON.stringify(outcome));
    const log = await pool.query<{
      used_builtin: boolean;
      success: boolean;
      template_id: string | null;
      template_code: string | null;
    }>(
      `
        SELECT used_builtin, success, template_id, template_code
        FROM quiz_generation_logs
        WHERE session_id = $1
        ORDER BY created_at DESC
        LIMIT 1
      `,
      [sessionId],
    );
    assert.equal(log.rows[0]?.success, true);
    assert.equal(log.rows[0]?.used_builtin, true);
    assert.equal(log.rows[0]?.template_id, null);
    assert.equal(log.rows[0]?.template_code, 'builtin');
  });

  test('题型 code 不可改，未登记渲染器不能启用', async (t) => {
    if (!ready(t)) {
      return;
    }
    const listed = await call('/admin/question-types', { token: ctx.admin });
    assert.equal(listed.status, 200);
    const listedItems = listed.body.items as Array<{
      code: string;
      enabled: boolean;
      rendererSupported: boolean;
    }>;
    for (const code of ['single', 'multi', 'judge']) {
      const item = listedItems.find((row) => row.code === code);
      assert.equal(item?.rendererSupported, true, code);
      assert.equal(item?.enabled, true, code);
    }

    const fill = `fill${randomUUID().replace(/-/g, '').slice(0, 6)}`;
    ctx.typeCodes.push(fill);
    const created = await call('/admin/question-types', {
      method: 'POST',
      token: ctx.admin,
      body: {
        code: fill,
        name: '填空',
        optionStructure: { selection: 'text' },
        appRendererKey: 'fill',
        gradingRuleBrief: '本期不判分',
        enabled: false,
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.rendererSupported, false);
    const enableFill = await call(`/admin/question-types/${fill}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { enabled: true },
    });
    assert.equal(enableFill.status, 400);
    const renameCode = await call(`/admin/question-types/${fill}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { code: 'fill_other', name: '填空改名' },
    });
    assert.equal(renameCode.status, 400);

    const supported = `note${randomUUID().replace(/-/g, '').slice(0, 6)}`;
    ctx.typeCodes.push(supported);
    const draft = await call('/admin/question-types', {
      method: 'POST',
      token: ctx.admin,
      body: {
        code: supported,
        name: '备注单选',
        optionStructure: { selection: 'single' },
        appRendererKey: 'single',
        gradingRuleBrief: '全对得分',
        enabled: false,
      },
    });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const enabled = await call(`/admin/question-types/${supported}`, {
      method: 'PUT',
      token: ctx.admin,
      body: { enabled: true },
    });
    assert.equal(enabled.status, 200, JSON.stringify(enabled.body));
    assert.equal(enabled.body.enabled, true);
    const audit = await requiredPool().query<{ action: string }>(
      `
        SELECT action FROM admin_audit_logs
        WHERE target = $1 AND action = 'questionType.enable'
      `,
      [`questionType:${supported}`],
    );
    assert.equal(audit.rowCount, 1);
  });

  test('证书默认参数写入独立表，不改证书行', async (t) => {
    if (!ready(t)) {
      return;
    }
    const pool = requiredPool();
    const before = await pool.query(
      `
        SELECT name, total_score, pass_score, enabled_question_type_codes, extra_constraint, updated_at
        FROM certificates
        WHERE id = $1
      `,
      [CERT_ID],
    );
    const missing = await call(
      '/admin/certificates/00000000-0000-4000-8000-000000000099/question-type-configs',
      { token: ctx.admin },
    );
    assert.equal(missing.status, 404);
    const saved = await call(`/admin/certificates/${CERT_ID}/question-type-configs`, {
      method: 'PUT',
      token: ctx.admin,
      body: [
        {
          questionTypeCode: 'single',
          defaultSelected: true,
          minCount: 2,
          maxCount: 6,
          defaultCountShare: 50,
          scorePerQuestion: 2,
        },
      ],
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.deepEqual(saved.body.enabledQuestionTypeCodes, before.rows[0]?.enabled_question_type_codes);
    const stored = await pool.query(
      `
        SELECT question_type_code, default_selected, default_count_share, score_per_question
        FROM cert_question_type_configs
        WHERE certificate_id = $1
      `,
      [CERT_ID],
    );
    assert.equal(stored.rows[0]?.question_type_code, 'single');
    assert.equal(Number(stored.rows[0]?.default_count_share), 50);
    const after = await pool.query(
      `
        SELECT name, total_score, pass_score, enabled_question_type_codes, extra_constraint, updated_at
        FROM certificates
        WHERE id = $1
      `,
      [CERT_ID],
    );
    assert.deepEqual(after.rows[0], before.rows[0]);
    const columns = await pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'certificates'
          AND column_name IN ('default_count_share', 'score_per_question', 'min_count')
      `,
    );
    assert.equal(columns.rowCount, 0);
    const audit = await pool.query(
      `
        SELECT action FROM admin_audit_logs
        WHERE target = $1 AND action = 'certTypeConfig.update'
        ORDER BY id DESC
        LIMIT 1
      `,
      [`certificate:${CERT_ID}`],
    );
    assert.equal(audit.rows[0]?.action, 'certTypeConfig.update');
    await call(`/admin/certificates/${CERT_ID}/question-type-configs`, {
      method: 'PUT',
      token: ctx.admin,
      body: [],
    });
  });
});

async function versionBody(id: string, version: number): Promise<unknown> {
  const result = await requiredPool().query(
    `
      SELECT templates
      FROM prompt_template_versions
      WHERE template_id = $1 AND version = $2
    `,
    [id, version],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0]?.templates;
}

async function generateAndCapture(): Promise<{
  prompt: { system: string; user: string };
  log: {
    used_builtin: boolean;
    template_code: string | null;
    template_version: number | null;
    success: boolean;
  };
}> {
  const sessionId = await createSession();
  let captured = { system: '', user: '' };
  const outcome = await runQuizGeneration(
    createPgExecutor(requiredPool()),
    sessionId,
    {
      mode: 'live',
      provider: 'deepseek',
      apiKey: 'test',
      baseUrl: 'http://127.0.0.1',
      completeAi: async (prompt) => {
        captured = prompt;
        return {
          questions: mockAiQuestions({
            count: 10,
            types: ['single'],
            difficulty: 'medium',
            knowledgePoints: [{ id: KP_ID, name: '会计概述', promptHint: '职能' }],
            sessionId,
          }),
        };
      },
    },
    { getFreeUserBankFirst: async () => false },
  );
  assert.equal(outcome.status, 'ready', JSON.stringify(outcome));
  const log = await requiredPool().query<{
    used_builtin: boolean;
    template_code: string | null;
    template_version: number | null;
    success: boolean;
  }>(
    `
      SELECT used_builtin, template_code, template_version, success
      FROM quiz_generation_logs
      WHERE session_id = $1
      ORDER BY created_at DESC
      LIMIT 1
    `,
    [sessionId],
  );
  const row = log.rows[0];
  assert.ok(row);
  return { prompt: captured, log: row };
}

async function createSession(): Promise<string> {
  const user = await loginUser();
  const pack = await call('/packs', {
    method: 'POST',
    token: user.token,
    body: {
      domainId: DOMAIN_ID,
      certId: CERT_ID,
      knowledgePointIds: [KP_ID],
      name: `TB11${randomUUID().slice(0, 4)}`,
    },
  });
  assert.equal(pack.status, 201, JSON.stringify(pack.body));
  const created = await call('/quiz/sessions', {
    method: 'POST',
    token: user.token,
    body: {
      packId: pack.body.id,
      count: 10,
      difficulty: 'medium',
      types: ['single'],
      timer: { enabled: false },
      mode: 'practice',
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return String(created.body.id);
}

async function loginUser(): Promise<WechatLoginResponse> {
  const login = await call('/auth/wechat/login', {
    method: 'POST',
    body: { code: `tb11-${randomUUID()}`, nick: '出题配置' },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const user = login.body as unknown as WechatLoginResponse;
  ctx.userIds.push(user.user.id);
  const lotId = randomUUID();
  await requiredPool().query(
    `
      INSERT INTO entitlement_lots (id, user_id, bucket, qty, remain, source)
      VALUES ($1, $2, 'inventory', 1000, 1000, 'seed')
    `,
    [lotId, user.user.id],
  );
  await requiredPool().query(
    `
      INSERT INTO entitlement_ledger (
        id, user_id, delta, bucket, reason, ref_type, ref_id, biz_date, lot_id
      )
      VALUES (
        $1, $2, 1000, 'inventory', 'inventory_grant', 'grant', $3,
        (timezone('Asia/Shanghai', now()))::date, $4
      )
    `,
    [randomUUID(), user.user.id, `tb11-seed:${user.user.id}`, lotId],
  );
  return user;
}

function hidingPrompts(pool: Pool): SqlExecutor {
  const base = createPgExecutor(pool);
  return {
    query: (sql, params) => {
      if (sql.includes('prompt_template_versions')) {
        return Promise.resolve({ rows: [], rowCount: 0 });
      }
      return base.query(sql, params);
    },
    transaction: (fn) => base.transaction(fn),
  };
}

async function adminToken(): Promise<string> {
  const login = await call('/admin/login', {
    method: 'POST',
    body: { username: USERNAME, password: PASSWORD },
  });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return String(login.body.token);
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

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('测试数据库不可用');
  }
  return ctx.pool;
}

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('Postgres 或 Redis 不可用');
    return false;
  }
  return true;
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
