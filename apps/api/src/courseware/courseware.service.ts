import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  coursewareContentType,
  estimateExtractMinutes,
  readProcessLlmEnv,
  resolveLlmMode,
  validateCoursewareFile,
  type CommitExtractResult,
  type ExtractJobView,
} from '@tishuashua/shared';
import { createObjectStorage, readStorageEnv } from '@tishuashua/shared/courseware';
import { randomUUID } from 'node:crypto';
import { ApiException, logServerError } from '../common/api.exception';
import { CoursewareQueueService } from './courseware-queue.service';
import { CoursewareRepository } from './courseware.repository';
import type { MultipartUpload } from './multipart';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class CoursewareService {
  constructor(
    @Inject(CoursewareRepository) private readonly courseware: CoursewareRepository,
    @Inject(CoursewareQueueService) private readonly queue: CoursewareQueueService,
  ) {}

  async createUpload(userId: string, file: MultipartUpload): Promise<ExtractJobView> {
    const decision = resolveLlmMode(readProcessLlmEnv());
    if (decision.mode === 'missing') {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.LLM_NOT_CONFIGURED,
        decision.message,
      );
    }
    const checked = validateCoursewareFile({
      fileName: file.fileName,
      byteSize: file.bytes.length,
    });
    if (!checked.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, checked.code, checked.message);
    }
    if (!UUID_RE.test(file.certificateId)) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '证书不正确');
    }
    const certificateId = file.certificateId.toLowerCase();
    const certificate = await this.courseware.findOnlineCertificate(certificateId);
    if (!certificate) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '证书不存在或已下架');
    }

    const uploadId = randomUUID();
    const jobId = randomUUID();
    const objectKey = `courseware/${userId}/${uploadId}/${checked.safeName}`;
    const storage = createObjectStorage(readStorageEnv());
    try {
      await storage.put(
        objectKey,
        file.bytes,
        file.mimeType || coursewareContentType(checked.extension),
      );
    } catch (error) {
      logServerError('courseware-storage', error);
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.INTERNAL,
        '课件没有保存，请重试',
      );
    }

    try {
      await this.courseware.insertPending({
        uploadId,
        jobId,
        userId,
        certificateId,
        estimatedMinutes: estimateExtractMinutes(file.bytes.length),
        fileMeta: {
          fileName: checked.safeName,
          extension: checked.extension,
          mimeType: file.mimeType || coursewareContentType(checked.extension),
          byteSize: file.bytes.length,
          objectKey,
        },
      });
    } catch (error) {
      await storage.delete(objectKey).catch(() => undefined);
      throw error;
    }

    try {
      await this.queue.enqueue({
        uploadId,
        jobId,
        userId,
        objectKey,
        fileName: checked.safeName,
      });
    } catch (error) {
      await this.courseware.deleteUpload(uploadId).catch(() => undefined);
      await storage.delete(objectKey).catch(() => undefined);
      throw error;
    }
    return this.requireJob(userId, jobId);
  }

  async get(userId: string, jobId: string): Promise<ExtractJobView> {
    return this.requireJob(userId, jobId);
  }

  async cancel(userId: string, jobId: string): Promise<ExtractJobView> {
    const result = await this.courseware.cancel(userId, jobId);
    if (result === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '提炼任务不存在');
    }
    if (result === 'conflict') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ApiErrorCode.VALIDATION_ERROR,
        '当前状态不能取消',
      );
    }
    return this.requireJob(userId, jobId);
  }

  async commit(
    userId: string,
    jobId: string,
    draftIds: readonly string[],
    packId?: string,
  ): Promise<CommitExtractResult> {
    return this.courseware.commit({
      userId,
      jobId,
      draftIds,
      packId: packId ?? null,
    });
  }

  private async requireJob(userId: string, jobId: string): Promise<ExtractJobView> {
    const job = await this.courseware.findJob(userId, jobId);
    if (!job) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '提炼任务不存在');
    }
    return job;
  }
}
