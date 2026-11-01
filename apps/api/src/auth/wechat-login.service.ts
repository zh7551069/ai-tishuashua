import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type WechatLoginResponse } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { SessionService } from '../session/session.service';
import { UserRepository } from '../user/user.repository';
import { WechatCodeExchange } from './wechat-code.exchange';

export interface WechatLoginInput {
  code: string;
  nick?: string;
  avatar?: string;
}

@Injectable()
export class WechatLoginService {
  constructor(
    @Inject(WechatCodeExchange) private readonly wechat: WechatCodeExchange,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async login(input: WechatLoginInput): Promise<WechatLoginResponse> {
    const identity = await this.wechat.exchange(input.code);
    const user = await this.users.upsertByOpenId({
      wxOpenId: identity.openId,
      unionId: identity.unionId,
      nick: input.nick ?? null,
      avatar: input.avatar ?? null,
    });
    if (user.status === 'banned') {
      throw new ApiException(HttpStatus.FORBIDDEN, ApiErrorCode.FORBIDDEN, '账号已停用');
    }
    const session = await this.sessions.create(user.id);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user,
    };
  }
}
