import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { parseGrowthLaunch } from './growth-launch';

const miniRoot = join(__dirname, '../..');

test('冷启动只解析 shareToken 和 inviteCode', () => {
  assert.deepEqual(
    parseGrowthLaunch({
      shareToken: 'a'.repeat(20),
      inviteCode: 'ts-ab23cd',
    }),
    { shareToken: 'a'.repeat(20), inviteCode: 'TS-AB23CD' },
  );
  assert.deepEqual(parseGrowthLaunch({ shareToken: 'short', inviteCode: 'nope' }), {
    shareToken: null,
    inviteCode: null,
  });
});

test('分享、邀请和任务占位不支付，也不写死奖额', () => {
  const files = [
    'src/pages/commerce/tasks/index.tsx',
    'src/pages/commerce/daily-share/index.tsx',
    'src/pages/commerce/invite/index.tsx',
    'src/pages/commerce/growth-shell.tsx',
    'src/services/commerce-api.ts',
    'src/services/growth-launch.ts',
  ].map((file) => readFileSync(join(miniRoot, file), 'utf8'));
  const joined = files.join('\n');
  assert.equal(
    /requestPayment|mock-notify|upgrade-quote|\/api\/orders|wx\.requestPayment/.test(joined),
    false,
  );
  assert.equal(joined.includes('membership-pay'), false);
  assert.equal(joined.includes('session-pack-pay'), false);
  assert.equal(joined.includes('rewardSessions: 1'), false);
  assert.equal(joined.includes('dailyCapSessions: 6'), false);
  assert.equal(joined.includes('122:8'), false);
  assert.equal(joined.includes('122:10'), false);
  assert.match(files[1] ?? '', /fetchGrowth/);
  assert.match(files[2] ?? '', /fetchGrowth/);
  assert.match(files[0] ?? '', /ME_DAILY_SHARE_ROUTE/);
  assert.match(files[0] ?? '', /ME_INVITE_ROUTE/);
  const config = readFileSync(join(miniRoot, 'src/app.config.ts'), 'utf8');
  assert.match(config, /pages\/commerce\/daily-share\/index/);
  assert.match(config, /pages\/commerce\/invite\/index/);
  const me = readFileSync(join(miniRoot, 'src/pages/me/index.tsx'), 'utf8');
  assert.match(me, /postGrowthCheckin/);
  assert.equal(/requestPayment|\/api\/orders/.test(me), false);
});
