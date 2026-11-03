import { Inject, Injectable } from '@nestjs/common';
import type { UserSummary } from '@tishuashua/shared';
import { maskPhoneNumber } from '../auth/phone-mask';
import { WechatPhoneExchange } from '../auth/wechat-phone.exchange';
import { UserRepository } from './user.repository';

/**
 * 在已有微信会话下绑定手机号。
 * 不签发新 token，也不接受短信验证码。
 */
@Injectable()
export class WechatPhoneService {
  constructor(
    @Inject(WechatPhoneExchange) private readonly wechat: WechatPhoneExchange,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async bind(userId: string, code: string): Promise<UserSummary> {
    const phone = await this.wechat.exchange(code);
    const phoneMasked = maskPhoneNumber(phone.nationalNumber);
    return this.users.bindPhone(userId, phoneMasked);
  }
}
