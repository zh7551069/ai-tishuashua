import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  ApiErrorCode,
  addWholeDays,
  membershipEndsAt,
  orderGrantRef,
  quoteMemberUpgrade,
  resolveOrderKind,
  resolveWechatPayMode,
  type WechatPaySettings,
} from '@tishuashua/shared';
import { createJsapiPrepay } from './wechat-pay.client';
import {
  decryptNotifyResource,
  encryptNotifyResource,
  loadPlatformVerifier,
  signPayMessage,
  verifyPaySignature,
} from './wechat-pay.crypto';

const repoRoot = join(__dirname, '../../../..');

describe('payment rules', () => {
  test('升级差价、续费延长和满档重算', () => {
    const now = new Date('2026-11-07T00:00:00.000Z');
    const ends = addWholeDays(now, 7);
    const quote = quoteMemberUpgrade({
      now,
      endsAt: ends,
      currentPriceFen: 1200,
      currentDurationDays: 7,
      targetPriceFen: 19800,
    });
    assert.deepEqual(quote, { remainingDays: 7, remainingValueFen: 1200, payFen: 18600 });

    const partial = quoteMemberUpgrade({
      now,
      endsAt: new Date(now.getTime() + 3 * 86_400_000 + 1000),
      currentPriceFen: 1200,
      currentDurationDays: 7,
      targetPriceFen: 19800,
    });
    assert.equal(partial?.remainingDays, 4);
    assert.equal(partial?.remainingValueFen, Math.floor((1200 * 4) / 7));
    assert.equal(partial?.payFen, 19800 - Math.floor((1200 * 4) / 7));

    const paidAt = new Date('2026-11-08T00:00:00.000Z');
    const renewed = membershipEndsAt({
      kind: 'renew',
      paidAt,
      durationDays: 30,
      currentEndsAt: addWholeDays(paidAt, 10),
    });
    assert.equal(renewed.toISOString(), addWholeDays(addWholeDays(paidAt, 10), 30).toISOString());
    const upgraded = membershipEndsAt({
      kind: 'upgrade',
      paidAt,
      durationDays: 365,
      currentEndsAt: addWholeDays(paidAt, 6),
    });
    assert.equal(upgraded.toISOString(), addWholeDays(paidAt, 365).toISOString());
    assert.equal(orderGrantRef('t123'), 'order:t123');
  });

  test('降级拒绝，同档续费，更高档升级', () => {
    const downgrade = resolveOrderKind({
      skuType: 'member',
      requested: null,
      memberActive: true,
      currentDurationDays: 365,
      targetDurationDays: 7,
    });
    assert.equal(downgrade.ok, false);
    if (!downgrade.ok) {
      assert.equal(downgrade.code, ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN);
    }
    const renew = resolveOrderKind({
      skuType: 'member',
      requested: 'purchase',
      memberActive: true,
      currentDurationDays: 30,
      targetDurationDays: 30,
    });
    assert.deepEqual(renew, { ok: true, kind: 'renew' });
    const upgrade = resolveOrderKind({
      skuType: 'member',
      requested: null,
      memberActive: true,
      currentDurationDays: 7,
      targetDurationDays: 365,
    });
    assert.deepEqual(upgrade, { ok: true, kind: 'upgrade' });
    const pack = resolveOrderKind({
      skuType: 'session_pack',
      requested: 'renew',
      memberActive: true,
      currentDurationDays: 30,
      targetDurationDays: null,
    });
    assert.equal(pack.ok, false);
    if (!pack.ok) {
      assert.equal(pack.code, ApiErrorCode.VALIDATION_ERROR);
    }
  });

  test('缺配且未 mock 时不能下单，生产忽略 mock', () => {
    const base = settings({ mock: false });
    assert.equal(resolveWechatPayMode(base), 'off');
    assert.equal(resolveWechatPayMode(settings({ mock: true, nodeEnv: 'test' })), 'mock');
    assert.equal(resolveWechatPayMode(settings({ mock: true, nodeEnv: 'production' })), 'off');
    assert.equal(
      resolveWechatPayMode(settings({ mock: true, nodeEnv: 'test', enabledFlag: 'off' })),
      'off',
    );
    assert.equal(resolveWechatPayMode(liveSettings()), 'live');
    assert.equal(
      resolveWechatPayMode({ ...liveSettings(), notifyUrl: 'http://pay.example/notify' }),
      'off',
    );
  });

  test('验签失败不通过，密文可往返', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const verifier = loadPlatformVerifier(publicPem);
    assert.ok(verifier);
    const raw = '{"out_trade_no":"t123456"}';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce-ok';
    const signature = signPayMessage(privatePem, `${timestamp}\n${nonce}\n${raw}\n`);
    assert.equal(
      verifyPaySignature({
        verifier: verifier!,
        timestamp,
        nonce,
        signature,
        serial: 'IGNORED',
        rawBody: raw,
      }),
      true,
    );
    assert.equal(
      verifyPaySignature({
        verifier: verifier!,
        timestamp,
        nonce,
        signature: `${signature.slice(0, -2)}xx`,
        serial: 'IGNORED',
        rawBody: raw,
      }),
      false,
    );

    const apiV3Key = 'abcdefghijklmnopqrstuvwxyz012345';
    const encrypted = encryptNotifyResource(apiV3Key, '{"amount":{"total":1}}', 'abcdefghijkl');
    assert.equal(decryptNotifyResource(apiV3Key, encrypted), '{"amount":{"total":1}}');
    assert.throws(() => decryptNotifyResource(`${apiV3Key.slice(0, 31)}x`, encrypted));
  });

  test('真实预下单使用服务端金额和 openId', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    let seen = '';
    const result = await createJsapiPrepay(
      {
        appId: 'wx_test',
        mchId: '1900000001',
        serialNo: 'SERIAL',
        privateKeyPem: privatePem,
        notifyUrl: 'https://pay.example/api/pay/wx/notify',
        description: '会员 · 月卡',
        outTradeNo: 't12345678',
        amountFen: 2800,
        openid: 'o_test',
      },
      (async (_url, init) => {
        seen = String(init?.body ?? '');
        return new Response(JSON.stringify({ prepay_id: 'wx20123456789012345678901234567890' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as typeof fetch,
    );
    const body = JSON.parse(seen) as { amount: { total: number }; payer: { openid: string } };
    assert.equal(body.amount.total, 2800);
    assert.equal(body.payer.openid, 'o_test');
    assert.equal(result.payParams.package, 'prepay_id=wx20123456789012345678901234567890');
    assert.equal(result.payParams.signType, 'RSA');
    assert.equal(result.payParams.paySign.includes('PRIVATE'), false);
  });

  test('示例和共享代码没有密钥真值，也不读私钥文件', () => {
    const files = [
      '.env.example',
      'apps/api/.env.example',
      'docs/payment.md',
      'docs/contracts/tb23-wechat-pay-order-C-contracts-v0.1.0-C.md',
      'packages/shared/src/payment.ts',
      'packages/shared/src/index.ts',
    ];
    for (const file of files) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      assert.equal(text.includes('BEGIN PRIVATE KEY'), false, file);
      assert.equal(text.includes('BEGIN CERTIFICATE'), false, file);
      assert.equal(/WECHAT_PAY_(API_V3_KEY|PRIVATE_KEY)=\S/.test(text), false, file);
    }
    for (const file of ['packages/shared/src/payment.ts', 'packages/shared/src/index.ts']) {
      const text = readFileSync(join(repoRoot, file), 'utf8');
      assert.equal(text.includes('node:fs'), false, file);
      assert.equal(text.includes('node:crypto'), false, file);
    }
    const migration = readFileSync(
      join(repoRoot, 'apps/api/migrations/012_commerce_orders.sql'),
      'utf8',
    );
    assert.match(migration, /commerce_orders/);
    assert.match(migration, /commerce_refund_tickets/);
    assert.match(migration, /status = 'open'/);
    assert.equal(migration.includes('api.mch.weixin.qq.com'), false);
    assert.equal(randomBytes(1).length, 1);
  });
});

function settings(patch: Partial<WechatPaySettings>): WechatPaySettings {
  return {
    nodeEnv: 'test',
    enabledFlag: 'unset',
    mock: false,
    appId: '',
    mchId: '',
    mchSerialNo: '',
    hasPrivateKey: false,
    apiV3Key: '',
    notifyUrl: '',
    hasPlatformCert: false,
    ...patch,
  };
}

function liveSettings(): WechatPaySettings {
  return settings({
    appId: 'wx_app',
    mchId: '1900000001',
    mchSerialNo: 'SERIAL',
    hasPrivateKey: true,
    apiV3Key: 'abcdefghijklmnopqrstuvwxyz012345',
    notifyUrl: 'https://pay.example/api/pay/wx/notify',
    hasPlatformCert: true,
  });
}
