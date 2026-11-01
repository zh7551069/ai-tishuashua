import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ApiExceptionFilter } from './common/api-exception.filter';

/** 测试与 main 共用，避免管道和异常过滤器分叉。 */
export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
