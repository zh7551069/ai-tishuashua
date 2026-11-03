import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminCertificateLinkDetail,
  type AdminCertificateLinkList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminCertificateLinkQuery } from './admin-certificates.query';
import { AdminCertificateLinkRepository } from './admin-certificate-link.repository';

@Injectable()
export class AdminCertificateLinkService {
  constructor(
    @Inject(AdminCertificateLinkRepository)
    private readonly links: AdminCertificateLinkRepository,
  ) {}

  async list(query: AdminCertificateLinkQuery): Promise<AdminCertificateLinkList> {
    const result = await this.links.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string, certId: string): Promise<AdminCertificateLinkDetail> {
    const item = await this.links.find(userId, certId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '证书关联不存在');
    }
    return item;
  }
}
