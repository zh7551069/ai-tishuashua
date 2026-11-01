import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';

export class ApiException extends HttpException {
  constructor(status: HttpStatus, code: ApiErrorCode, message: string) {
    const body: ApiErrorBody = { code, message };
    super(body, status);
  }
}

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const body = value as Partial<ApiErrorBody>;
  return typeof body.code === 'string' && typeof body.message === 'string';
}

/** 日志只留错误摘要，避免把连接串或微信密钥打出来。 */
export function logServerError(scope: string, error: unknown): void {
  const message = error instanceof Error ? error.message : 'unknown error';
  console.error(`[api] ${scope}: ${message}`);
}
