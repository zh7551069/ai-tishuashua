import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminCertificateScoreDetail,
  type AdminCertificateScoreList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminCertificateQuery } from './admin-certificates.query';
import { AdminCertificateRepository } from './admin-certificates.repository';

@Injectable()
export class AdminCertificateService {
  constructor(
    @Inject(AdminCertificateRepository) private readonly certificates: AdminCertificateRepository,
  ) {}

  async list(query: AdminCertificateQuery): Promise<AdminCertificateScoreList> {
    const result = await this.certificates.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(sessionId: string): Promise<AdminCertificateScoreDetail> {
    const item = await this.certificates.find(sessionId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '成绩不存在');
    }
    return item;
  }
}
