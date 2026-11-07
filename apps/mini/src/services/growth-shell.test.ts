import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { growthLaunchDisposition, parseGrowthLaunch } from './growth-launch';

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
  assert.equal(growthLaunchDisposition(400, 'GROWTH_SELF_INVITE'), 'clear');
  assert.equal(growthLaunchDisposition(0, undefined), 'keep');
});

test('分享、邀请和任务对稿不支付，也不写死奖额', () => {
  const files = [
    'src/pages/commerce/tasks/index.tsx',
    'src/pages/commerce/daily-share/index.tsx',
    'src/pages/commerce/invite/index.tsx',
    'src/services/growth-present.ts',
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
  assert.equal(joined.includes('v2.0.0'), false);
  assert.equal(joined.includes('TS-HU8'), false);
  assert.equal(joined.includes('改发'), false);
  assert.equal(joined.includes('日封顶 6'), false);
  assert.equal(joined.includes('周封顶 15'), false);
  assert.equal(joined.includes('+1 场'), false);
  assert.match(files[1] ?? '', /122:8/);
  assert.match(files[1] ?? '', /fetchGrowth/);
  assert.match(files[1] ?? '', /postGrowthShareToken/);
  assert.match(files[1] ?? '', /useShareAppMessage/);
  assert.match(files[1] ?? '', /useShareTimeline/);
  assert.match(files[3] ?? '', /分享给微信好友/);
  assert.match(files[3] ?? '', /分享到朋友圈/);
  assert.match(files[2] ?? '', /122:10/);
  assert.match(files[2] ?? '', /fetchGrowth/);
  assert.match(files[2] ?? '', /useShareAppMessage/);
  assert.match(files[3] ?? '', /分享邀请海报 \/ 链接/);
  assert.match(files[0] ?? '', /ME_DAILY_SHARE_ROUTE/);
  assert.match(files[0] ?? '', /ME_INVITE_ROUTE/);
  assert.equal((files[0] ?? '').includes('即将上线'), false);
  const config = readFileSync(join(miniRoot, 'src/app.config.ts'), 'utf8');
  assert.match(config, /pages\/commerce\/daily-share\/index/);
  assert.match(config, /pages\/commerce\/invite\/index/);
  const me = readFileSync(join(miniRoot, 'src/pages/me/index.tsx'), 'utf8');
  assert.match(me, /postGrowthCheckin/);
  assert.equal(/requestPayment|\/api\/orders/.test(me), false);
});
