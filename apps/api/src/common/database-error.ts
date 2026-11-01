import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { ApiException, logServerError } from './api.exception';

export function isPgCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export function rethrowDatabaseError(scope: string, error: unknown): never {
  if (error instanceof ApiException) {
    throw error;
  }
  logServerError(scope, error);
  throw new ApiException(
    HttpStatus.SERVICE_UNAVAILABLE,
    ApiErrorCode.DATABASE_UNAVAILABLE,
    '数据库不可用',
  );
}
