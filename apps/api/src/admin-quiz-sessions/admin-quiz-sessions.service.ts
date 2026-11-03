import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminQuizSessionDetail,
  type AdminQuizSessionList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminQuizSessionQuery } from './admin-quiz-sessions.query';
import { AdminQuizSessionRepository } from './admin-quiz-sessions.repository';

@Injectable()
export class AdminQuizSessionService {
  constructor(
    @Inject(AdminQuizSessionRepository) private readonly sessions: AdminQuizSessionRepository,
  ) {}

  async list(query: AdminQuizSessionQuery): Promise<AdminQuizSessionList> {
    const result = await this.sessions.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(sessionId: string): Promise<AdminQuizSessionDetail> {
    const found = await this.sessions.find(sessionId);
    if (found === 'submitted') {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        ApiErrorCode.NOT_FOUND,
        '这场已经交卷，请到证书与成绩查看',
      );
    }
    if (!found) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    return found;
  }
}
