import type { AdminUserDetail, AdminUserList, AdminUserStatus } from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminUserStatusFilter = AdminUserStatus | 'all';

export interface AdminUserFilters {
  status: AdminUserStatusFilter;
  page: number;
  pageSize?: number;
}

export function listAdminUsers(token: string, query: AdminUserFilters): Promise<AdminUserList> {
  const params = new URLSearchParams();
  params.set('status', query.status);
  params.set('page', String(query.page));
  if (query.pageSize) {
    params.set('pageSize', String(query.pageSize));
  }
  return adminFetch(`/admin/users?${params.toString()}`, { token });
}

export function getAdminUser(token: string, id: string): Promise<AdminUserDetail> {
  return adminFetch(`/admin/users/${id}`, { token });
}
