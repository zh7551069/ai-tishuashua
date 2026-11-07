import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(__filename);
const sharedRoot = join(__dirname, '../../../../packages/shared');

test('parsePublicSkuList 从 @tishuashua/shared 入口拿到的是函数', () => {
  const shared = require('@tishuashua/shared') as {
    parsePublicSkuList: (value: unknown) => unknown;
  };
  assert.equal(typeof shared.parsePublicSkuList, 'function');

  const parsed = shared.parsePublicSkuList([
    {
      code: 'member_month',
      type: 'member',
      name: '月卡',
      priceFen: 1980,
      priceYuan: 19.8,
      durationDays: 30,
      sessions: null,
      inventoryExpireDays: null,
      summary: '不限场',
      recommended: true,
    },
  ]) as { code: string }[] | null;
  assert.equal(parsed?.[0]?.code, 'member_month');
  assert.deepEqual(shared.parsePublicSkuList([]), []);
  assert.equal(shared.parsePublicSkuList({ items: [] }), null);
  assert.equal(shared.parsePublicSkuList([{ code: 'Bad-Code' }]), null);

  const entry = readFileSync(join(sharedRoot, 'dist/index.js'), 'utf8');
  assert.match(entry, /function parsePublicSkuList\(/);
  assert.match(entry, /exports\.parsePublicSkuList = parsePublicSkuList/);
  const barrel = readFileSync(join(sharedRoot, 'src/index.ts'), 'utf8');
  assert.equal(barrel.includes('node:crypto'), false);
  assert.equal(barrel.includes('entitlement-server'), false);
});
