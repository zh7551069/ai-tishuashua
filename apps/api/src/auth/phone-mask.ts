import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';

/** 11 位号码写成 138****8000；更短的号码只留头两位和末两位。 */
const MASKED_PHONE = /^(?:\d{3}\*{4}\d{4}|\d{2}\*{4}\d{2})$/;

export function isMaskedPhone(value: string): boolean {
  return MASKED_PHONE.test(value);
}

/**
 * 把不含区号的数字串收成展示值。
 * 不合法时按微信上游失败处理，避免把原始号码写进错误信息。
 */
export function maskPhoneNumber(nationalNumber: string): string {
  if (!/^\d{7,15}$/.test(nationalNumber)) {
    throw new ApiException(
      HttpStatus.BAD_GATEWAY,
      ApiErrorCode.WECHAT_UNAVAILABLE,
      '微信手机号服务暂不可用',
    );
  }
  if (nationalNumber.length >= 11) {
    return `${nationalNumber.slice(0, 3)}****${nationalNumber.slice(-4)}`;
  }
  return `${nationalNumber.slice(0, 2)}****${nationalNumber.slice(-2)}`;
}
