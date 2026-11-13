import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import type { UserSummary } from '@tishuashua/shared';
import { AttemptGate, isAccountDisabled, withSuggestedSyncDeadline } from './flow';
import { buildProfile } from './profile';

const pageDir = __dirname;
const exportDir = join(pageDir, '../../../../../design/bridge-export/tb46-wechat-login');

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function user(partial: Partial<UserSummary>): UserSummary {
  return {
    id: 'user-1',
    wxOpenId: 'openid',
    unionId: null,
    nick: null,
    phoneMasked: null,
    phoneBound: false,
    avatar: null,
    status: 'active',
    ...partial,
  };
}

describe('login profile', () => {
  test('同步中三行都在进行，没有底部文案，也不套示例号', () => {
    const model = buildProfile(null, 'syncing');
    assert.equal(model.title, '正在同步微信资料');
    assert.equal(model.subtitle, '授权已通过，请稍候即可开始备考');
    assert.equal(model.progressLabel, '资料补全中 0/3');
    assert.deepEqual(
      model.rows.map((row) => row.value),
      ['同步中…', '同步中…', '同步中…'],
    );
    assert.equal(JSON.stringify(model).includes('138****2160'), false);
    assert.equal(JSON.stringify(model).includes('辉'), false);
  });

  test('整次写入失败时三行都标未能写入', () => {
    const model = buildProfile(null, 'failed');
    assert.equal(model.title, '同步失败');
    assert.equal(model.subtitle, '微信资料未能写入，请重试');
    assert.equal(model.progressLabel, '资料写入失败 0/3');
    assert.equal(model.rows.every((row) => row.state === 'failed' && row.value === '未能写入'), true);
  });

  test('三行都有时可以开始备考，头像用真实地址', () => {
    const model = buildProfile(
      user({
        nick: '测试同学',
        avatar: 'https://cdn.example/a.png',
        phoneBound: true,
        phoneMasked: '139****0000',
      }),
      'ready',
    );
    assert.equal(model.subtitle, '已自动注册账号，微信资料已写入');
    assert.equal(model.progressLabel, '资料已补全 3/3');
    assert.equal(model.fill, 'full');
    assert.equal(model.doneCount, 3);
    assert.equal(model.rows[0]?.imageUrl, 'https://cdn.example/a.png');
    assert.equal(model.rows[1]?.value, '测试同学');
    assert.equal(model.rows[2]?.value, '139****0000');
  });

  test('未绑定手机号仍是成功态，不标失败', () => {
    const model = buildProfile(user({ nick: '测试同学', avatar: '' }), 'ready');
    assert.equal(model.fill, 'partial');
    assert.equal(model.doneCount, 2);
    assert.equal(model.rows[2]?.state, 'later');
    assert.equal(model.rows[2]?.value, '稍后在设置中补全');
    assert.equal(model.subtitle, '已自动注册账号，手机号可稍后在设置中补全');
    assert.equal(model.rows[0]?.initial, '测');
    assert.equal(model.rows[0]?.imageUrl, '');
  });
});

describe('login attempt gate', () => {
  test('取消后迟到结果不再算当前一次', () => {
    const gate = new AttemptGate();
    const attempt = gate.issue();
    gate.invalidate();
    assert.equal(gate.isCurrent(attempt), false);
  });

  test('账号已停用只认 403 / FORBIDDEN / 文案', () => {
    assert.equal(isAccountDisabled({ status: 403 }), true);
    assert.equal(isAccountDisabled({ code: 'FORBIDDEN' }), true);
    assert.equal(isAccountDisabled({ message: '账号已停用' }), true);
    assert.equal(isAccountDisabled({ status: 500, code: 'WECHAT_UNAVAILABLE' }), false);
    assert.equal(isAccountDisabled(new Error('授权已取消')), false);
  });

  test('建议等待到期后拒绝，迟到成功不会再兑现', async () => {
    let late: string | undefined;
    const task = new Promise<string>((resolve) => {
      setTimeout(() => {
        late = 'session';
        resolve('session');
      }, 30);
    });
    await assert.rejects(withSuggestedSyncDeadline(task, 5), /同步超时/);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(late, 'session');
  });
});

describe('login page sources', () => {
  test('页面接线不新造接口，也不写死稿面示例', () => {
    const sources = ['index.tsx', 'ui.tsx', 'profile.ts', 'flow.ts', 'index.css', 'index.config.ts']
      .map((name) => readFileSync(join(pageDir, name), 'utf8'))
      .join('\n');
    const folded = sources.toLowerCase();
    for (const forbidden of [
      'getUserProfile',
      'getPhoneNumber',
      '/users/me/phone',
      'showToast',
      '138****2160',
      '辉 曾',
      'yg-sheet',
      'u-btn-off',
      'auth-btn',
      '--ts-tint',
      '#F4F8E8',
    ]) {
      assert.equal(folded.includes(forbidden.toLowerCase()), false, forbidden);
    }
    for (const required of [
      'requestWechatLoginCode',
      'loginWithWechatCode',
      '/pages/home/index',
      '/pages/legal/terms/index',
      '/pages/legal/privacy/index',
      '微信一键登录',
      '重新授权',
      '重新同步',
      '开始备考',
      '将进入首页，选择领域与证书',
      '#F5F5F7',
      '#8ECA3A',
      '#6E6E73',
    ]) {
      assert.equal(folded.includes(required.toLowerCase()), true, required);
    }
  });

  test('样式导出与页内主视觉字节未改', () => {
    const expected = [
      ['index.html', 96797, '0b87c2be30db9600be1b45f003a45f19678e8ad5810a96c32655690b6039e7fa'],
      ['styles.css', 7640, '47dc9cdbdf263b4850b5e1789c3616c8057af808a5d7f21d1c745bf552026f7e'],
      [
        'images/7000ff15809536912845ea100bbeb017844231ad.png',
        523493,
        '18765a77acdf4190a9beb5875bfa1f711a84396ca6f8ad10777ca1d4a01aef84',
      ],
    ] as const;
    for (const [name, size, hash] of expected) {
      const path = join(exportDir, name);
      assert.equal(statSync(path).size, size, name);
      assert.equal(sha256(path), hash, name);
    }
    assert.equal(
      sha256(join(pageDir, 'assets/board-mark.png')),
      '18765a77acdf4190a9beb5875bfa1f711a84396ca6f8ad10777ca1d4a01aef84',
    );
  });
});
