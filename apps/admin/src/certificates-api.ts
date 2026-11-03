import type {
  AdminCertificateScoreDetail,
  AdminCertificateScoreList,
  QuizMode,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminCertificateModeFilter = QuizMode | 'all';

export interface AdminCertificateFilters {
  userId: string;
  certId: string;
  mode: AdminCertificateModeFilter;
  page: number;
}

export function listAdminCertificates(
  token: string,
  query: AdminCertificateFilters,
): Promise<AdminCertificateScoreList> {
  const params = new URLSearchParams();
  params.set('mode', query.mode);
  params.set('page', String(query.page));
  if (query.userId) {
    params.set('userId', query.userId);
  }
  if (query.certId) {
    params.set('certId', query.certId);
  }
  return adminFetch(`/admin/certificates?${params.toString()}`, { token });
}

export function getAdminCertificate(
  token: string,
  id: string,
): Promise<AdminCertificateScoreDetail> {
  return adminFetch(`/admin/certificates/${id}`, { token });
}
