import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { describeConfiguredServices, loadApiEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = loadApiEnv(app.get(ConfigService));

  app.setGlobalPrefix('api');
  app.enableCors({ origin: env.adminOrigins });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('题刷刷 API')
      .setDescription('脚手架。除健康检查外，路由均为占位，业务尚未实现。')
      .setVersion('0.0.0')
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });

  await app.listen(env.port, '0.0.0.0');
  console.log(`[api] http://127.0.0.1:${env.port}/api/health`);
  console.log(`[api] docs http://127.0.0.1:${env.port}/api/docs`);
  console.log(`[api] integrations ${describeConfiguredServices(env)}`);
}

void bootstrap();
