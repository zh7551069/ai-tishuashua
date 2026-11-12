import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  EXPORT_MAX_ROWS,
  EXPORT_TOO_MANY_ROWS_MESSAGE,
  quizGenerationFailureRate,
  type AdminQuizGenerationLogDetail,
  type AdminQuizGenerationLogList,
  type AdminQuizGenerationLogStats,
  type AdminQuizGenerationLogSummary,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { toCsv } from '../common/csv';
import type { QuizLogQuery } from './admin-quiz-generation-logs.query';
import { AdminQuizGenerationLogRepository } from './admin-quiz-generation-logs.repository';

const CSV_HEADER = [
  '会话 id',
  '用户 id',
  '脱敏昵称',
  '证书名',
  'templateCode',
  'templateVersion',
  'usedBuiltin',
  'success',
  'errorCode',
  'durationMs',
  'createdAt',
] as const;

@Injectable()
export class AdminQuizGenerationLogService {
  constructor(
    @Inject(AdminQuizGenerationLogRepository)
    private readonly logs: AdminQuizGenerationLogRepository,
  ) {}

  async list(query: QuizLogQuery): Promise<AdminQuizGenerationLogList> {
    const result = await this.logs.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AdminQuizGenerationLogDetail> {
    const item = await this.logs.find(id);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题日志不存在');
    }
    return item;
  }

  async exportCsv(query: QuizLogQuery): Promise<string> {
    const total = await this.logs.count(query);
    if (total > EXPORT_MAX_ROWS) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        EXPORT_TOO_MANY_ROWS_MESSAGE,
      );
    }
    const rows = await this.logs.exportRows(query);
    return quizGenerationLogsToCsv(rows);
  }

  async stats(days: number, sinceIso: string): Promise<AdminQuizGenerationLogStats> {
    const counts = await this.logs.stats(new Date(sinceIso));
    return {
      days,
      since: sinceIso,
      attemptCount: counts.attemptCount,
      failureCount: counts.failureCount,
      failureRate: quizGenerationFailureRate(counts.attemptCount, counts.failureCount),
      builtinFallbackCount: counts.builtinFallbackCount,
    };
  }
}

export function quizGenerationLogsToCsv(rows: readonly AdminQuizGenerationLogSummary[]): string {
  return toCsv(
    CSV_HEADER,
    rows.map((row) => [
      row.sessionId ?? '',
      row.userId ?? '',
      row.userNick ?? '',
      row.certName ?? '',
      row.templateCode ?? '',
      row.templateVersion === null ? '' : String(row.templateVersion),
      row.usedBuiltin ? 'true' : 'false',
      row.success ? 'true' : 'false',
      row.errorCode ?? '',
      row.durationMs === null ? '' : String(row.durationMs),
      row.createdAt,
    ]),
  );
}
