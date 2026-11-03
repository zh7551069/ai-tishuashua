import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type AdminUserList, type AdminUserSummary } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminUserQuery } from './admin-users.query';
import { AdminUserRepository } from './admin-users.repository';

@Injectable()
export class AdminUserService {
  constructor(@Inject(AdminUserRepository) private readonly users: AdminUserRepository) {}

  async list(query: AdminUserQuery): Promise<AdminUserList> {
    const result = await this.users.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(userId: string): Promise<AdminUserSummary> {
    const user = await this.users.find(userId);
    if (!user) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '用户不存在');
    }
    return user;
  }
}
