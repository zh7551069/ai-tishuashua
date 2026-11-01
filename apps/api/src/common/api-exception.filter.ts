import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode, type ApiErrorBody } from '@tishuashua/shared';
import type { Response } from 'express';
import { isApiErrorBody, logServerError } from './api.exception';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      if (isApiErrorBody(raw)) {
        response.status(status).json(raw);
        return;
      }
      const body: ApiErrorBody = {
        code: codeForStatus(status),
        message: messageOf(raw, exception.message),
      };
      response.status(status).json(body);
      return;
    }

    logServerError('unhandled', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: ApiErrorCode.INTERNAL,
      message: 'Internal server error',
    } satisfies ApiErrorBody);
  }
}

function messageOf(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) {
    return raw;
  }
  if (raw && typeof raw === 'object' && 'message' in raw) {
    const message = (raw as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    if (Array.isArray(message)) {
      const parts = message.filter(
        (item): item is string => typeof item === 'string' && item.trim().length > 0,
      );
      if (parts.length > 0) {
        return parts.join('; ');
      }
    }
  }
  return fallback || '请求无法处理';
}

function codeForStatus(status: number): ApiErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ApiErrorCode.VALIDATION_ERROR;
    case HttpStatus.UNAUTHORIZED:
      return ApiErrorCode.UNAUTHORIZED;
    case HttpStatus.FORBIDDEN:
      return ApiErrorCode.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ApiErrorCode.NOT_FOUND;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ApiErrorCode.RATE_LIMITED;
    case HttpStatus.NOT_IMPLEMENTED:
      return ApiErrorCode.NOT_IMPLEMENTED;
    default:
      return ApiErrorCode.INTERNAL;
  }
}
