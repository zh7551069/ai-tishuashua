import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminCoursewareDetail,
  type AdminCoursewareList,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import type { AdminCoursewareQuery } from './admin-courseware.query';
import { AdminCoursewareRepository } from './admin-courseware.repository';

@Injectable()
export class AdminCoursewareService {
  constructor(
    @Inject(AdminCoursewareRepository) private readonly courseware: AdminCoursewareRepository,
  ) {}

  async list(query: AdminCoursewareQuery): Promise<AdminCoursewareList> {
    const result = await this.courseware.list(query);
    return {
      items: result.items,
      total: result.total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async get(uploadId: string): Promise<AdminCoursewareDetail> {
    const item = await this.courseware.find(uploadId);
    if (!item) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '上传不存在');
    }
    return item;
  }
}
