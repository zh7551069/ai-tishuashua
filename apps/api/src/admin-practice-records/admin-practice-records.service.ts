import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  EXPORT_MAX_ROWS,
  EXPORT_TOO_MANY_ROWS_MESSAGE,
  type AdminPracticeRecordDetail,
  type AdminPracticeRecordList,
  type AdminPracticeRecordSummary,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { toCsv } from '../common/csv';
import type { PracticeRecordQuery } from './admin-practice-records.query';
import { AdminPracticeRecordRepository } from './admin-practice-records.repository';

const CSV_HEADER = [
  '会话 id',
  '用户 id',
  '脱敏昵称',
  '模式',
  '来源',
  '得分',
  '总分',
  '是否通过',
  '用时秒',
  '包名',
  '证书名',
  '交卷时间',
] as const;

@Injectable()
export class AdminPracticeRecordService {
  constructor(
    @Inject(AdminPracticeRecordRepository) private readonly records: AdminPracticeRecordRepository,
  ) {}

  async list(query: PracticeRecordQuery): Promise<AdminPracticeRecordList> {
    const result = await this.records.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(sessionId: string, includeWrongSet: boolean): Promise<AdminPracticeRecordDetail> {
    const item = await this.records.find(sessionId, includeWrongSet);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '练习记录不存在');
    }
    return item;
  }

  async exportCsv(query: PracticeRecordQuery): Promise<string> {
    const total = await this.records.count(query);
    if (total > EXPORT_MAX_ROWS) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        EXPORT_TOO_MANY_ROWS_MESSAGE,
      );
    }
    const rows = await this.records.exportRows(query);
    return practiceRecordsToCsv(rows);
  }
}

export function practiceRecordsToCsv(rows: readonly AdminPracticeRecordSummary[]): string {
  return toCsv(
    CSV_HEADER,
    rows.map((row) => [
      row.id,
      row.userId,
      row.userNick ?? '',
      row.mode,
      row.source,
      row.scoreReadable && row.score !== null ? String(row.score) : '',
      row.scoreReadable && row.totalScore !== null ? String(row.totalScore) : '',
      row.passed === null ? '' : row.passed ? '是' : '否',
      row.durationSeconds === null ? '' : String(row.durationSeconds),
      row.packName,
      row.certName ?? '',
      row.submittedAt ?? '',
    ]),
  );
}
