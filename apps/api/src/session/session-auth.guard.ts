import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { ApiErrorCode, type UserSummary } from '@tishuashua/shared';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception';
import { UserRepository } from '../user/user.repository';
import { SessionService } from './session.service';

export type AuthenticatedRequest = Request & { user: UserSummary };

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessions: SessionService,
    @Inject(UserRepository) private readonly users: UserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readBearer(request.headers.authorization);
    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ApiErrorCode.UNAUTHORIZED, '缺少登录会话');
    }

    const session = await this.sessions.resolve(token);
    if (!session) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        '登录已失效，请重新登录',
      );
    }

    const user = await this.users.findById(session.userId);
    if (!user) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        '登录已失效，请重新登录',
      );
    }
    if (user.status === 'banned') {
      throw new ApiException(HttpStatus.FORBIDDEN, ApiErrorCode.FORBIDDEN, '账号已停用');
    }

    request.user = user;
    return true;
  }
}

function readBearer(header: string | string[] | undefined): string | null {
  const value = Array.isArray(header) ? header[0] : header;
  if (!value) {
    return null;
  }
  const match = /^Bearer\s+(\S+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}
