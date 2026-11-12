import type {
  CertQuestionTypeConfig,
  CertQuestionTypeConfigView,
  PromptPublishResult,
  PromptScope,
  PromptStatus,
  PromptTemplateDetail,
  PromptTemplateList,
  PromptTemplateStats,
  PromptVersionList,
  QuestionTypeView,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export function getPromptStats(token: string): Promise<PromptTemplateStats> {
  return adminFetch('/admin/prompt-templates/stats', { token });
}

export function listPromptTemplates(
  token: string,
  query: { scope?: PromptScope | ''; status?: PromptStatus | 'all' | ''; q?: string; page: number; pageSize: number },
): Promise<PromptTemplateList> {
  const params = new URLSearchParams();
  if (query.scope) {
    params.set('scope', query.scope);
  }
  if (query.status && query.status !== 'all') {
    params.set('status', query.status);
  }
  if (query.q) {
    params.set('q', query.q);
  }
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  return adminFetch(`/admin/prompt-templates?${params.toString()}`, { token });
}

export function getPromptTemplate(token: string, id: string): Promise<PromptTemplateDetail> {
  return adminFetch(`/admin/prompt-templates/${id}`, { token });
}

export function createPromptTemplate(token: string, body: unknown): Promise<PromptTemplateDetail> {
  return adminFetch('/admin/prompt-templates', { method: 'POST', token, body });
}

export function savePromptTemplate(
  token: string,
  id: string,
  body: unknown,
): Promise<PromptTemplateDetail> {
  return adminFetch(`/admin/prompt-templates/${id}`, { method: 'PUT', token, body });
}

export function publishPromptTemplate(token: string, id: string): Promise<PromptPublishResult> {
  return adminFetch(`/admin/prompt-templates/${id}/publish`, { method: 'POST', token });
}

export function rollbackPromptTemplate(
  token: string,
  id: string,
  version: number,
): Promise<PromptPublishResult> {
  return adminFetch(`/admin/prompt-templates/${id}/rollback`, {
    method: 'POST',
    token,
    body: { version },
  });
}

export function lockPromptTemplate(token: string, id: string, locked: boolean): Promise<PromptTemplateDetail> {
  return adminFetch(`/admin/prompt-templates/${id}/${locked ? 'lock' : 'unlock'}`, {
    method: 'POST',
    token,
  });
}

export function listPromptVersions(token: string, id: string): Promise<PromptVersionList> {
  return adminFetch(`/admin/prompt-templates/${id}/versions`, { token });
}

export function listQuestionTypes(token: string): Promise<{ items: QuestionTypeView[] }> {
  return adminFetch('/admin/question-types', { token });
}

export function createQuestionType(token: string, body: unknown): Promise<QuestionTypeView> {
  return adminFetch('/admin/question-types', { method: 'POST', token, body });
}

export function updateQuestionType(
  token: string,
  code: string,
  body: unknown,
): Promise<QuestionTypeView> {
  return adminFetch(`/admin/question-types/${encodeURIComponent(code)}`, {
    method: 'PUT',
    token,
    body,
  });
}

export function getCertTypeConfigs(
  token: string,
  certificateId: string,
): Promise<CertQuestionTypeConfigView> {
  return adminFetch(`/admin/certificates/${certificateId}/question-type-configs`, { token });
}

export function saveCertTypeConfigs(
  token: string,
  certificateId: string,
  items: CertQuestionTypeConfig[],
): Promise<CertQuestionTypeConfigView> {
  return adminFetch(`/admin/certificates/${certificateId}/question-type-configs`, {
    method: 'PUT',
    token,
    body: items,
  });
}
