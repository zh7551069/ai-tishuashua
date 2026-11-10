import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiExceptionFilter } from './common/api-exception.filter';

/** 测试与 main 共用，避免管道和异常过滤器分叉。 */
export function configureHttp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // Express 默认弱 ETag。微信开发者工具对 304 经常不回调 wx.request，首页 Promise.all 会一直停在加载。
  const server = app.getHttpAdapter().getInstance() as {
    set(setting: string, value: unknown): void;
  };
  server.set('etag', false);
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
}
