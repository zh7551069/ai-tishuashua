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
import { loadWorkerEnv } from './config/env';
import { handleExtractCourseware } from './processors/extract-courseware';
import { handleGenerateQuiz } from './processors/generate-quiz';

@Injectable()
export class QueueConsumerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueConsumerService.name);
  private workers: Worker[] = [];

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const env = loadWorkerEnv(this.config);
    this.logger.log(
      `oss=${env.ossBucket ? 'configured' : 'missing'} llm=${env.llmConfigured ? 'configured' : 'missing'} provider=${env.llmProvider || 'unset'}`,
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

    const generateWorker = new Worker<GenerateQuizJobPayload>(
      JOB_GENERATE_QUIZ,
      handleGenerateQuiz,
      { connection },
    );
    const extractWorker = new Worker<ExtractCoursewareJobPayload>(
      JOB_EXTRACT_COURSEWARE,
      handleExtractCourseware,
      { connection },
    );

    for (const worker of [generateWorker, extractWorker]) {
      worker.on('error', (error: Error) => {
        this.logger.error(error.message);
      });
    }

    this.workers = [generateWorker, extractWorker];
    this.logger.log(`listening queues: ${JOB_GENERATE_QUIZ}, ${JOB_EXTRACT_COURSEWARE}`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
  }
}
