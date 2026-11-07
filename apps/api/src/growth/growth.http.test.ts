import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  ApiErrorCode,
  GROWTH_CONFIG_CACHE_KEY,
  GROWTH_CONFIG_KEY,
  GROWTH_MEMBER_SKIP_REASON,
  GROWTH_MEMBER_SKIP_TEXT,
  businessDate,
  defaultGrowthConfig,
  growthRef,
  type EntitlementView,
  type GrowthCheckinResult,
  type GrowthInviteBindResult,
  type GrowthShareOpenResult,
  type GrowthShareTokenResult,
  type EntitlementLedgerPage,
  type GrowthView,
  type WechatLoginResponse,
} from '@tishuashua/shared';
import { createPgExecutor, runQuizGeneration } from '@tishuashua/shared/generation';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { sessionKey } from '../session/session.service';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  userIds: string[];
  tokens: string[];
  domainId: string;
  certId: string;
  textbookId: string;
  kpId: string;
} = {
  ready: false,
  base: '',
  userIds: [],
  tokens: [],
  domainId: '',
  certId: '',
  textbookId: '',
  kpId: '',
};

describe('growth rewards', { concurrency: 1 }, () => {
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
    process.env.RATE_LIMIT_ENABLED = 'false';
    process.env.ENTITLEMENT_SEED = '1';

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
    await insertCatalog(ctx.pool);
    ctx.ready = true;
  });

  after(async () => {
    await restoreGrowth().catch(() => undefined);
    const pool = ctx.pool;
    if (pool && ctx.userIds.length > 0) {
      await pool
        .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
        .catch(() => undefined);
    }
    if (pool && ctx.domainId) {
      await pool
        .query('DELETE FROM knowledge_points WHERE id = $1', [ctx.kpId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM textbooks WHERE id = $1', [ctx.textbookId])
        .catch(() => undefined);
      await pool
        .query('DELETE FROM certificates WHERE id = $1', [ctx.certId])
        .catch(() => undefined);
      await pool.query('DELETE FROM domains WHERE id = $1', [ctx.domainId]).catch(() => undefined);
    }
    if (ctx.redis && ctx.tokens.length > 0) {
      await ctx.redis.del(...ctx.tokens.map((token) => sessionKey(token))).catch(() => undefined);
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('A1 签到入账后再次请求不双加', async (t) => {
    if (!ready(t)) return;
    const user = await login('checkin');
    const before = await entitlement(user.token);
    const first = await call('/me/growth/checkin', user.token, { method: 'POST', body: '{}' });
    assert.equal(first.status, 200, JSON.stringify(first.body));
    const applied = first.body as unknown as GrowthCheckinResult;
    assert.equal(applied.applied, true);
    assert.equal(applied.rewardSessions, (await growthConfig()).checkin.rewardSessions);
    const mid = await entitlement(user.token);
    assert.equal(
      mid.balances.dailyTaskRemain,
      before.balances.dailyTaskRemain + applied.rewardSessions,
    );
    const today = businessDate(new Date());
    const ledger = await ledgerOf(user.token);
    assert.ok(
      ledger.items.some(
        (item) =>
          item.reason === 'task_grant' &&
          item.bucket === 'daily_task' &&
          item.refId === growthRef.checkin(user.userId, today) &&
          item.delta === applied.rewardSessions,
      ),
    );
    const again = await call('/me/growth/checkin', user.token, { method: 'POST', body: '{}' });
    assert.equal(again.status, 200);
    assert.equal((again.body as unknown as GrowthCheckinResult).applied, false);
    assert.equal(
      (await entitlement(user.token)).balances.dailyTaskRemain,
      mid.balances.dailyTaskRemain,
    );
    const view = await growthOf(user.token);
    assert.equal(view.checkin.done, true);
    assert.equal(view.businessDate, today);
  });

  test('A2 分享要等打开才发奖，同日第二次不双加', async (t) => {
    if (!ready(t)) return;
    const sharer = await login('sharer');
    const opener = await login('opener');
    const before = await entitlement(sharer.token);
    const tokenRes = await call('/me/growth/share/token', sharer.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(tokenRes.status, 200, JSON.stringify(tokenRes.body));
    const issued = tokenRes.body as unknown as GrowthShareTokenResult;
    assert.match(issued.pathHint, /shareToken=/);
    const againToken = await call('/me/growth/share/token', sharer.token, {
      method: 'POST',
      body: '{}',
    });
    assert.equal(
      (againToken.body as unknown as GrowthShareTokenResult).shareToken,
      issued.shareToken,
    );
    assert.equal(
      (await entitlement(sharer.token)).balances.dailyTaskRemain,
      before.balances.dailyTaskRemain,
    );
    const waiting = await growthOf(sharer.token);
    assert.equal(waiting.share.claimed, false);
    assert.equal(waiting.share.awaitingOpen, true);
    assert.equal(waiting.share.statusText, '未领取 · 等待好友打开');

    const self = await call('/me/growth/share/open', sharer.token, {
      method: 'POST',
      body: JSON.stringify({ shareToken: issued.shareToken }),
    });
    assert.equal(self.status, 400);
    assert.equal(self.body.code, ApiErrorCode.GROWTH_SELF_INVITE);
    assert.equal(
      (await entitlement(sharer.token)).balances.dailyTaskRemain,
      before.balances.dailyTaskRemain,
    );

    const opened = await call('/me/growth/share/open', opener.token, {
      method: 'POST',
      body: JSON.stringify({ shareToken: issued.shareToken }),
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const reward = opened.body as unknown as GrowthShareOpenResult;
    assert.equal(reward.applied, true);
    assert.equal(reward.sharerRewarded, true);
    const qty = (await growthConfig()).share.rewardSessions;
    const after = await entitlement(sharer.token);
    assert.equal(after.balances.dailyTaskRemain, before.balances.dailyTaskRemain + qty);
    assert.equal((await entitlement(opener.token)).balances.dailyTaskRemain, 0);
    const today = businessDate(new Date());
    assert.ok(
      (await ledgerOf(sharer.token)).items.some(
        (item) =>
          item.refId === growthRef.share(sharer.userId, today) && item.reason === 'task_grant',
      ),
    );
    const repeat = await call('/me/growth/share/open', opener.token, {
      method: 'POST',
      body: JSON.stringify({ shareToken: issued.shareToken }),
    });
    assert.equal(repeat.status, 200);
    assert.equal((repeat.body as unknown as GrowthShareOpenResult).applied, false);
    assert.equal(
      (await entitlement(sharer.token)).balances.dailyTaskRemain,
      after.balances.dailyTaskRemain,
    );
    const claimed = await growthOf(sharer.token);
    assert.equal(claimed.share.claimed, true);
    assert.equal(claimed.share.awaitingOpen, false);
    assert.equal(claimed.share.statusText, '今日已领');
  });

  test('A3 会员分享不发场次也不发提炼次', async (t) => {
    if (!ready(t)) return;
    const sharer = await login('member-sharer');
    const opener = await login('member-opener');
    const granted = await call('/dev/entitlement/grant', sharer.token, {
      method: 'POST',
      body: JSON.stringify({
        type: 'membership',
        endsAt: '2027-06-01T00:00:00.000Z',
        refId: `growth-member-${randomUUID()}`,
      }),
    });
    assert.equal(granted.status, 200, JSON.stringify(granted.body));
    const before = await entitlement(sharer.token);
    assert.equal(before.membership.active, true);
    const tokenRes = await call('/me/growth/share/token', sharer.token, {
      method: 'POST',
      body: '{}',
    });
    const shareToken = (tokenRes.body as unknown as GrowthShareTokenResult).shareToken;
    const opened = await call('/me/growth/share/open', opener.token, {
      method: 'POST',
      body: JSON.stringify({ shareToken }),
    });
    assert.equal(opened.status, 200, JSON.stringify(opened.body));
    const body = opened.body as unknown as GrowthShareOpenResult;
    assert.equal(body.applied, false);
    assert.equal(body.sharerRewarded, false);
    assert.equal(body.reason, GROWTH_MEMBER_SKIP_REASON);
    const after = await entitlement(sharer.token);
    assert.equal(after.balances.dailyTaskRemain, before.balances.dailyTaskRemain);
    assert.equal(after.refine.lifetimeUsed, before.refine.lifetimeUsed);
    assert.equal(after.balances.inventoryRemain, before.balances.inventoryRemain);
    const view = await growthOf(sharer.token);
    assert.equal(view.membershipActive, true);
    assert.equal(view.share.memberSkip, true);
    assert.equal(view.share.statusText, GROWTH_MEMBER_SKIP_TEXT);
    const today = businessDate(new Date());
    assert.equal(
      (await ledgerOf(sharer.token)).items.some(
        (item) => item.refId === growthRef.share(sharer.userId, today),
      ),
      false,
    );
  });

  test('A4 邀请码绑定双方入库存，自邀和重复绑定被拒绝', async (t) => {
    if (!ready(t)) return;
    const inviter = await login('inviter');
    const invitee = await login('invitee');
    const view = await growthOf(inviter.token);
    assert.match(view.invite.code, /^TS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    const self = await call('/me/growth/invite/bind', inviter.token, {
      method: 'POST',
      body: JSON.stringify({ inviteCode: view.invite.code }),
    });
    assert.equal(self.status, 400);
    assert.equal(self.body.code, ApiErrorCode.GROWTH_SELF_INVITE);

    const bound = await call('/me/growth/invite/bind', invitee.token, {
      method: 'POST',
      body: JSON.stringify({ inviteCode: view.invite.code }),
    });
    assert.equal(bound.status, 200, JSON.stringify(bound.body));
    const result = bound.body as unknown as GrowthInviteBindResult;
    assert.equal(result.bound, true);
    assert.equal(result.inviterId, inviter.userId);
    assert.equal(result.inviter.applied, true);
    assert.equal(result.invitee.applied, true);
    assert.equal(result.inviter.pending, false);
    const config = await growthConfig();
    assert.equal(
      (await entitlement(inviter.token)).balances.inventoryRemain,
      config.invite.inviterRegisterSessions,
    );
    assert.equal(
      (await entitlement(invitee.token)).balances.inventoryRemain,
      config.invite.inviteeWelcomeSessions,
    );
    assert.ok(
      (await ledgerOf(inviter.token)).items.some(
        (item) =>
          item.reason === 'inventory_grant' &&
          item.refId === growthRef.inviterRegister(invitee.userId),
      ),
    );
    const repeat = await call('/me/growth/invite/bind', invitee.token, {
      method: 'POST',
      body: JSON.stringify({ inviterId: inviter.userId }),
    });
    assert.equal(repeat.status, 409);
    assert.equal(repeat.body.code, ApiErrorCode.GROWTH_ALREADY_BOUND);
    assert.equal(
      (await entitlement(inviter.token)).balances.inventoryRemain,
      config.invite.inviterRegisterSessions,
    );

    const byIdInviter = await login('id-inviter');
    const byIdInvitee = await login('id-invitee');
    const byId = await call('/me/growth/invite/bind', byIdInvitee.token, {
      method: 'POST',
      body: JSON.stringify({ inviterId: byIdInviter.userId }),
    });
    assert.equal(byId.status, 200, JSON.stringify(byId.body));
    assert.equal((byId.body as unknown as GrowthInviteBindResult).inviter.applied, true);
  });

  test('A5 生涯第一次交卷才发首刷奖', async (t) => {
    if (!ready(t)) return;
    const inviter = await login('fs-inviter', true);
    const invitee = await login('fs-invitee', true);
    const code = (await growthOf(inviter.token)).invite.code;
    const bound = await call('/me/growth/invite/bind', invitee.token, {
      method: 'POST',
      body: JSON.stringify({ inviteCode: code }),
    });
    assert.equal(bound.status, 200, JSON.stringify(bound.body));
    const config = await growthConfig();
    const paper = await createReadySession(invitee.token, invitee.packId);
    const submitted = await call(`/quiz/sessions/${paper.id}/submit`, invitee.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
    assert.equal(
      (await entitlement(inviter.token)).balances.inventoryRemain,
      config.invite.inviterRegisterSessions + config.invite.inviterFirstSubmitSessions,
    );
    assert.equal(
      (await entitlement(invitee.token)).balances.inventoryRemain,
      config.invite.inviteeWelcomeSessions + config.invite.inviteeFirstSubmitSessions,
    );
    assert.ok(
      (await ledgerOf(inviter.token)).items.some(
        (item) =>
          item.refId === growthRef.inviterFirstSubmit(invitee.userId) &&
          item.delta === config.invite.inviterFirstSubmitSessions,
      ),
    );
    const resubmit = await call(`/quiz/sessions/${paper.id}/submit`, invitee.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(resubmit.status, 200);
    const second = await createReadySession(invitee.token, invitee.packId);
    const submittedAgain = await call(`/quiz/sessions/${second.id}/submit`, invitee.token, {
      method: 'POST',
      body: JSON.stringify({ reason: 'manual' }),
    });
    assert.equal(submittedAgain.status, 200, JSON.stringify(submittedAgain.body));
    assert.equal(
      (await entitlement(inviter.token)).balances.inventoryRemain,
      config.invite.inviterRegisterSessions + config.invite.inviterFirstSubmitSessions,
    );
    assert.equal(
      (await entitlement(invitee.token)).balances.inventoryRemain,
      config.invite.inviteeWelcomeSessions + config.invite.inviteeFirstSubmitSessions,
    );
  });

  test('A6 邀请人日封顶后写入 pending，库存不增', async (t) => {
    if (!ready(t)) return;
    const inviter = await login('cap-inviter');
    const first = await login('cap-first');
    const second = await login('cap-second');
    await seedInviterUsage(inviter.userId, 5);
    const code = (await growthOf(inviter.token)).invite.code;
    const filled = await call('/me/growth/invite/bind', first.token, {
      method: 'POST',
      body: JSON.stringify({ inviteCode: code }),
    });
    assert.equal(filled.status, 200, JSON.stringify(filled.body));
    assert.equal((filled.body as unknown as GrowthInviteBindResult).inviter.applied, true);
    const stock = (await entitlement(inviter.token)).balances.inventoryRemain;
    assert.equal(stock, (await growthConfig()).invite.inviterRegisterSessions);
    const overflow = await call('/me/growth/invite/bind', second.token, {
      method: 'POST',
      body: JSON.stringify({ inviteCode: code }),
    });
    assert.equal(overflow.status, 200, JSON.stringify(overflow.body));
    const pending = overflow.body as unknown as GrowthInviteBindResult;
    assert.equal(pending.inviter.applied, false);
    assert.equal(pending.inviter.pending, true);
    assert.equal(pending.inviter.reason, 'daily_cap');
    assert.equal(pending.invitee.applied, true);
    assert.equal((await entitlement(inviter.token)).balances.inventoryRemain, stock);
    const row = await requiredPool().query<{ status: string; risk_code: string; qty: number }>(
      `
        SELECT status, risk_code, qty
        FROM entitlement_pending_grants
        WHERE user_id = $1 AND related_ref = $2
      `,
      [inviter.userId, growthRef.inviterRegister(second.userId)],
    );
    assert.equal(row.rows[0]?.status, 'pending');
    assert.equal(row.rows[0]?.risk_code, 'daily_cap');
    assert.equal(row.rows[0]?.qty, (await growthConfig()).invite.inviterRegisterSessions);
    assert.equal(
      (
        await requiredPool().query(
          `SELECT 1 FROM entitlement_pending_grants WHERE user_id = $1 AND status = 'granted'`,
          [inviter.userId],
        )
      ).rowCount,
      0,
    );
  });

  test('A7 分享奖额改配置后按新值入账', async (t) => {
    if (!ready(t)) return;
    const original = await growthConfig();
    try {
      const next = defaultGrowthConfig();
      next.share.rewardSessions = 2;
      await writeGrowth(next);
      const sharer = await login('cfg-sharer');
      const opener = await login('cfg-opener');
      const before = (await entitlement(sharer.token)).balances.dailyTaskRemain;
      const tokenRes = await call('/me/growth/share/token', sharer.token, {
        method: 'POST',
        body: '{}',
      });
      const shareToken = (tokenRes.body as unknown as GrowthShareTokenResult).shareToken;
      const opened = await call('/me/growth/share/open', opener.token, {
        method: 'POST',
        body: JSON.stringify({ shareToken }),
      });
      assert.equal(opened.status, 200, JSON.stringify(opened.body));
      assert.equal((opened.body as unknown as GrowthShareOpenResult).applied, true);
      assert.equal((await entitlement(sharer.token)).balances.dailyTaskRemain, before + 2);
      assert.equal((await growthOf(sharer.token)).share.rewardSessions, 2);
    } finally {
      await writeGrowth(original);
    }
  });

  test('未登录不能读增长态', async (t) => {
    if (!ready(t)) return;
    const response = await call('/me/growth');
    assert.equal(response.status, 401);
    assert.equal(response.body.code, ApiErrorCode.UNAUTHORIZED);
  });
});

function ready(t: { skip: (message?: string) => void }): boolean {
  if (!ctx.ready) {
    t.skip('本地数据库或 Redis 不可用');
    return false;
  }
  return true;
}

async function login(
  label: string,
  withPack = false,
): Promise<{ token: string; userId: string; packId: string }> {
  const response = await call('/auth/wechat/login', undefined, {
    method: 'POST',
    body: JSON.stringify({ code: `${label}-${randomUUID()}`, nick: label }),
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const body = response.body as unknown as WechatLoginResponse;
  ctx.tokens.push(body.token);
  ctx.userIds.push(body.user.id);
  if (!withPack) {
    return { token: body.token, userId: body.user.id, packId: '' };
  }
  const pack = await call('/packs', body.token, {
    method: 'POST',
    body: JSON.stringify({
      domainId: ctx.domainId,
      certId: ctx.certId,
      knowledgePointIds: [ctx.kpId],
      name: `增长${label}`,
    }),
  });
  assert.equal(pack.status, 201, JSON.stringify(pack.body));
  const packId = (pack.body as { id?: string }).id ?? '';
  assert.ok(packId);
  return { token: body.token, userId: body.user.id, packId };
}

async function createReadySession(token: string, packId: string): Promise<{ id: string }> {
  const response = await call('/quiz/sessions', token, {
    method: 'POST',
    body: JSON.stringify({
      packId,
      count: 10,
      difficulty: 'medium',
      types: ['single', 'multi', 'judge'],
      timer: { enabled: false },
      mode: 'practice',
    }),
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  const id = (response.body as { id?: string }).id ?? '';
  const outcome = await runQuizGeneration(createPgExecutor(requiredPool()), id, { mode: 'mock' });
  assert.equal(outcome.status, 'ready');
  return { id };
}

async function growthOf(token: string): Promise<GrowthView> {
  const response = await call('/me/growth', token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as GrowthView;
}

async function entitlement(token: string): Promise<EntitlementView> {
  const response = await call('/me/entitlement', token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as EntitlementView;
}

async function ledgerOf(token: string): Promise<EntitlementLedgerPage> {
  const response = await call('/me/entitlement/ledger?limit=50', token);
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body as unknown as EntitlementLedgerPage;
}

async function growthConfig() {
  const view = await call('/me/growth', (await peekToken()) || undefined);
  if (view.status === 200) {
    const body = view.body as unknown as GrowthView;
    const config = defaultGrowthConfig();
    config.checkin.rewardSessions = body.checkin.rewardSessions;
    config.checkin.enabled = body.checkin.enabled;
    config.share.rewardSessions = body.share.rewardSessions;
    config.share.enabled = body.share.enabled;
    config.invite.registerEnabled = body.invite.registerEnabled;
    config.invite.inviterRegisterSessions = body.invite.rewards.inviterRegister;
    config.invite.inviteeWelcomeSessions = body.invite.rewards.inviteeWelcome;
    config.invite.inviterFirstSubmitSessions = body.invite.rewards.inviterFirstSubmit;
    config.invite.inviteeFirstSubmitSessions = body.invite.rewards.inviteeFirstSubmit;
    config.invite.dailyCapSessions = body.invite.dailyCap;
    config.invite.weeklyCapSessions = body.invite.weeklyCap;
    return config;
  }
  return defaultGrowthConfig();
}

async function peekToken(): Promise<string> {
  return ctx.tokens[0] ?? '';
}

async function writeGrowth(config: ReturnType<typeof defaultGrowthConfig>): Promise<void> {
  await requiredPool().query(
    `
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES ($1, $2::jsonb, now(), 'tb29-test')
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by
    `,
    [GROWTH_CONFIG_KEY, JSON.stringify(config)],
  );
  await ctx.redis?.del(GROWTH_CONFIG_CACHE_KEY);
}

async function restoreGrowth(): Promise<void> {
  if (!ctx.pool) {
    return;
  }
  await writeGrowth(defaultGrowthConfig());
}

async function seedInviterUsage(userId: string, qty: number): Promise<void> {
  const today = businessDate(new Date());
  await requiredPool().query(
    `
      INSERT INTO entitlement_ledger (
        id, user_id, delta, bucket, reason, ref_type, ref_id, biz_date
      )
      VALUES ($1, $2, $3, 'inventory', 'inventory_grant', 'grant', $4, $5::date)
    `,
    [randomUUID(), userId, qty, growthRef.inviterRegister(randomUUID()), today],
  );
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
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

async function insertCatalog(pool: Pool): Promise<void> {
  ctx.domainId = randomUUID();
  ctx.certId = randomUUID();
  ctx.textbookId = randomUUID();
  ctx.kpId = randomUUID();
  const suffix = ctx.domainId.slice(0, 8);
  await pool.query(
    `INSERT INTO domains (id, code, name, status, sort_order) VALUES ($1, $2, '增长领域', 'online', 71)`,
    [ctx.domainId, `gr-domain-${suffix}`],
  );
  await pool.query(
    `
      INSERT INTO certificates (
        id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order
      )
      VALUES ($1, $2, $3, '增长证书', 'online', 100, 60, ARRAY['single','multi','judge']::text[], 1)
    `,
    [ctx.certId, ctx.domainId, `gr-cert-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbooks (id, code, name, status, sort_order) VALUES ($1, $2, '增长教材', 'online', 1)`,
    [ctx.textbookId, `gr-book-${suffix}`],
  );
  await pool.query(
    `INSERT INTO textbook_certificates (textbook_id, certificate_id) VALUES ($1, $2)`,
    [ctx.textbookId, ctx.certId],
  );
  await pool.query(
    `
      INSERT INTO knowledge_points (
        id, textbook_id, parent_id, code, name, kind, prompt_hint, level, status, sort_order
      )
      VALUES ($1, $2, NULL, $3, '增长知识点', 'knowledge_point', '围绕概念出原创题', 1, 'online', 1)
    `,
    [ctx.kpId, ctx.textbookId, `gr-kp-${suffix}`],
  );
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

function requiredPool(): Pool {
  if (!ctx.pool) {
    throw new Error('测试数据库还没准备好');
  }
  return ctx.pool;
}
