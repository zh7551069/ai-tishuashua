import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { describeConfiguredServices, loadApiEnv } from './env';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
}

describe('loadApiEnv', () => {
  test('只有 true 或 1 才打开 mock', () => {
    const cases: Array<[string | undefined, boolean]> = [
      [undefined, false],
      ['', false],
      ['false', false],
      ['no', false],
      ['yes', false],
      ['true', true],
      ['TRUE', true],
      ['1', true],
    ];

    for (const [raw, expected] of cases) {
      const env = loadApiEnv(configWith({ WECHAT_LOGIN_MOCK: raw }));
      assert.equal(env.wechatLoginMock, expected, `WECHAT_LOGIN_MOCK=${String(raw)}`);
      const llm = loadApiEnv(configWith({ LLM_MOCK: raw }));
      assert.equal(llm.llmMock, expected, `LLM_MOCK=${String(raw)}`);
    }
  });

  test('管理后台帐号只报告是否配齐，日志不含口令', () => {
    const missing = loadApiEnv(configWith({ ADMIN_USERNAME: ' admin ' }));
    assert.equal(missing.adminUsername, 'admin');
    assert.equal(missing.adminPassword, '');
    assert.match(describeConfiguredServices(missing), /admin=missing/);

    const ready = loadApiEnv(
      configWith({ ADMIN_USERNAME: ' admin ', ADMIN_PASSWORD: ' local-secret ' }),
    );
    assert.equal(ready.adminUsername, 'admin');
    assert.equal(ready.adminPassword, 'local-secret');
    const described = describeConfiguredServices(ready);
    assert.match(described, /admin=configured/);
    assert.match(described, /rateLimit=on/);
    assert.equal(described.includes('local-secret'), false);
    assert.equal(described.includes('admin '), false);
  });

  test('支付只报告模式，日志不含密钥', () => {
    const mock = loadApiEnv(
      configWith({
        WECHAT_PAY_MOCK: 'true',
        WECHAT_PAY_API_V3_KEY: 'should-not-appear',
        WECHAT_PAY_PRIVATE_KEY: 'should-not-appear-either',
      }),
    );
    assert.equal(mock.wechatPayMock, true);
    assert.equal(mock.wechatPayApiV3Key, 'should-not-appear');
    const described = describeConfiguredServices(mock);
    assert.equal(described.includes('should-not-appear'), false);
    if ((process.env.NODE_ENV ?? '') === 'production') {
      assert.match(described, /pay=missing/);
    } else {
      assert.match(described, /pay=mock/);
    }

    const forcedOff = loadApiEnv(configWith({ WECHAT_PAY_ENABLED: '0', WECHAT_PAY_MOCK: 'true' }));
    assert.equal(forcedOff.wechatPayEnabled, 'off');
    assert.match(describeConfiguredServices(forcedOff), /pay=off/);

    const missing = loadApiEnv(configWith({ WECHAT_PAY_MOCK: 'yes' }));
    assert.equal(missing.wechatPayMock, false);
    assert.match(describeConfiguredServices(missing), /pay=missing/);
  });

  test('限流默认开启，false 或 0 关闭，不信任代理', () => {
    const defaults = loadApiEnv(configWith({}));
    assert.equal(defaults.rateLimit.enabled, true);
    assert.equal(defaults.rateLimit.windowSeconds, 60);
    assert.equal(defaults.rateLimit.wechatLoginMax, 60);
    assert.equal(defaults.rateLimit.adminLoginMax, 30);
    assert.equal(defaults.trustProxy, false);
    assert.match(describeConfiguredServices(defaults), /rateLimit=on/);

    const off = loadApiEnv(configWith({ RATE_LIMIT_ENABLED: 'false', TRUST_PROXY: '1' }));
    assert.equal(off.rateLimit.enabled, false);
    assert.equal(off.trustProxy, true);
    assert.match(describeConfiguredServices(off), /rateLimit=off/);
  });
});
