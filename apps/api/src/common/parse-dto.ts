import { HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import { plainToInstance } from 'class-transformer';
import { validate, type ValidationError } from 'class-validator';
import { ApiException } from './api.exception';

/**
 * 显式校验 DTO。
 * 开发命令使用 tsx，不会生成 design:paramtypes，全局 ValidationPipe 因此看不到 body 的类。
 * tsc 产物里管道和这里会各校验一次，结果一致。
 */
export async function parseDto<T extends object>(cls: new () => T, value: unknown): Promise<T> {
  const payload = value !== null && typeof value === 'object' ? value : {};
  const dto = plainToInstance(cls, payload);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length === 0) {
    return dto;
  }
  const messages = [...new Set(flatten(errors))];
  throw new ApiException(
    HttpStatus.BAD_REQUEST,
    ApiErrorCode.VALIDATION_ERROR,
    messages.length > 0 ? messages.join('; ') : '请求参数不正确',
  );
}

function flatten(errors: ValidationError[]): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    if (error.constraints) {
      messages.push(...Object.values(error.constraints));
    }
    if (error.children && error.children.length > 0) {
      messages.push(...flatten(error.children));
    }
  }
  return messages;
}
