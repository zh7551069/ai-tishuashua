import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  RATE_LIMIT_DEFAULTS,
  RATE_LIMIT_KEY_PREFIX,
  accountSubject,
  buildBuckets,
  classifyRoute,
  normalizeApiPath,
  normalizeIp,
  parseRateLimitSettings,
  rateLimitEnabled,
  rateLimitExceeded,
  rateLimitKey,
} from './rate-limit.policy';

const limits = parseRateLimitSettings(() => '');

describe('rate limit settings', () => {
  test('不填则开启，只有 false 或 0 关闭', () => {
    assert.equal(rateLimitEnabled(''), true);
    assert.equal(rateLimitEnabled('true'), true);
    assert.equal(rateLimitEnabled('TRUE'), true);
    assert.equal(rateLimitEnabled('1'), true);
    assert.equal(rateLimitEnabled('yes'), true);
    assert.equal(rateLimitEnabled('false'), false);
    assert.equal(rateLimitEnabled('FALSE'), false);
    assert.equal(rateLimitEnabled('0'), false);
  });

  test('缺省阈值稳定，非法数字回落，键前缀补冒号', () => {
    assert.equal(limits.enabled, true);
    assert.equal(limits.windowSeconds, RATE_LIMIT_DEFAULTS.windowSeconds);
    assert.equal(limits.wechatLoginMax, 60);
    assert.equal(limits.adminLoginMax, 30);
    assert.equal(limits.keyPrefix, RATE_LIMIT_KEY_PREFIX);

    const parsed = parseRateLimitSettings((key) => {
      const values: Record<string, string> = {
        RATE_LIMIT_ENABLED: 'false',
        RATE_LIMIT_WINDOW_SECONDS: '0',
        RATE_LIMIT_WECHAT_LOGIN_MAX: '15',
        RATE_LIMIT_ADMIN_LOGIN_MAX: 'nope',
        RATE_LIMIT_KEY_PREFIX: 'custom-prefix',
      };
      return values[key] ?? '';
    });
    assert.equal(parsed.enabled, false);
    assert.equal(parsed.windowSeconds, RATE_LIMIT_DEFAULTS.windowSeconds);
    assert.equal(parsed.wechatLoginMax, 15);
    assert.equal(parsed.adminLoginMax, RATE_LIMIT_DEFAULTS.adminLoginMax);
    assert.equal(parsed.keyPrefix, 'custom-prefix:');

    const invalidPrefix = parseRateLimitSettings((key) =>
      key === 'RATE_LIMIT_KEY_PREFIX' ? 'has space' : '',
    );
    assert.equal(invalidPrefix.keyPrefix, RATE_LIMIT_KEY_PREFIX);
  });
});

describe('rate limit routes', () => {
  test('去掉查询串和全局前缀', () => {
    assert.equal(normalizeApiPath('/api/health?ready=1'), '/health');
    assert.equal(normalizeApiPath('/api/auth/wechat/login/'), '/auth/wechat/login');
    assert.equal(normalizeApiPath('quiz/sessions'), '/quiz/sessions');
  });

  test('健康检查和文档不计，登录与后管分开', () => {
    assert.equal(classifyRoute('/api/health', 'GET').kind, 'skip');
    assert.equal(classifyRoute('/api/health/ready', 'GET').kind, 'skip');
    assert.equal(classifyRoute('/api/docs', 'GET').kind, 'skip');
    assert.equal(classifyRoute('/api/docs/swagger-ui.css', 'GET').kind, 'skip');
    assert.equal(classifyRoute('/api/auth/wechat/login', 'OPTIONS').kind, 'skip');
    assert.equal(classifyRoute('/api/auth/wechat/login', 'POST').kind, 'wechat-login');
    assert.equal(classifyRoute('/api/admin/login', 'POST').kind, 'admin-login');
    assert.equal(classifyRoute('/api/admin/ping', 'GET').kind, 'admin-api');
    assert.equal(classifyRoute('/api/certificates', 'GET').kind, 'public');
    assert.equal(classifyRoute('/api/certificates/scores', 'GET').kind, 'public');
    assert.equal(classifyRoute('/api/users/me', 'GET').kind, 'wechat-api');
  });

  test('出题创建和课件上传单独分档，交卷和成绩列表不在这档', () => {
    const create = classifyRoute('/api/quiz/sessions', 'POST');
    assert.equal(create.kind, 'wechat-api');
    assert.equal(create.expensive, 'quiz-create');
    assert.equal(classifyRoute('/api/quiz/sessions', 'GET').expensive, null);
    assert.equal(classifyRoute('/api/quiz/sessions/abc/submit', 'POST').expensive, null);
    assert.equal(classifyRoute('/api/quiz/sessions/abc/answers', 'POST').expensive, null);

    const upload = classifyRoute('/api/courseware/uploads', 'POST');
    assert.equal(upload.expensive, 'courseware-upload');
    assert.equal(classifyRoute('/api/courseware/jobs/abc/commit', 'POST').expensive, null);
  });

  test('同一 IP 的微信登录和后管登录不是同一把钥匙', () => {
    const ip = '203.0.113.10';
    const wechat = buildBuckets({
      route: classifyRoute('/api/auth/wechat/login', 'POST'),
      ip,
      limits,
    });
    const admin = buildBuckets({
      route: classifyRoute('/api/admin/login', 'POST'),
      ip,
      loginUsername: ' Admin ',
      limits,
    });
    assert.equal(wechat.length, 1);
    assert.equal(admin.length, 2);
    assert.equal(
      rateLimitKey(limits.keyPrefix, wechat[0]),
      `${RATE_LIMIT_KEY_PREFIX}wechat-login:ip:${ip}`,
    );
    assert.notEqual(wechat[0]?.scope, admin[0]?.scope);
    assert.equal(admin[1]?.subject, accountSubject('Admin'));
    assert.equal(accountSubject(' Admin '), accountSubject('Admin'));
    assert.notEqual(accountSubject('Admin'), accountSubject('other'));
    assert.equal(accountSubject('   '), null);
    assert.equal(accountSubject(1), null);
  });

  test('已登录接口按用户，出题创建再加一档；健康检查没有桶', () => {
    const buckets = buildBuckets({
      route: classifyRoute('/api/quiz/sessions', 'POST'),
      ip: '127.0.0.1',
      userId: 'user-1',
      limits,
    });
    assert.deepEqual(
      buckets.map((bucket) => bucket.scope),
      ['wechat-api', 'wechat-api', 'quiz-create'],
    );
    assert.equal(buckets[1]?.subject, 'user:user-1');
    assert.equal(buckets[2]?.limit, limits.quizCreateMax);

    const admin = buildBuckets({
      route: classifyRoute('/api/admin/ping', 'GET'),
      ip: '127.0.0.1',
      adminUsername: 'ops',
      limits,
    });
    assert.deepEqual(
      admin.map((bucket) => `${bucket.scope}:${bucket.subject}`),
      ['admin-api:ip:127.0.0.1', 'admin-api:admin:ops'],
    );
    assert.equal(
      buildBuckets({ route: classifyRoute('/api/health', 'GET'), ip: '1.1.1.1', limits }).length,
      0,
    );
  });
});

describe('rate limit decision', () => {
  test('来源 IP 只接受点分和冒号', () => {
    assert.equal(normalizeIp('::ffff:127.0.0.1'), '127.0.0.1');
    assert.equal(normalizeIp('203.0.113.8'), '203.0.113.8');
    assert.equal(normalizeIp('fe80::1'), 'fe80::1');
    assert.equal(normalizeIp(''), 'unknown');
    assert.equal(normalizeIp('1.2.3.4\nSET'), 'unknown');
    assert.equal(normalizeIp(undefined), 'unknown');
  });

  test('窗口内第 N 次放行，第 N+1 次拒绝，并给出至少 1 秒', () => {
    assert.equal(
      rateLimitExceeded([
        { current: 2, ttlSeconds: 10, limit: 2 },
        { current: 1, ttlSeconds: 40, limit: 2 },
      ]),
      null,
    );
    assert.deepEqual(
      rateLimitExceeded([
        { current: 3, ttlSeconds: 9, limit: 2 },
        { current: 4, ttlSeconds: 21, limit: 2 },
      ]),
      { retryAfterSeconds: 21 },
    );
    assert.deepEqual(rateLimitExceeded([{ current: 2, ttlSeconds: 0, limit: 1 }]), {
      retryAfterSeconds: 1,
    });
  });
});
