import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  JOB_GENERATE_QUIZ,
  parseRedisUrl,
  type GenerateQuizJobPayload,
} from '@tishuashua/shared';
import { Queue } from 'bullmq';
import { ApiException, logServerError } from '../common/api.exception';

@Injectable()
export class QuizQueueService {
  async enqueue(payload: GenerateQuizJobPayload): Promise<void> {
    const redisUrl = process.env.REDIS_URL?.trim() ?? '';
    if (!redisUrl) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '出题队列不可用',
      );
    }

    let connection: ReturnType<typeof parseRedisUrl>;
    try {
      connection = parseRedisUrl(redisUrl);
    } catch (error) {
      logServerError('quiz-queue', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '出题队列不可用',
      );
    }

    const queue = new Queue<GenerateQuizJobPayload>(JOB_GENERATE_QUIZ, {
      connection: {
        ...connection,
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      },
    });

    try {
      await withTimeout(
        queue.add(JOB_GENERATE_QUIZ, payload, {
          jobId: payload.sessionId,
          attempts: 1,
          removeOnComplete: 200,
          removeOnFail: 200,
        }),
        5000,
      );
    } catch (error) {
      logServerError('quiz-queue', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '出题队列不可用',
      );
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('出题队列超时')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
