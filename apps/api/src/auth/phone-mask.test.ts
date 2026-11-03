import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { isMaskedPhone, maskPhoneNumber } from './phone-mask';

describe('maskPhoneNumber', () => {
  test('11 位号码脱敏成头三位加末四位，且不保留原号', () => {
    const masked = maskPhoneNumber('13800138000');
    assert.equal(masked, '138****8000');
    assert.equal(masked.includes('13800138000'), false);
    assert.equal(isMaskedPhone(masked), true);
  });

  test('不足 11 位时只留头两位和末两位', () => {
    const masked = maskPhoneNumber('12345678');
    assert.equal(masked, '12****78');
    assert.equal(masked.includes('12345678'), false);
    assert.equal(isMaskedPhone(masked), true);
  });

  test('过短或带符号的号码不写入展示值', () => {
    assert.throws(
      () => maskPhoneNumber('138-0013-8000'),
      (error: unknown) => {
        assert.ok(error instanceof ApiException);
        assert.equal(error.getStatus(), HttpStatus.BAD_GATEWAY);
        assert.equal((error.getResponse() as ApiErrorBody).code, ApiErrorCode.WECHAT_UNAVAILABLE);
        assert.equal(JSON.stringify(error.getResponse()).includes('138'), false);
        return true;
      },
    );
    assert.equal(isMaskedPhone('13800138000'), false);
    assert.equal(isMaskedPhone('138****2160'), true);
  });
});
