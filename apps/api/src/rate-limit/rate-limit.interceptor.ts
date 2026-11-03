import {
  type CallHandler,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiErrorCode } from '@tishuashua/shared';
import type { Request, Response } from 'express';
import { throwError, type Observable } from 'rxjs';
import { ApiException } from '../common/api.exception';
import { loadApiEnv } from '../config/env';
import { buildBuckets, classifyRoute, normalizeIp, RATE_LIMIT_MESSAGE } from './rate-limit.policy';
import { RateLimitService } from './rate-limit.service';

type RatedRequest = Request & {
  user?: { id?: unknown };
  admin?: { username?: unknown };
};

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  constructor(
    @Inject(RateLimitService) private readonly rates: RateLimitService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const env = loadApiEnv(this.config);
    if (!env.rateLimit.enabled) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<RatedRequest>();
    const route = classifyRoute(request.originalUrl || request.url || '', request.method || 'GET');
    const buckets = buildBuckets({
      route,
      ip: normalizeIp(request.ip || request.socket?.remoteAddress || undefined),
      userId: readId(request.user?.id),
      adminUsername: readId(request.admin?.username),
      loginUsername: loginUsername(route.kind, request.body),
      limits: env.rateLimit,
    });
    if (buckets.length === 0) {
      return next.handle();
    }

    const outcome = await this.rates.consume(
      buckets,
      env.rateLimit.windowSeconds,
      env.rateLimit.keyPrefix,
    );
    if (outcome.action !== 'limited') {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Retry-After', String(outcome.retryAfterSeconds));
    return throwError(
      () =>
        new ApiException(
          HttpStatus.TOO_MANY_REQUESTS,
          ApiErrorCode.RATE_LIMITED,
          RATE_LIMIT_MESSAGE,
        ),
    );
  }
}

function readId(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function loginUsername(kind: string, body: unknown): unknown {
  if (kind !== 'admin-login' || !body || typeof body !== 'object') {
    return undefined;
  }
  return (body as { username?: unknown }).username;
}
