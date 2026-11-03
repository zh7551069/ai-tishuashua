import type { CertificateQueryList } from '@tishuashua/shared';
import { apiRequest } from './http';

export function fetchCertificateQuery(token: string): Promise<CertificateQueryList> {
  return apiRequest<CertificateQueryList>('/certificates', { method: 'GET', token });
}
