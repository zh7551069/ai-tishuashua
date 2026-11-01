import type { CertificateList, DomainList, KnowledgeTree } from '@tishuashua/shared';
import { apiRequest } from './http';

export function fetchDomains(token: string): Promise<DomainList> {
  return apiRequest<DomainList>('/catalog/domains', { method: 'GET', token });
}

export function fetchCertificates(token: string, domainId: string): Promise<CertificateList> {
  return apiRequest<CertificateList>(`/catalog/domains/${domainId}/certificates`, {
    method: 'GET',
    token,
  });
}

export function fetchKnowledgeTree(token: string, certificateId: string): Promise<KnowledgeTree> {
  return apiRequest<KnowledgeTree>(`/catalog/certificates/${certificateId}/knowledge-tree`, {
    method: 'GET',
    token,
  });
}
