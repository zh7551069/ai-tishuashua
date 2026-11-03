import type { AdminWrongBookDetail, AdminWrongBookList, WrongItemStatus } from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminWrongBookStatusFilter = WrongItemStatus | 'all';

export interface AdminWrongBookFilters {
  userId: string;
  certId: string;
  status: AdminWrongBookStatusFilter;
  page: number;
}

export function listAdminWrongBook(
  token: string,
  query: AdminWrongBookFilters,
): Promise<AdminWrongBookList> {
  const params = new URLSearchParams();
  params.set('status', query.status);
  params.set('page', String(query.page));
  if (query.userId) {
    params.set('userId', query.userId);
  }
  if (query.certId) {
    params.set('certId', query.certId);
  }
  return adminFetch(`/admin/wrong-book?${params.toString()}`, { token });
}

export function getAdminWrongBook(token: string, id: string): Promise<AdminWrongBookDetail> {
  return adminFetch(`/admin/wrong-book/${id}`, { token });
}
