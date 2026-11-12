import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode, defaultAdminRoleMatrix, retentionCutoff } from '@tishuashua/shared';
import { runDataRetentionPurge } from '@tishuashua/shared/admin-system';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const CERT_ID = '11111111-1111-4111-8111-111111111201';
const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';
const KP_ID = '11111111-1111-4111-8111-111111111401';

describe('TB-13 后管系统', { concurrency: 1 }, () => {
  test('角色矩阵不拒写，全站审计、目录审计和保留清理', async (t) => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      t.skip('PostgreSQL 或 Redis 不可用，跳过 TB-13 集成测试');
      return;
    }
    const saved = {
      adminUser: process.env.ADMIN_USERNAME,
      adminPassword: process.env.ADMIN_PASSWORD,
      databaseUrl: process.env.DATABASE_URL,
      redisUrl: process.env.REDIS_URL,
      wechatMock: process.env.WECHAT_LOGIN_MOCK,
    };
    process.env.ADMIN_USERNAME = 'tb13ops';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.WECHAT_LOGIN_MOCK = 'true';

    const pool = new Pool({ connectionString: databaseUrl, max: 2 });
    const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
    redis.on('error', () => undefined);
    let app: INestApplication | undefined;
    const userId = randomUUID();
    const keepLogId = randomUUID();
    const ancientLogId = randomUUID();
    const keepUploadId = randomUUID();
    const ancientUploadId = randomUUID();
    const keepJobId = randomUUID();
    const ancientJobId = randomUUID();
    const sessionId = randomUUID();
    const wrongId = randomUUID();
    const bankId = randomUUID();
    const promptIds: string[] = [];
    const commerceActor = `tb13-${randomUUID().slice(0, 8)}`;
    let previousBank: { enabled?: unknown } | undefined;
    let previousCert: { pass_score: number; status: string } | undefined;
    try {
      app = await NestFactory.create(AppModule, { logger: false });
      configureHttp(app);
      await app.listen(0, '127.0.0.1');
      const address = app.getHttpServer().address() as { port: number } | string | null;
      if (!address || typeof address === 'string') {
        throw new Error('测试服务没有端口');
      }
      const base = `http://127.0.0.1:${address.port}/api`;
      const anon = await request(base, '/admin/system/roles');
      assert.equal(anon.status, 401);

      const wechat = await request(base, '/auth/wechat/login', {
        method: 'POST',
        body: { code: `tb13-${randomUUID()}`, nick: 'tb13' },
      });
      assert.equal(wechat.status, 200);
      const wechatDenied = await request(base, '/admin/system/roles', {
        token: String(wechat.body.token),
      });
      assert.equal(wechatDenied.status, 401);

      const login = await request(base, '/admin/login', {
        method: 'POST',
        body: { username: 'tb13ops', password: 'correct-horse' },
      });
      assert.equal(login.status, 200);
      assert.deepEqual(login.body.admin, { username: 'tb13ops' });
      const token = String(login.body.token);

      const roles = await request(base, '/admin/system/roles', { token });
      assert.equal(roles.status, 200);
      const capabilities = (roles.body.capabilities ?? {}) as Record<string, Record<string, string>>;
      assert.equal(capabilities['prompt.write']?.research, 'write');
      assert.equal(capabilities['user.ban']?.superadmin, 'write');

      const matrix = defaultAdminRoleMatrix();
      matrix.capabilities['prompt.write'].ops = 'none';
      const savedRoles = await request(base, '/admin/system/roles', {
        method: 'PUT',
        token,
        body: matrix,
      });
      assert.equal(savedRoles.status, 200, JSON.stringify(savedRoles.body));
      const savedCaps = (savedRoles.body.capabilities ?? {}) as Record<string, Record<string, string>>;
      assert.equal(savedCaps['prompt.write']?.ops, 'none');
      const unknownRole = await request(base, '/admin/system/roles', {
        method: 'PUT',
        token,
        body: { ...matrix, capabilities: { ...matrix.capabilities, 'no.such': matrix.capabilities['prompt.write'] } },
      });
      assert.equal(unknownRole.status, 400);
      assert.equal(unknownRole.body.code, ApiErrorCode.VALIDATION_ERROR);

      const code = `gen_tb13_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
      const created = await request(base, '/admin/prompt-templates', {
        method: 'POST',
        token,
        body: {
          name: 'TB13 仍可发布',
          code,
          scope: 'global',
          systemPrompt: '你是出题助手',
          userPromptTemplate: '证书 {{certificateName}}，共 {{count}} 题。',
          variables: ['certificateName', 'count'],
        },
      });
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const promptId = String(created.body.id);
      promptIds.push(promptId);
      const published = await request(base, `/admin/prompt-templates/${promptId}/publish`, {
        method: 'POST',
        token,
      });
      assert.equal(published.status, 200, JSON.stringify(published.body));

      const certRow = await pool.query<{ pass_score: string; status: string }>(
        `SELECT pass_score::text, status FROM certificates WHERE id = $1`,
        [CERT_ID],
      );
      previousCert = {
        pass_score: Number(certRow.rows[0]?.pass_score ?? 70),
        status: certRow.rows[0]?.status ?? 'online',
      };
      const nextPass = previousCert.pass_score === 71 ? 70 : 71;
      const certWrite = await request(base, `/admin/catalog/certificates/${CERT_ID}`, {
        method: 'PUT',
        token,
        body: { passScore: nextPass },
      });
      assert.equal(certWrite.status, 200, JSON.stringify(certWrite.body));

      const bankBefore = await request(base, '/admin/system-settings/freeUserBankFirst', { token });
      previousBank = bankBefore.body;
      const bankWrite = await request(base, '/admin/system-settings/freeUserBankFirst', {
        method: 'PUT',
        token,
        body: { enabled: bankBefore.body.enabled !== true },
      });
      assert.equal(bankWrite.status, 200);

      await pool.query(
        `
          INSERT INTO admin_audit_logs (actor, action, target, before, after)
          VALUES ($1, 'commerce.quota.update', 'setting:quota', '{}'::jsonb, '{}'::jsonb)
        `,
        [commerceActor],
      );
      const from = new Date(Date.now() - 60_000).toISOString();
      const all = await request(
        base,
        `/admin/system/audit?from=${encodeURIComponent(from)}&pageSize=100`,
        { token },
      );
      assert.equal(all.status, 200);
      assert.equal(all.body.pageSize, 100);
      const actions = ((all.body.items ?? []) as Array<{ action?: string }>).map((item) => item.action);
      assert.ok(actions.includes('commerce.quota.update'));
      assert.ok(actions.includes('catalog.certificate.update'));
      assert.ok(actions.includes('system.freeUserBankFirst.update'));
      assert.ok(actions.includes('system.roles.update'));
      const catalogItems = (
        (all.body.items ?? []) as Array<{
          action?: string;
          after?: { passScore?: number; status?: string; enabledQuestionTypeCodes?: string[] };
        }>
      ).filter((item) => item.action === 'catalog.certificate.update');
      const mine = catalogItems.find((item) => item.after?.passScore === nextPass);
      assert.ok(mine);
      assert.equal(typeof mine?.after?.status, 'string');
      assert.ok(Array.isArray(mine?.after?.enabledQuestionTypeCodes));

      const commerceOnly = await request(
        base,
        `/admin/system/audit?actionPrefix=commerce.&actor=${commerceActor}`,
        { token },
      );
      assert.equal(commerceOnly.status, 200);
      const commerceActions = ((commerceOnly.body.items ?? []) as Array<{ action?: string }>).map(
        (item) => item.action,
      );
      assert.deepEqual(commerceActions, ['commerce.quota.update']);
      const commercePage = await request(base, `/admin/commerce/audit?actor=${commerceActor}`, { token });
      assert.equal(commercePage.status, 200);
      assert.ok(
        ((commercePage.body.items ?? []) as Array<{ action?: string }>).every((item) =>
          String(item.action).startsWith('commerce.'),
        ),
      );
      const commerceWide = await request(base, '/admin/commerce/audit?pageSize=100', { token });
      assert.equal(commerceWide.status, 400);
      const tooBig = await request(base, '/admin/system/audit?pageSize=101', { token });
      assert.equal(tooBig.status, 400);
      assert.equal(tooBig.body.code, ApiErrorCode.VALIDATION_ERROR);

      const retention = await request(base, '/admin/system/retention', { token });
      assert.equal(retention.status, 200);
      assert.equal(retention.body.quizGenerationLogsDays, 90);
      assert.equal(retention.body.userUploadAndExtractDays, 90);
      assert.match(String(retention.body.notice), /练习记录与错题暂不自动删除/);
      const zero = await request(base, '/admin/system/retention', {
        method: 'PUT',
        token,
        body: { quizGenerationLogsDays: 0, userUploadAndExtractDays: 90 },
      });
      assert.equal(zero.status, 400);
      const practiceKey = await request(base, '/admin/system/retention', {
        method: 'PUT',
        token,
        body: { quizGenerationLogsDays: 90, userUploadAndExtractDays: 90, wrongItemsDays: 30 },
      });
      assert.equal(practiceKey.status, 400);
      assert.equal(practiceKey.body.code, ApiErrorCode.VALIDATION_ERROR);

      await pool.query(
        `INSERT INTO users (id, wx_open_id, nick, status) VALUES ($1, $2, 'tb13', 'active')`,
        [userId, `tb13-${userId}`],
      );
      await pool.query(
        `
          INSERT INTO quiz_generation_logs (
            id, user_id, used_builtin, success, request_summary, created_at
          )
          VALUES ($1, $2, false, true, '{}'::jsonb, now())
        `,
        [keepLogId, userId],
      );
      const long = await request(base, '/admin/system/retention', {
        method: 'PUT',
        token,
        body: { quizGenerationLogsDays: 3650, userUploadAndExtractDays: 3650 },
      });
      assert.equal(long.status, 200);
      const beforePreview = await pool.query(`SELECT id FROM quiz_generation_logs WHERE id = $1`, [
        keepLogId,
      ]);
      const preview = await request(base, '/admin/system/retention/preview', {
        method: 'POST',
        token,
        body: { quizGenerationLogsDays: 3650, userUploadAndExtractDays: 3650 },
      });
      assert.equal(preview.status, 200);
      const previewLogs = preview.body.quizGenerationLogs as { count?: number };
      assert.equal(typeof previewLogs.count, 'number');
      const cutoff = retentionCutoff(new Date(), 3650).toISOString();
      const sqlCount = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count FROM quiz_generation_logs WHERE created_at < $1::timestamptz`,
        [cutoff],
      );
      assert.equal(previewLogs.count, sqlCount.rows[0]?.count);
      const afterPreview = await pool.query(`SELECT id FROM quiz_generation_logs WHERE id = $1`, [
        keepLogId,
      ]);
      assert.equal(afterPreview.rowCount, beforePreview.rowCount);
      const emptyPreview = await request(base, '/admin/system/retention/preview', {
        method: 'POST',
        token,
        body: {},
      });
      assert.equal(emptyPreview.status, 200);
      assert.equal(
        (emptyPreview.body.quizGenerationLogs as { count?: number }).count,
        previewLogs.count,
      );

      await pool.query(
        `
          INSERT INTO quiz_generation_logs (
            id, user_id, used_builtin, success, request_summary, created_at
          )
          VALUES ($1, $2, false, false, '{}'::jsonb, '2000-01-01T00:00:00.000Z')
        `,
        [ancientLogId, userId],
      );
      await pool.query(
        `
          INSERT INTO user_uploads (id, user_id, file_meta, status, created_at)
          VALUES ($1, $2, '{}'::jsonb, 'pending', now()),
                 ($3, $2, '{}'::jsonb, 'pending', '2000-01-01T00:00:00.000Z')
        `,
        [keepUploadId, userId, ancientUploadId],
      );
      await pool.query(
        `
          INSERT INTO extract_jobs (id, upload_id, user_id, status, created_at)
          VALUES ($1, $2, $3, 'succeeded', now()),
                 ($4, $5, $3, 'succeeded', '2000-01-01T00:00:00.000Z')
        `,
        [keepJobId, keepUploadId, userId, ancientJobId, ancientUploadId],
      );
      await pool.query(
        `
          INSERT INTO quiz_sessions (
            id, user_id, pack_snapshot, mode, settings, score, pass_snapshot, status, source,
            started_at, submitted_at
          )
          VALUES (
            $1, $2, '{}'::jsonb, 'practice', '{}'::jsonb, 80,
            '{"passed": true}'::jsonb, 'submitted', 'normal', now(), now()
          )
        `,
        [sessionId, userId],
      );
      await pool.query(
        `
          INSERT INTO wrong_items (id, user_id, cert_id, question_snapshot, status)
          VALUES ($1, $2, $3, '{"stem":"tb13"}'::jsonb, 'pending')
        `,
        [wrongId, userId, CERT_ID],
      );
      await pool.query(
        `
          INSERT INTO question_bank (
            id, domain_id, certificate_id, kp_ids, type_code, stem, options, answer, source, content_key
          )
          VALUES (
            $1, $2, $3, ARRAY[$4]::uuid[], 'single', 'tb13', '[]'::jsonb, '"A"'::jsonb, 'ai',
            convert_to($5, 'UTF8')
          )
        `,
        [bankId, DOMAIN_ID, CERT_ID, KP_ID, `tb13-${bankId}`],
      );
      await request(base, '/admin/system/retention', {
        method: 'PUT',
        token,
        body: { quizGenerationLogsDays: 90, userUploadAndExtractDays: 90 },
      });
      const client = await pool.connect();
      try {
        const purged = await runDataRetentionPurge({
          query: (sql, params) => client.query(sql, params),
        });
        assert.equal(typeof purged.quizGenerationLogs.count, 'number');
        assert.ok(purged.quizGenerationLogs.count >= 1);
      } finally {
        client.release();
      }
      assert.equal((await pool.query(`SELECT 1 FROM quiz_generation_logs WHERE id = $1`, [ancientLogId])).rowCount, 0);
      assert.equal((await pool.query(`SELECT 1 FROM quiz_generation_logs WHERE id = $1`, [keepLogId])).rowCount, 1);
      assert.equal((await pool.query(`SELECT 1 FROM user_uploads WHERE id = $1`, [ancientUploadId])).rowCount, 0);
      assert.equal((await pool.query(`SELECT 1 FROM extract_jobs WHERE id = $1`, [ancientJobId])).rowCount, 0);
      assert.equal((await pool.query(`SELECT 1 FROM user_uploads WHERE id = $1`, [keepUploadId])).rowCount, 1);
      assert.equal((await pool.query(`SELECT 1 FROM extract_jobs WHERE id = $1`, [keepJobId])).rowCount, 1);
      assert.equal((await pool.query(`SELECT 1 FROM quiz_sessions WHERE id = $1`, [sessionId])).rowCount, 1);
      assert.equal((await pool.query(`SELECT 1 FROM wrong_items WHERE id = $1`, [wrongId])).rowCount, 1);
      assert.equal((await pool.query(`SELECT 1 FROM question_bank WHERE id = $1`, [bankId])).rowCount, 1);
      const clientAgain = await pool.connect();
      try {
        const again = await runDataRetentionPurge({
          query: (sql, params) => clientAgain.query(sql, params),
        });
        assert.equal(typeof again.quizGenerationLogs.count, 'number');
      } finally {
        clientAgain.release();
      }
      assert.equal((await pool.query(`SELECT 1 FROM quiz_generation_logs WHERE id = $1`, [keepLogId])).rowCount, 1);
      const purgeAudit = await pool.query(
        `
          SELECT action FROM admin_audit_logs
          WHERE action = 'system.retention.purge' AND created_at > now() - interval '10 minutes'
        `,
      );
      assert.ok((purgeAudit.rowCount ?? 0) >= 2);
    } finally {
      if (previousCert) {
        await pool
          .query(`UPDATE certificates SET pass_score = $1 WHERE id = $2`, [
            previousCert.pass_score,
            CERT_ID,
          ])
          .catch(() => undefined);
      }
      if (typeof previousBank?.enabled === 'boolean') {
        await pool
          .query(
            `
              INSERT INTO system_settings (key, value, updated_at, updated_by)
              VALUES ('freeUserBankFirst', jsonb_build_object('enabled', $1::boolean), now(), 'test')
              ON CONFLICT (key) DO UPDATE
              SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
            `,
            [previousBank.enabled],
          )
          .catch(() => undefined);
        await redis.del('sysset:freeUserBankFirst').catch(() => undefined);
      }
      await pool
        .query(
          `
            INSERT INTO system_settings (key, value, updated_at, updated_by)
            VALUES
              ('dataRetention', '{"quizGenerationLogsDays":90,"userUploadAndExtractDays":90}'::jsonb, now(), 'test'),
              ('adminRoleMatrix', $1::jsonb, now(), 'test')
            ON CONFLICT (key) DO UPDATE
            SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
          `,
          [JSON.stringify(defaultAdminRoleMatrix())],
        )
        .catch(() => undefined);
      await app?.close().catch(() => undefined);
      await pool
        .query(`DELETE FROM prompt_template_versions WHERE template_id = ANY($1::uuid[])`, [promptIds])
        .catch(() => undefined);
      await pool.query(`DELETE FROM prompt_templates WHERE id = ANY($1::uuid[])`, [promptIds]).catch(() => undefined);
      await pool.query(`DELETE FROM question_bank WHERE id = $1`, [bankId]).catch(() => undefined);
      await pool.query(`DELETE FROM wrong_items WHERE id = $1`, [wrongId]).catch(() => undefined);
      await pool.query(`DELETE FROM quiz_sessions WHERE id = $1`, [sessionId]).catch(() => undefined);
      await pool.query(`DELETE FROM extract_jobs WHERE id = ANY($1::uuid[])`, [[keepJobId, ancientJobId]]).catch(() => undefined);
      await pool
        .query(`DELETE FROM user_uploads WHERE id = ANY($1::uuid[])`, [[keepUploadId, ancientUploadId]])
        .catch(() => undefined);
      await pool
        .query(`DELETE FROM quiz_generation_logs WHERE id = ANY($1::uuid[])`, [[keepLogId, ancientLogId]])
        .catch(() => undefined);
      await pool.query(`DELETE FROM users WHERE id = $1`, [userId]).catch(() => undefined);
      await pool.query(`DELETE FROM admin_audit_logs WHERE actor = $1`, [commerceActor]).catch(() => undefined);
      redis.disconnect();
      await pool.end().catch(() => undefined);
      restore(saved);
    }
  });
});

function restore(saved: {
  adminUser: string | undefined;
  adminPassword: string | undefined;
  databaseUrl: string | undefined;
  redisUrl: string | undefined;
  wechatMock: string | undefined;
}): void {
  assign('ADMIN_USERNAME', saved.adminUser);
  assign('ADMIN_PASSWORD', saved.adminPassword);
  assign('DATABASE_URL', saved.databaseUrl);
  assign('REDIS_URL', saved.redisUrl);
  assign('WECHAT_LOGIN_MOCK', saved.wechatMock);
}

function assign(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

async function request(
  base: string,
  path: string,
  options: { method?: 'GET' | 'POST' | 'PUT'; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${base}${path}`, {
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
