import type {
  AdminCoursewareDetail,
  AdminCoursewareList,
  ExtractJobStatus,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminCoursewareStatusFilter = ExtractJobStatus | 'all';

export interface AdminCoursewareFilters {
  userId: string;
  certId: string;
  status: AdminCoursewareStatusFilter;
  page: number;
  pageSize?: number;
}

export function listAdminCourseware(
  token: string,
  query: AdminCoursewareFilters,
): Promise<AdminCoursewareList> {
  const params = new URLSearchParams();
  params.set('status', query.status);
  params.set('page', String(query.page));
  if (query.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  if (query.userId) {
    params.set('userId', query.userId);
  }
  if (query.certId) {
    params.set('certId', query.certId);
  }
  return adminFetch(`/admin/courseware?${params.toString()}`, { token });
}

export function getAdminCourseware(token: string, id: string): Promise<AdminCoursewareDetail> {
  return adminFetch(`/admin/courseware/${id}`, { token });
}
