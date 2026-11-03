import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JOB_EXTRACT_COURSEWARE,
  JOB_GENERATE_QUIZ,
  parseRedisUrl,
  type ExtractCoursewareJobPayload,
  type GenerateQuizJobPayload,
} from '@tishuashua/shared';
import { Worker, type ConnectionOptions } from 'bullmq';
import { Pool } from 'pg';
import { loadWorkerEnv } from './config/env';
import { handleExtractCourseware } from './processors/extract-courseware';
import { handleGenerateQuiz } from './processors/generate-quiz';

@Injectable()
export class QueueConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumerService.name);
  private workers: Worker[] = [];
  private pool: Pool | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const env = loadWorkerEnv(this.config);
    const llm = env.llmMock ? 'mock' : env.llmConfigured ? 'configured' : 'missing';
    this.logger.log(
      `oss=${env.ossMode} llm=${llm} provider=${env.llmProvider || 'unset'} db=${env.databaseUrl ? 'configured' : 'missing'}`,
    );

    if (!env.redisUrl) {
      this.logger.error('REDIS_URL 未配置，队列消费者未启动');
      return;
    }

    let connection: ConnectionOptions;
    try {
      const endpoint = parseRedisUrl(env.redisUrl);
      connection = {
        ...endpoint,
        maxRetriesPerRequest: null,
        ...(env.redisUrl.startsWith('rediss:') ? { tls: {} } : {}),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'REDIS_URL 无法解析';
      this.logger.error(message);
      return;
    }

    if (!env.databaseUrl) {
      this.logger.error('DATABASE_URL 未配置，队列消费者未启动');
      return;
    }

    this.pool = new Pool({
      connectionString: env.databaseUrl,
      max: 5,
      connectionTimeoutMillis: 3000,
    });
    this.pool.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
    const pool = this.pool;
    const generateWorker = new Worker<GenerateQuizJobPayload>(
      JOB_GENERATE_QUIZ,
      (job) => handleGenerateQuiz(job, pool),
      { connection, concurrency: 2, lockDuration: 10 * 60 * 1000 },
    );
    generateWorker.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
    this.workers.push(generateWorker);

    const extractWorker = new Worker<ExtractCoursewareJobPayload>(
      JOB_EXTRACT_COURSEWARE,
      (job) => handleExtractCourseware(job, pool),
      { connection, concurrency: 1, lockDuration: 10 * 60 * 1000 },
    );
    extractWorker.on('error', (error: Error) => {
      this.logger.error(error.message);
    });
    this.workers.push(extractWorker);
    this.logger.log(`listening queues: ${JOB_GENERATE_QUIZ}, ${JOB_EXTRACT_COURSEWARE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    await this.pool?.end().catch(() => undefined);
    this.pool = null;
  }
}
