import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiErrorCode, type AdminSummary } from '@tishuashua/shared';
import type { Request } from 'express';
import { ApiException } from '../common/api.exception';
import { SessionService } from '../session/session.service';

export const ADMIN_ROUTE_PUBLIC = 'adminRoutePublic';

/** 登录接口不需要会话。控制器上的守卫默认保护其余路由。 */
export const PublicAdmin = () => SetMetadata(ADMIN_ROUTE_PUBLIC, true);

export type AdminRequest = Request & { admin: AdminSummary; adminToken: string };

@Injectable()
export class AdminSessionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(ADMIN_ROUTE_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    const token = readBearer(request.headers.authorization);
    if (!token) {
      throw new ApiException(HttpStatus.UNAUTHORIZED, ApiErrorCode.UNAUTHORIZED, '缺少登录会话');
    }

    const session = await this.sessions.resolveAdmin(token);
    if (!session) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        '登录已失效，请重新登录',
      );
    }

    request.adminToken = token;
    request.admin = { username: session.username };
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
