import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import {
  GenerationConfigNotFoundError,
  GenerationConfigValidationError,
} from './generation-config.errors';

export function runGenerationConfig<T>(scope: string, fn: () => Promise<T>): Promise<T> {
  return fn().catch((error: unknown) => {
    if (error instanceof ApiException) {
      throw error;
    }
    if (error instanceof GenerationConfigValidationError) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, error.message);
    }
    if (error instanceof GenerationConfigNotFoundError) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, error.message);
    }
    if (isPgCode(error, '23505')) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '编码已存在');
    }
    if (isPgCode(error, '23514')) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '字段不符合约束');
    }
    rethrowDatabaseError(scope, error);
  });
}
