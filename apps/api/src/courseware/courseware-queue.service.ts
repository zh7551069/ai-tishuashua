import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  JOB_EXTRACT_COURSEWARE,
  parseRedisUrl,
  type ExtractCoursewareJobPayload,
} from '@tishuashua/shared';
import { Queue } from 'bullmq';
import { ApiException, logServerError } from '../common/api.exception';

@Injectable()
export class CoursewareQueueService {
  async enqueue(payload: ExtractCoursewareJobPayload): Promise<void> {
    const redisUrl = process.env.REDIS_URL?.trim() ?? '';
    if (!redisUrl) {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '提炼队列不可用',
      );
    }

    let connection: ReturnType<typeof parseRedisUrl>;
    try {
      connection = parseRedisUrl(redisUrl);
    } catch (error) {
      logServerError('courseware-queue', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '提炼队列不可用',
      );
    }

    const queue = new Queue<ExtractCoursewareJobPayload>(JOB_EXTRACT_COURSEWARE, {
      connection: {
        ...connection,
        maxRetriesPerRequest: null,
        connectTimeout: 3000,
        enableOfflineQueue: false,
      },
    });

    try {
      await withTimeout(
        queue.add(JOB_EXTRACT_COURSEWARE, payload, {
          jobId: payload.jobId,
          attempts: 1,
          removeOnComplete: 200,
          removeOnFail: 200,
        }),
        5000,
      );
    } catch (error) {
      logServerError('courseware-queue', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.REDIS_UNAVAILABLE,
        '提炼队列不可用',
      );
    } finally {
      await queue.close().catch(() => undefined);
    }
  }
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('提炼队列超时')), ms);
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
