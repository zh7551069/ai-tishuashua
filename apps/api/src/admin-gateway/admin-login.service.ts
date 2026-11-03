import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode, type AdminLoginRequest, type AdminLoginResponse } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { loadApiEnv } from '../config/env';
import { SessionService } from '../session/session.service';
import { configuredAdminAccount, credentialsMatch } from './admin-credentials';

@Injectable()
export class AdminLoginService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async login(input: AdminLoginRequest): Promise<AdminLoginResponse> {
    const env = loadApiEnv(this.config);
    const account = configuredAdminAccount(env.adminUsername, env.adminPassword);
    if (!account) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.ADMIN_NOT_CONFIGURED,
        '管理后台帐号未配置',
      );
    }

    const username = input.username.trim();
    if (!credentialsMatch({ username, password: input.password }, account)) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        '用户名或密码不正确',
      );
    }

    const session = await this.sessions.createAdmin(account.username);
    return {
      token: session.token,
      expiresAt: session.expiresAt,
      admin: { username: account.username },
    };
  }
}
