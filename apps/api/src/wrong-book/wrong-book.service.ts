import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type WrongBookItem, type WrongBookList } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { WrongBookRepository } from './wrong-book.repository';

@Injectable()
export class WrongBookService {
  constructor(@Inject(WrongBookRepository) private readonly book: WrongBookRepository) {}

  async list(userId: string, status: string | undefined): Promise<WrongBookList> {
    const filter = normalizeStatus(status);
    if (!filter) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '状态只能是 pending、cleared 或 all',
      );
    }
    return { items: await this.book.list(userId, filter) };
  }

  async get(userId: string, itemId: string): Promise<WrongBookItem> {
    const item = await this.book.find(userId, itemId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '错题不存在');
    }
    return item;
  }

  async clear(userId: string, itemId: string): Promise<WrongBookItem> {
    const result = await this.book.clear(userId, itemId);
    if (result === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '错题不存在');
    }
    return this.get(userId, itemId);
  }
}

function normalizeStatus(status: string | undefined): 'pending' | 'cleared' | 'all' | null {
  if (status === undefined || status === '' || status === 'pending') {
    return 'pending';
  }
  if (status === 'cleared' || status === 'all') {
    return status;
  }
  return null;
}
