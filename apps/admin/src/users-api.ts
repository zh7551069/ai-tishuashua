import type { AdminUserDetail, AdminUserList, AdminUserStatus } from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminUserStatusFilter = AdminUserStatus | 'all';

export interface AdminUserFilters {
  status: AdminUserStatusFilter;
  page: number;
}

export function listAdminUsers(token: string, query: AdminUserFilters): Promise<AdminUserList> {
  const params = new URLSearchParams();
  params.set('status', query.status);
  params.set('page', String(query.page));
  return adminFetch(`/admin/users?${params.toString()}`, { token });
}

export function getAdminUser(token: string, id: string): Promise<AdminUserDetail> {
  return adminFetch(`/admin/users/${id}`, { token });
}
