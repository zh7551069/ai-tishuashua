import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody, type UserSummary } from '@tishuashua/shared';
import { WechatPhoneExchange } from '../auth/wechat-phone.exchange';
import { ApiException } from '../common/api.exception';
import { UserRepository } from './user.repository';
import { WechatPhoneService } from './wechat-phone.service';

const RAW_PHONE = '13800138000';

class MemoryUsers {
  readonly rows = new Map<string, UserSummary>();
  readonly stored: string[] = [];

  seed(): UserSummary {
    const user: UserSummary = {
      id: randomUUID(),
      wxOpenId: 'oid-1',
      unionId: null,
      nick: '备考同学',
      phoneMasked: null,
      phoneBound: false,
      avatar: null,
      status: 'active',
    };
    this.rows.set(user.id, user);
    return user;
  }

  async bindPhone(id: string, phoneMasked: string): Promise<UserSummary> {
    const current = this.rows.get(id);
    if (!current) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '用户不存在');
    }
    const next: UserSummary = { ...current, phoneMasked, phoneBound: true };
    this.rows.set(id, next);
    this.stored.push(phoneMasked);
    return next;
  }
}

function serviceWith(users: MemoryUsers, mock = true): WechatPhoneService {
  return new WechatPhoneService(
    new WechatPhoneExchange({ appId: '', appSecret: '', mock }),
    users as unknown as UserRepository,
  );
}

describe('WechatPhoneService', () => {
  test('mock 绑定成功只留下脱敏号，再次授权会覆盖', async () => {
    const users = new MemoryUsers();
    const user = users.seed();
    const service = serviceWith(users);

    const bound = await service.bind(user.id, `mock-phone-${RAW_PHONE}`);
    assert.equal(bound.phoneBound, true);
    assert.equal(bound.phoneMasked, '138****8000');
    assert.equal(bound.nick, '备考同学');
    assert.equal(JSON.stringify(bound).includes(RAW_PHONE), false);
    assert.deepEqual(users.stored, ['138****8000']);

    const updated = await service.bind(user.id, 'mock-phone-13900139000');
    assert.equal(updated.phoneMasked, '139****9000');
    assert.equal(updated.id, user.id);
    assert.equal(JSON.stringify(updated).includes('13900139000'), false);
  });

  test('坏凭证不写用户，未找到用户时保持错误码', async () => {
    const users = new MemoryUsers();
    const user = users.seed();
    const service = serviceWith(users);

    await assert.rejects(
      () => service.bind(user.id, 'mock-fail'),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        assert.equal(error.getStatus(), HttpStatus.UNAUTHORIZED);
        assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_AUTH_FAILED);
        return true;
      },
    );
    assert.equal(users.rows.get(user.id)?.phoneBound, false);
    assert.equal(users.rows.get(user.id)?.phoneMasked, null);
    assert.deepEqual(users.stored, []);

    await assert.rejects(
      () => service.bind('missing-user', `mock-phone-${RAW_PHONE}`),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.NOT_FOUND);
        return true;
      },
    );
  });
});
