import 'reflect-metadata';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, X509Certificate } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ApiErrorCode, addWholeDays, quoteMemberUpgrade } from '@tishuashua/shared';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppModule } from '../app.module';
import { configureHttp } from '../app.setup';
import { encryptNotifyResource, signPayMessage } from './wechat-pay.crypto';

const LOCAL_DATABASE_URL = 'postgres://tishuashua:tishuashua@127.0.0.1:5432/tishuashua';
const LOCAL_REDIS_URL = 'redis://127.0.0.1:6379';
const HIDDEN_SKU = 'member_hidden_tb23';

const ctx: {
  ready: boolean;
  app?: INestApplication;
  base: string;
  pool?: Pool;
  redis?: Redis;
  adminToken: string;
  userIds: string[];
  primary: { id: string; token: string } | null;
  apiV3Key: string;
  privateKey: string;
  serial: string;
} = {
  ready: false,
  base: '',
  adminToken: '',
  userIds: [],
  primary: null,
  apiV3Key: '',
  privateKey: '',
  serial: '',
};

describe('wechat pay orders', { concurrency: 1 }, () => {
  before(async () => {
    const databaseUrl = process.env.DATABASE_URL || LOCAL_DATABASE_URL;
    const redisUrl = process.env.REDIS_URL || LOCAL_REDIS_URL;
    if (!(await infraAvailable(databaseUrl, redisUrl))) {
      return;
    }
    process.env.ADMIN_USERNAME = 'ops';
    process.env.ADMIN_PASSWORD = 'correct-horse';
    process.env.DATABASE_URL = databaseUrl;
    process.env.REDIS_URL = redisUrl;
    process.env.WECHAT_LOGIN_MOCK = 'true';
    process.env.WECHAT_APP_ID = '';
    process.env.WECHAT_APP_SECRET = '';
    clearPayEnv();
    process.env.WECHAT_PAY_MOCK = 'false';

    const bare = await NestFactory.create(AppModule, { logger: false, rawBody: true });
    configureHttp(bare);
    await bare.listen(0, '127.0.0.1');
    const bareAddress = bare.getHttpServer().address() as { port: number };
    const bareBase = `http://127.0.0.1:${bareAddress.port}/api`;
    try {
      const login = await call(bareBase, '/auth/wechat/login', {
        method: 'POST',
        body: { code: `pay-off-${randomBytes(4).toString('hex')}`, nick: 'pay-off' },
      });
      assert.equal(login.status, 200, JSON.stringify(login.body));
      const userId = (login.body.user as { id?: string } | undefined)?.id;
      assert.ok(userId);
      ctx.userIds.push(userId);
      ctx.primary = { id: userId, token: String(login.body.token) };
      const denied = await call(bareBase, '/orders', {
        method: 'POST',
        token: String(login.body.token),
        body: { skuCode: 'member_month', amountFen: 1 },
      });
      assert.equal(denied.status, 503, JSON.stringify(denied.body));
      assert.equal(denied.body.code, ApiErrorCode.PAY_NOT_CONFIGURED);
      const hidden = await call(bareBase, '/dev/pay/mock-notify', {
        method: 'POST',
        body: { outTradeNo: 't000000' },
      });
      assert.equal(hidden.status, 404);
      assert.equal(hidden.body.code, ApiErrorCode.NOT_FOUND);
    } finally {
      await bare.close();
    }

    const dir = mkdtempSync(join(tmpdir(), 'tb23-pay-'));
    execFileSync('openssl', [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-keyout',
      join(dir, 'key.pem'),
      '-out',
      join(dir, 'cert.pem'),
      '-days',
      '1',
      '-nodes',
      '-subj',
      '/CN=tb23-test',
    ]);
    ctx.privateKey = readFileSync(join(dir, 'key.pem'), 'utf8');
    const certPem = readFileSync(join(dir, 'cert.pem'), 'utf8');
    ctx.serial = new X509Certificate(certPem).serialNumber.replace(/:/g, '').toUpperCase();
    ctx.apiV3Key = asciiKey(32);
    process.env.WECHAT_PAY_MOCK = 'true';
    process.env.WECHAT_PAY_API_V3_KEY = ctx.apiV3Key;
    process.env.WECHAT_PAY_PLATFORM_CERT_PATH = join(dir, 'cert.pem');

    ctx.pool = new Pool({ connectionString: databaseUrl, max: 4 });
    ctx.redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    });
    ctx.redis.on('error', () => undefined);
    await ctx.redis.connect();
    const app = await NestFactory.create(AppModule, { logger: false, rawBody: true });
    configureHttp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as { port: number };
    ctx.app = app;
    ctx.base = `http://127.0.0.1:${address.port}/api`;
    const admin = await request('/admin/login', {
      method: 'POST',
      body: { username: 'ops', password: 'correct-horse' },
    });
    assert.equal(admin.status, 200, JSON.stringify(admin.body));
    ctx.adminToken = String(admin.body.token);
    ctx.ready = true;
  });

  after(async () => {
    const pool = ctx.pool;
    if (pool) {
      await pool
        .query('DELETE FROM commerce_skus WHERE code = $1', [HIDDEN_SKU])
        .catch(() => undefined);
      if (ctx.userIds.length > 0) {
        await pool
          .query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ctx.userIds])
          .catch(() => undefined);
      }
    }
    await ctx.app?.close();
    await pool?.end().catch(() => undefined);
    ctx.redis?.disconnect();
  });

  test('A1-A8 下单、入账、重复回调、错签、金额、升级、降级和续费', async (t) => {
    if (!ctx.ready || !ctx.pool) {
      t.skip('PostgreSQL 或 Redis 不可用');
      return;
    }

    const anon = await request('/commerce/skus');
    assert.equal(anon.status, 401);

    const buyer = ctx.primary;
    assert.ok(buyer);
    const catalog = await request('/commerce/skus', { token: buyer.token });
    assert.equal(catalog.status, 200);
    const items =
      (catalog.body.items as Array<{ code: string; updatedBy?: string }> | undefined) ?? [];
    assert.equal(
      items.some((item) => item.code === 'member_month'),
      true,
    );
    assert.equal(
      items.some((item) => item.updatedBy),
      false,
    );

    const monthPrice = await skuPrice('member_month');
    const bought = await request('/orders', {
      method: 'POST',
      token: buyer.token,
      body: {
        skuCode: 'member_month',
        amountFen: 1,
        clientIdempotencyKey: `month-${buyer.id.slice(0, 8)}`,
      },
    });
    assert.equal(bought.status, 201, JSON.stringify(bought.body));
    assert.equal(bought.body.status, 'prepay');
    assert.equal(bought.body.amountFen, monthPrice);
    assert.equal(bought.body.orderKind, 'purchase');
    const again = await request('/orders', {
      method: 'POST',
      token: buyer.token,
      body: {
        skuCode: 'member_month',
        amountFen: 9,
        clientIdempotencyKey: `month-${buyer.id.slice(0, 8)}`,
      },
    });
    assert.equal(again.body.outTradeNo, bought.body.outTradeNo);
    const monthNo = String(bought.body.outTradeNo);
    const paid = await request('/dev/pay/mock-notify', {
      method: 'POST',
      body: { outTradeNo: monthNo },
    });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.code, 'SUCCESS');
    const monthOrder = await request(`/orders/${monthNo}`, { token: buyer.token });
    assert.equal(monthOrder.body.status, 'paid');
    const monthMembership = await membership(buyer.id);
    assert.equal(monthMembership.sku_code, 'member_month');
    assert.equal(monthMembership.last_order_id, monthNo);
    assertNear(monthMembership.ends_at, addWholeDays(new Date(monthMembership.paid_at), 30));
    assert.equal(await grantCount(buyer.id, `order:${monthNo}`, 'membership_grant'), 1);

    const replay = await request('/dev/pay/mock-notify', {
      method: 'POST',
      body: { outTradeNo: monthNo, transactionId: 'mock_replay_once' },
    });
    assert.equal(replay.status, 200);
    assert.equal(await grantCount(buyer.id, `order:${monthNo}`, 'membership_grant'), 1);
    const still = await membership(buyer.id);
    assert.equal(still.ends_at, monthMembership.ends_at);

    const renewed = await request('/orders', {
      method: 'POST',
      token: buyer.token,
      body: { skuCode: 'member_month', orderKind: 'renew' },
    });
    assert.equal(renewed.status, 201, JSON.stringify(renewed.body));
    assert.equal(renewed.body.orderKind, 'renew');
    const renewNo = String(renewed.body.outTradeNo);
    const renewPaid = await request('/dev/pay/mock-notify', {
      method: 'POST',
      body: { outTradeNo: renewNo },
    });
    assert.equal(renewPaid.status, 200, JSON.stringify(renewPaid.body));
    const afterRenew = await membership(buyer.id);
    const renewPaidAt = new Date(afterRenew.paid_at);
    const base = new Date(
      Math.max(new Date(monthMembership.ends_at).getTime(), renewPaidAt.getTime()),
    );
    assertNear(afterRenew.ends_at, addWholeDays(base, 30));
    assert.equal(afterRenew.last_order_id, renewNo);

    const packUser = buyer;
    await ctx.pool.query(`UPDATE commerce_skus SET enabled = true WHERE code = 'session_pack_5'`);
    const packed = await request('/orders', {
      method: 'POST',
      token: packUser.token,
      body: { skuCode: 'session_pack_5', orderKind: 'purchase', amountFen: 1 },
    });
    assert.equal(packed.status, 201, JSON.stringify(packed.body));
    assert.equal(packed.body.amountFen, await skuPrice('session_pack_5'));
    const packNo = String(packed.body.outTradeNo);
    assert.equal(
      (await request('/dev/pay/mock-notify', { method: 'POST', body: { outTradeNo: packNo } }))
        .status,
      200,
    );
    const lot = await ctx.pool.query<{ remain: number; qty: number; order_id: string }>(
      `
        SELECT remain, qty, order_id
        FROM entitlement_lots
        WHERE user_id = $1 AND order_id = $2
      `,
      [packUser.id, packNo],
    );
    assert.equal(lot.rows.length, 1);
    assert.equal(lot.rows[0]?.remain, 5);
    assert.equal(lot.rows[0]?.qty, 5);
    assert.equal(await grantCount(packUser.id, `order:${packNo}`, 'inventory_grant'), 1);
    assert.equal(
      (await request('/dev/pay/mock-notify', { method: 'POST', body: { outTradeNo: packNo } }))
        .status,
      200,
    );
    assert.equal(await grantCount(packUser.id, `order:${packNo}`, 'inventory_grant'), 1);
    const lotAgain = await ctx.pool.query<{ remain: number }>(
      `SELECT remain FROM entitlement_lots WHERE user_id = $1 AND order_id = $2`,
      [packUser.id, packNo],
    );
    assert.equal(lotAgain.rows[0]?.remain, 5);

    const signedUser = buyer;
    const pending = await request('/orders', {
      method: 'POST',
      token: signedUser.token,
      body: { skuCode: 'member_month' },
    });
    assert.equal(pending.status, 201, JSON.stringify(pending.body));
    const pendingNo = String(pending.body.outTradeNo);
    const pendingRow = await orderRow(pendingNo);
    const bad = await postNotify(
      notifyPayload({
        outTradeNo: pendingNo,
        transactionId: `tx${randomBytes(6).toString('hex')}`,
        total: pendingRow.amount_fen,
        openid: pendingRow.payer_openid,
        tamper: true,
      }),
    );
    assert.equal(bad.status, 401);
    assert.equal(bad.body.code, ApiErrorCode.PAY_SIGN_INVALID);
    assert.notEqual((await orderRow(pendingNo)).status, 'paid');
    assert.equal(await grantCount(signedUser.id, `order:${pendingNo}`, 'membership_grant'), 0);

    const mismatch = await postNotify(
      notifyPayload({
        outTradeNo: pendingNo,
        transactionId: `tx${randomBytes(6).toString('hex')}`,
        total: pendingRow.amount_fen + 1,
        openid: pendingRow.payer_openid,
      }),
    );
    assert.equal(mismatch.status, 400);
    assert.equal(mismatch.body.code, ApiErrorCode.PAY_AMOUNT_MISMATCH);
    const mismatched = await orderRow(pendingNo);
    assert.notEqual(mismatched.status, 'paid');
    assert.equal(mismatched.fail_reason, 'amount_mismatch');
    assert.equal(await grantCount(signedUser.id, `order:${pendingNo}`, 'membership_grant'), 0);

    const weekUser = await login('week');
    const hiddenOrder = await request(`/orders/${packNo}`, { token: weekUser.token });
    assert.equal(hiddenOrder.status, 404);
    const week = await request('/orders', {
      method: 'POST',
      token: weekUser.token,
      body: { skuCode: 'member_week' },
    });
    assert.equal(week.status, 201, JSON.stringify(week.body));
    const weekNo = String(week.body.outTradeNo);
    assert.equal(
      (await request('/dev/pay/mock-notify', { method: 'POST', body: { outTradeNo: weekNo } }))
        .status,
      200,
    );
    const weekMembership = await membership(weekUser.id);
    const quote = await request('/orders/upgrade-quote', {
      method: 'POST',
      token: weekUser.token,
      body: { targetSkuCode: 'member_year' },
    });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const expectedQuote = quoteMemberUpgrade({
      now: new Date(),
      endsAt: new Date(weekMembership.ends_at),
      currentPriceFen: await skuPrice('member_week'),
      currentDurationDays: 7,
      targetPriceFen: await skuPrice('member_year'),
    });
    assert.equal(quote.body.payFen, expectedQuote?.payFen);
    assert.equal(quote.body.remainingDays, expectedQuote?.remainingDays);
    assert.equal(quote.body.currency, 'CNY');
    const upgrade = await request('/orders', {
      method: 'POST',
      token: weekUser.token,
      body: { skuCode: 'member_year', orderKind: 'upgrade', amountFen: 1 },
    });
    assert.equal(upgrade.status, 201, JSON.stringify(upgrade.body));
    assert.equal(upgrade.body.orderKind, 'upgrade');
    assert.equal(upgrade.body.amountFen, quote.body.payFen);
    const yearNo = String(upgrade.body.outTradeNo);
    assert.equal(
      (await request('/dev/pay/mock-notify', { method: 'POST', body: { outTradeNo: yearNo } }))
        .status,
      200,
    );
    const yearMembership = await membership(weekUser.id);
    assert.equal(yearMembership.sku_code, 'member_year');
    assert.equal(yearMembership.last_order_id, yearNo);
    assertNear(yearMembership.ends_at, addWholeDays(new Date(yearMembership.paid_at), 365));

    const forbidden = await request('/orders', {
      method: 'POST',
      token: weekUser.token,
      body: { skuCode: 'member_week' },
    });
    assert.equal(forbidden.status, 409);
    assert.equal(forbidden.body.code, ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN);
    const weekOrders = await ctx.pool.query<{ status: string }>(
      `SELECT status FROM commerce_orders WHERE user_id = $1 AND sku_code = 'member_week'`,
      [weekUser.id],
    );
    assert.equal(weekOrders.rowCount, 1);
    assert.equal(weekOrders.rows[0]?.status, 'paid');

    await ctx.pool.query(
      `
        INSERT INTO commerce_skus (
          code, type, name, price_fen, duration_days, summary, enabled, sort_order, updated_by
        )
        VALUES ($1, 'member', '隐藏周卡', 100, 7, '不可买', false, 99, 'test')
      `,
      [HIDDEN_SKU],
    );
    const unavailable = await request('/orders', {
      method: 'POST',
      token: weekUser.token,
      body: { skuCode: HIDDEN_SKU },
    });
    assert.equal(unavailable.status, 409);
    assert.equal(unavailable.body.code, ApiErrorCode.PAY_SKU_UNAVAILABLE);
    const visible = await request('/commerce/skus?type=member', { token: weekUser.token });
    const visibleCodes = ((visible.body.items as Array<{ code: string }> | undefined) ?? []).map(
      (item) => item.code,
    );
    assert.equal(visibleCodes.includes(HIDDEN_SKU), false);

    const adminList = await request(`/admin/commerce/orders?outTradeNo=${monthNo}`, {
      token: ctx.adminToken,
    });
    assert.equal(adminList.status, 200, JSON.stringify(adminList.body));
    const adminItems =
      (adminList.body.items as Array<{ outTradeNo: string; status: string }> | undefined) ?? [];
    assert.equal(adminItems[0]?.outTradeNo, monthNo);
    assert.equal(adminItems[0]?.status, 'paid');
    const userTokenOnAdmin = await request('/admin/commerce/orders', { token: buyer.token });
    assert.equal(userTokenOnAdmin.status, 401);
  });
});

function clearPayEnv(): void {
  for (const key of [
    'WECHAT_PAY_APP_ID',
    'WECHAT_PAY_MCH_ID',
    'WECHAT_PAY_MCH_SERIAL_NO',
    'WECHAT_PAY_PRIVATE_KEY_PATH',
    'WECHAT_PAY_PRIVATE_KEY',
    'WECHAT_PAY_API_V3_KEY',
    'WECHAT_PAY_NOTIFY_URL',
    'WECHAT_PAY_PLATFORM_CERT_PATH',
    'WECHAT_PAY_ENABLED',
  ]) {
    process.env[key] = '';
  }
}

function asciiKey(length: number): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = randomBytes(length);
  let key = '';
  for (let index = 0; index < length; index += 1) {
    key += alphabet[(bytes[index] ?? 0) % alphabet.length];
  }
  return key;
}

async function login(label: string): Promise<{ id: string; token: string; openId: string }> {
  const response = await request('/auth/wechat/login', {
    method: 'POST',
    body: { code: `pay-${label}-${randomBytes(4).toString('hex')}`, nick: label },
  });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const user = response.body.user as { id?: string; wxOpenId?: string };
  assert.ok(user.id);
  ctx.userIds.push(user.id);
  return { id: user.id, token: String(response.body.token), openId: String(user.wxOpenId ?? '') };
}

async function skuPrice(code: string): Promise<number> {
  const result = await ctx.pool!.query<{ price_fen: number }>(
    'SELECT price_fen FROM commerce_skus WHERE code = $1',
    [code],
  );
  return Number(result.rows[0]?.price_fen);
}

async function membership(userId: string): Promise<{
  ends_at: string;
  sku_code: string;
  last_order_id: string;
  paid_at: string;
}> {
  const result = await ctx.pool!.query<{
    ends_at: Date;
    sku_code: string;
    last_order_id: string;
    paid_at: Date;
  }>(
    `
      SELECT m.ends_at, m.sku_code, m.last_order_id, o.paid_at
      FROM memberships m
      JOIN commerce_orders o ON o.out_trade_no = m.last_order_id
      WHERE m.user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0];
  assert.ok(row);
  return {
    ends_at: row.ends_at.toISOString(),
    sku_code: row.sku_code,
    last_order_id: row.last_order_id,
    paid_at: row.paid_at.toISOString(),
  };
}

async function grantCount(userId: string, refId: string, reason: string): Promise<number> {
  const result = await ctx.pool!.query<{ count: number }>(
    `
      SELECT count(*)::int AS count
      FROM entitlement_ledger
      WHERE user_id = $1 AND ref_id = $2 AND reason = $3 AND ref_type = 'grant'
    `,
    [userId, refId, reason],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function orderRow(outTradeNo: string): Promise<{
  status: string;
  amount_fen: number;
  payer_openid: string;
  fail_reason: string | null;
}> {
  const result = await ctx.pool!.query<{
    status: string;
    amount_fen: number;
    payer_openid: string;
    fail_reason: string | null;
  }>(
    `
      SELECT status, amount_fen, payer_openid, fail_reason
      FROM commerce_orders
      WHERE out_trade_no = $1
    `,
    [outTradeNo],
  );
  const row = result.rows[0];
  assert.ok(row);
  return row;
}

function notifyPayload(input: {
  outTradeNo: string;
  transactionId: string;
  total: number;
  openid: string;
  tamper?: boolean;
}): { raw: string; headers: Record<string, string> } {
  const encrypted = encryptNotifyResource(
    ctx.apiV3Key,
    JSON.stringify({
      out_trade_no: input.outTradeNo,
      transaction_id: input.transactionId,
      trade_state: 'SUCCESS',
      amount: { total: input.total, currency: 'CNY' },
      payer: { openid: input.openid },
    }),
    'abcdefghijkl',
  );
  const raw = JSON.stringify({
    id: 'evt-tb23',
    create_time: new Date().toISOString(),
    resource_type: 'encrypt-resource',
    event_type: 'TRANSACTION.SUCCESS',
    summary: '支付成功',
    resource: {
      original_type: 'transaction',
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: encrypted.ciphertext,
      associated_data: encrypted.associatedData,
      nonce: encrypted.nonce,
    },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(8).toString('hex');
  let signature = signPayMessage(ctx.privateKey, `${timestamp}\n${nonce}\n${raw}\n`);
  if (input.tamper) {
    signature = `${signature.slice(0, -4)}AAAA`;
  }
  return {
    raw,
    headers: {
      'content-type': 'application/json',
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': signature,
      'wechatpay-serial': ctx.serial,
    },
  };
}

async function postNotify(payload: { raw: string; headers: Record<string, string> }): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const response = await fetch(`${ctx.base}/pay/wx/notify`, {
    method: 'POST',
    headers: payload.headers,
    body: payload.raw,
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : {},
  };
}

function assertNear(actualIso: string, expected: Date): void {
  const delta = Math.abs(new Date(actualIso).getTime() - expected.getTime());
  assert.ok(delta < 2000, `${actualIso} 与 ${expected.toISOString()} 相差 ${delta}ms`);
}

function request(
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown } = {},
): Promise<{ status: number; body: Record<string, unknown> }> {
  return call(ctx.base, path, options);
}

async function call(
  base: string,
  path: string,
  options: { method?: 'GET' | 'POST'; token?: string; body?: unknown } = {},
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
