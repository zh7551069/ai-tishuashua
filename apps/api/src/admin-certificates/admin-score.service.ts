import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type AdminScoreDetail, type AdminScoreList } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminScoreQuery } from './admin-certificates.query';
import { AdminScoreRepository } from './admin-score.repository';

@Injectable()
export class AdminScoreService {
  constructor(@Inject(AdminScoreRepository) private readonly scores: AdminScoreRepository) {}

  async list(query: AdminScoreQuery): Promise<AdminScoreList> {
    const result = await this.scores.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(sessionId: string): Promise<AdminScoreDetail> {
    const item = await this.scores.find(sessionId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '成绩不存在');
    }
    return item;
  }
}
