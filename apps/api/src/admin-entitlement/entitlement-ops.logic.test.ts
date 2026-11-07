import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { ENTITLEMENT_LEDGER_REASONS } from '@tishuashua/shared';
import {
  entitlementSourceLabel,
  maskOpenId,
  parseAdminGrant,
  parseAdminRevoke,
  parseAuditQuery,
  parseLookupQuery,
} from './entitlement-ops.parse';

const repoRoot = join(__dirname, '../../../..');

describe('admin entitlement ops rules', () => {
  test('补发只接受 inventory，拒绝改会员到期', () => {
    const ok = parseAdminGrant({
      qty: 3,
      bucket: 'inventory',
      reason: '风控待发放人工通过',
      pendingId: null,
      expiresAt: null,
      idempotencyKey: 'k1',
    });
    assert.equal(ok.ok, true);
    if (ok.ok) {
      assert.equal(ok.value.qty, 3);
      assert.equal(ok.value.bucket, 'inventory');
    }
    assert.equal(parseAdminGrant({ qty: 3, bucket: 'daily_free', reason: 'x' }).ok, false);
    assert.equal(parseAdminGrant({ qty: 3, bucket: 'membership', reason: 'x' }).ok, false);
    assert.equal(parseAdminGrant({ qty: 0, bucket: 'inventory', reason: 'x' }).ok, false);
    assert.equal(parseAdminGrant({ qty: 1000, bucket: 'inventory', reason: 'x' }).ok, false);
    assert.equal(parseAdminGrant({ qty: 3, bucket: 'inventory', reason: '  ' }).ok, false);
    const ends = parseAdminGrant({
      qty: 3,
      bucket: 'inventory',
      reason: '误改到期',
      endsAt: '2026-12-01T00:00:00.000Z',
    });
    assert.equal(ends.ok, false);
    if (!ends.ok) {
      assert.match(ends.message, /会员到期/);
    }
  });

  test('作废拒绝日免和当日任务，原因必填', () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const ok = parseAdminRevoke({
      targets: [{ kind: 'lot', id }],
      reason: '误发回收',
    });
    assert.equal(ok.ok, true);
    assert.equal(
      parseAdminRevoke({ targets: [{ kind: 'daily_task', id: 'synthetic:daily_task' }], reason: 'x' }).ok,
      false,
    );
    assert.equal(
      parseAdminRevoke({ targets: [{ kind: 'daily_free', id }], reason: 'x' }).ok,
      false,
    );
    assert.equal(parseAdminRevoke({ targets: [{ kind: 'lot', id }], reason: '' }).ok, false);
    assert.equal(
      parseAdminRevoke({
        targets: [
          { kind: 'lot', id },
          { kind: 'lot', id },
        ],
        reason: '重复',
      }).ok,
      false,
    );
  });

  test('查找和审计查询', () => {
    const lookup = parseLookupQuery('  阿辉  ', '10');
    assert.equal(lookup.ok && lookup.value.q, '阿辉');
    assert.equal(parseLookupQuery('   ', undefined).ok, false);
    assert.equal(parseLookupQuery('a', '21').ok, false);
    const audit = parseAuditQuery({});
    assert.equal(audit.ok && audit.value.actionPrefix, 'commerce.');
    assert.equal(audit.ok && audit.value.pageSize, 20);
    assert.equal(parseAuditQuery({ userId: 'not-uuid' }).ok, false);
  });

  test('openId 掩码和来源文案', () => {
    assert.equal(maskOpenId('ox8f1234abcd5678a91c'), 'ox8f…a91c');
    assert.equal(entitlementSourceLabel('invite_first_submit', null), '邀请·首刷');
    assert.equal(entitlementSourceLabel('admin_grant', null), '后管补发');
    assert.equal(entitlementSourceLabel('session_pack_5', '场次加油包 ×5'), '场次加油包 ×5');
    assert.ok(ENTITLEMENT_LEDGER_REASONS.includes('admin_revoke'));
  });

  test('迁移、barrel 和后管页守住禁面', () => {
    const migration = readFileSync(
      join(repoRoot, 'apps/api/migrations/011_entitlement_admin_ops.sql'),
      'utf8',
    );
    assert.match(migration, /admin_revoke/);
    assert.match(migration, /entitlement_pending_grants/);
    assert.match(migration, /entitlement_pending_grants_user_status_idx/);
    assert.match(migration, /related_ref IS NOT NULL/);
    assert.equal(/payment|orders|wx_notify|unifiedorder|pay\/wx|mch_id/i.test(migration), false);
    const barrel = readFileSync(join(repoRoot, 'packages/shared/src/index.ts'), 'utf8');
    const server = readFileSync(join(repoRoot, 'packages/shared/src/entitlement-server.ts'), 'utf8');
    const browserTypes = readFileSync(join(repoRoot, 'packages/shared/src/entitlement-types.ts'), 'utf8');
    assert.equal(barrel.includes('entitlement-server'), false);
    assert.equal(barrel.includes('node:crypto'), false);
    assert.equal(barrel.includes('revokeInventoryLot'), false);
    assert.match(server, /export async function revokeInventoryLot/);
    assert.match(server, /node:crypto/);
    assert.match(browserTypes, /admin_revoke/);
    assert.equal(browserTypes.includes('node:crypto'), false);
    const page = readFileSync(
      join(repoRoot, 'apps/admin/src/pages/commerce/EntitlementsPage.tsx'),
      'utf8',
    );
    const nav = readFileSync(join(repoRoot, 'apps/admin/src/layout/nav.ts'), 'utf8');
    const app = readFileSync(join(repoRoot, 'apps/admin/src/App.tsx'), 'utf8');
    const controller = readFileSync(
      join(repoRoot, 'apps/api/src/admin-entitlement/entitlement-ops.controller.ts'),
      'utf8',
    );
    assert.match(page, /inventory（跨日库存）/);
    assert.match(page, /readOnly/);
    assert.match(page, /disabled/);
    assert.equal(page.includes('<select'), false);
    assert.equal(page.includes('name="endsAt"'), false);
    assert.equal(/pay\/wx|unifiedorder|wxpay|mch_id/i.test(page), false);
    assert.equal(/pay\/wx|unifiedorder|wxpay|mch_id/i.test(controller), false);
    assert.match(app, /EntitlementsPage/);
    assert.match(app, /\/commerce\/entitlements/);
    assert.match(app, /\/commerce\/audit/);
    assert.match(nav, /\/commerce\/entitlements/);
    assert.equal(/用户权益[\s\S]{0,120}disabled:\s*true/.test(nav), false);
  });
});
