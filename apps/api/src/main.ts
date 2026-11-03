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
  if (env.trustProxy) {
    const server = app.getHttpAdapter().getInstance() as { set(name: string, value: number): void };
    server.set('trust proxy', 1);
    console.log('[api] trust proxy enabled');
  }
  app.enableCors({ origin: env.adminOrigins });
  app.enableShutdownHooks();

  let docsReady = false;
  try {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('题刷刷 API')
        .setDescription(
          '微信登录、设置页手机号授权、目录、刷题包、AI 出题、交卷判分、错题本、证书查询、课件提炼、管理后台登录、目录维护、后管错题只读、后管课件上传只读、后管证书与成绩只读和 Redis 限流已实现。手机号授权不是短信登录。GET /api/certificates/scores 仍是占位。',
        )
        .setVersion('0.1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('docs', app, document, { useGlobalPrefix: true });
    docsReady = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    console.warn(`[api] OpenAPI 文档未生成：${message}`);
  }

  await app.listen(env.port, '0.0.0.0');
  console.log(`[api] http://127.0.0.1:${env.port}/api/health`);
  if (docsReady) {
    console.log(`[api] docs http://127.0.0.1:${env.port}/api/docs`);
  }
  console.log(`[api] integrations ${describeConfiguredServices(env)}`);
  if (env.wechatLoginMock) {
    console.warn('[api] WECHAT_LOGIN_MOCK=true，不会请求微信 code2session 或手机号接口');
  }
  if (env.llmMock) {
    console.warn('[api] LLM_MOCK=true，出题和课件提炼不会请求 DeepSeek 或通义');
  }
  if (!env.adminUsername || !env.adminPassword) {
    console.warn('[api] ADMIN_USERNAME / ADMIN_PASSWORD 未配置，管理后台不能登录');
  }
}

void bootstrap();
