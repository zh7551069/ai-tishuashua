import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ConfigService } from '@nestjs/config';
import { loadApiEnv } from './env';

function configWith(values: Record<string, string | undefined>): ConfigService {
  return {
    get(key: string) {
      return values[key];
    },
  } as ConfigService;
}

describe('loadApiEnv wechat mock', () => {
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
    }
  });
});
