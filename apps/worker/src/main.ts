import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { loadWorkerEnv } from './config/env';
import { WorkerModule } from './worker.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule);
  const env = loadWorkerEnv(app.get(ConfigService));
  app.enableShutdownHooks();
  await app.listen(env.port, '0.0.0.0');
  console.log(`[worker] http://127.0.0.1:${env.port}/health`);
}

void bootstrap();
