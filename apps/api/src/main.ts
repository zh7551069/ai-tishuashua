import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureHttp } from './app.setup';
import { describeConfiguredServices, loadApiEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const env = loadApiEnv(app.get(ConfigService));

  configureHttp(app);
  app.enableCors({ origin: env.adminOrigins });
  app.enableShutdownHooks();

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('题刷刷 API')
      .setDescription('微信登录、当前用户、目录和刷题包已实现。出题、上传提炼与错题本仍是占位。')
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });

  await app.listen(env.port, '0.0.0.0');
  console.log(`[api] http://127.0.0.1:${env.port}/api/health`);
  console.log(`[api] docs http://127.0.0.1:${env.port}/api/docs`);
  console.log(`[api] integrations ${describeConfiguredServices(env)}`);
  if (env.wechatLoginMock) {
    console.warn('[api] WECHAT_LOGIN_MOCK=true，不会请求微信 code2session');
  }
}

void bootstrap();
