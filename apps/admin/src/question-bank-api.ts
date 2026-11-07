import type {
  AdminQuestionBankDetail,
  AdminQuestionBankList,
  AdminQuestionBankRange,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export interface AdminQuestionBankFilters {
  domainId: string;
  certificateId: string;
  knowledgePointId: string;
  range: AdminQuestionBankRange;
  page: number;
}

export function listAdminQuestionBank(
  token: string,
  query: AdminQuestionBankFilters,
): Promise<AdminQuestionBankList> {
  const params = new URLSearchParams();
  params.set('range', query.range);
  params.set('page', String(query.page));
  if (query.domainId) {
    params.set('domainId', query.domainId);
  }
  if (query.certificateId) {
    params.set('certificateId', query.certificateId);
  }
  if (query.knowledgePointId) {
    params.set('knowledgePointId', query.knowledgePointId);
  }
  return adminFetch(`/admin/question-bank?${params.toString()}`, { token });
}

export function getAdminQuestionBank(token: string, id: string): Promise<AdminQuestionBankDetail> {
  return adminFetch(`/admin/question-bank/${id}`, { token });
}
