import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminWrongBookDetail,
  type AdminWrongBookList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminWrongBookQuery } from './admin-wrong-book.query';
import { AdminWrongBookRepository } from './admin-wrong-book.repository';

@Injectable()
export class AdminWrongBookService {
  constructor(@Inject(AdminWrongBookRepository) private readonly book: AdminWrongBookRepository) {}

  async list(query: AdminWrongBookQuery): Promise<AdminWrongBookList> {
    const result = await this.book.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(itemId: string): Promise<AdminWrongBookDetail> {
    const item = await this.book.find(itemId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '错题不存在');
    }
    return item;
  }
}
