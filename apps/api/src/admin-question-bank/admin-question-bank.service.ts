import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminQuestionBankDetail,
  type AdminQuestionBankList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminQuestionBankQuery } from './admin-question-bank.query';
import { AdminQuestionBankRepository } from './admin-question-bank.repository';

@Injectable()
export class AdminQuestionBankService {
  constructor(
    @Inject(AdminQuestionBankRepository) private readonly bank: AdminQuestionBankRepository,
  ) {}

  async list(query: AdminQuestionBankQuery): Promise<AdminQuestionBankList> {
    const result = await this.bank.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(id: string): Promise<AdminQuestionBankDetail> {
    const item = await this.bank.find(id);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '题目不存在');
    }
    return item;
  }
}
