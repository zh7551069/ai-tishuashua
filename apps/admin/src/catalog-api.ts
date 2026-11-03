import type {
  AdminCatalogDeleteResult,
  AdminCatalogTree,
  AdminCertificate,
  AdminCertificateList,
  AdminCertificatePatch,
  AdminCertificateWrite,
  AdminDomain,
  AdminDomainList,
  AdminDomainPatch,
  AdminDomainWrite,
  AdminKnowledgeNode,
  AdminKnowledgePatch,
  AdminKnowledgeWrite,
  AdminTextbookPatch,
  AdminTextbookSummary,
  AdminTextbookWrite,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export function listDomains(token: string): Promise<AdminDomainList> {
  return adminFetch('/admin/catalog/domains', { token });
}

export function createDomain(token: string, body: AdminDomainWrite): Promise<AdminDomain> {
  return adminFetch('/admin/catalog/domains', { method: 'POST', token, body });
}

export function updateDomain(
  token: string,
  id: string,
  body: AdminDomainPatch,
): Promise<AdminDomain> {
  return adminFetch(`/admin/catalog/domains/${id}`, { method: 'PUT', token, body });
}

export function deleteDomain(token: string, id: string): Promise<AdminCatalogDeleteResult> {
  return adminFetch(`/admin/catalog/domains/${id}`, { method: 'DELETE', token });
}

export function listCertificates(token: string, domainId: string): Promise<AdminCertificateList> {
  return adminFetch(`/admin/catalog/domains/${domainId}/certificates`, { token });
}

export function createCertificate(
  token: string,
  domainId: string,
  body: AdminCertificateWrite,
): Promise<AdminCertificate> {
  return adminFetch(`/admin/catalog/domains/${domainId}/certificates`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateCertificate(
  token: string,
  id: string,
  body: AdminCertificatePatch,
): Promise<AdminCertificate> {
  return adminFetch(`/admin/catalog/certificates/${id}`, { method: 'PUT', token, body });
}

export function deleteCertificate(token: string, id: string): Promise<AdminCatalogDeleteResult> {
  return adminFetch(`/admin/catalog/certificates/${id}`, { method: 'DELETE', token });
}

export function getCatalogTree(token: string, certificateId: string): Promise<AdminCatalogTree> {
  return adminFetch(`/admin/catalog/certificates/${certificateId}/tree`, { token });
}

export function createTextbook(
  token: string,
  certificateId: string,
  body: AdminTextbookWrite,
): Promise<AdminTextbookSummary> {
  return adminFetch(`/admin/catalog/certificates/${certificateId}/textbooks`, {
    method: 'POST',
    token,
    body,
  });
}

export function linkTextbook(
  token: string,
  certificateId: string,
  textbookId: string,
): Promise<AdminTextbookSummary> {
  return adminFetch(`/admin/catalog/certificates/${certificateId}/textbooks/link`, {
    method: 'POST',
    token,
    body: { textbookId },
  });
}

export function unlinkTextbook(
  token: string,
  certificateId: string,
  textbookId: string,
): Promise<AdminCatalogDeleteResult> {
  return adminFetch(`/admin/catalog/certificates/${certificateId}/textbooks/${textbookId}`, {
    method: 'DELETE',
    token,
  });
}

export function updateTextbook(
  token: string,
  id: string,
  body: AdminTextbookPatch,
): Promise<AdminTextbookSummary> {
  return adminFetch(`/admin/catalog/textbooks/${id}`, { method: 'PUT', token, body });
}

export function deleteTextbook(token: string, id: string): Promise<AdminCatalogDeleteResult> {
  return adminFetch(`/admin/catalog/textbooks/${id}`, { method: 'DELETE', token });
}

export function createTextbookNode(
  token: string,
  textbookId: string,
  body: AdminKnowledgeWrite,
): Promise<AdminKnowledgeNode> {
  return adminFetch(`/admin/catalog/textbooks/${textbookId}/nodes`, {
    method: 'POST',
    token,
    body,
  });
}

export function createIndependentPoint(
  token: string,
  certificateId: string,
  body: AdminKnowledgeWrite,
): Promise<AdminKnowledgeNode> {
  return adminFetch(`/admin/catalog/certificates/${certificateId}/knowledge-points`, {
    method: 'POST',
    token,
    body,
  });
}

export function updateKnowledge(
  token: string,
  id: string,
  body: AdminKnowledgePatch,
): Promise<AdminKnowledgeNode> {
  return adminFetch(`/admin/catalog/knowledge-points/${id}`, { method: 'PUT', token, body });
}

export function deleteKnowledge(token: string, id: string): Promise<AdminCatalogDeleteResult> {
  return adminFetch(`/admin/catalog/knowledge-points/${id}`, { method: 'DELETE', token });
}
