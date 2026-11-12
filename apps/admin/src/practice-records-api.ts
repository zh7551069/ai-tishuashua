import type {
  AdminPracticeRecordDetail,
  AdminPracticeRecordList,
  QuizMode,
} from '@tishuashua/shared';
import { adminFetch, downloadAdminCsv } from './api';

export interface PracticeRecordFilters {
  userId: string;
  mode: QuizMode | 'all';
  includeWrongSet: boolean;
  page: number;
  pageSize: number;
}

export function listPracticeRecords(
  token: string,
  query: PracticeRecordFilters,
): Promise<AdminPracticeRecordList> {
  const params = new URLSearchParams();
  params.set('mode', query.mode);
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  params.set('includeWrongSet', query.includeWrongSet ? 'true' : 'false');
  if (query.userId) {
    params.set('userId', query.userId);
  }
  return adminFetch(`/admin/practice-records?${params.toString()}`, { token });
}

export function getPracticeRecord(
  token: string,
  id: string,
  includeWrongSet: boolean,
): Promise<AdminPracticeRecordDetail> {
  const params = new URLSearchParams();
  if (includeWrongSet) {
    params.set('includeWrongSet', 'true');
  }
  const suffix = params.toString() ? `?${params.toString()}` : '';
  return adminFetch(`/admin/practice-records/${id}${suffix}`, { token });
}

export function exportPracticeRecords(
  token: string,
  query: { userId: string; mode: QuizMode | 'all'; includeWrongSet: boolean; from: string; to: string },
): Promise<void> {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  params.set('mode', query.mode);
  params.set('includeWrongSet', query.includeWrongSet ? 'true' : 'false');
  if (query.userId) {
    params.set('userId', query.userId);
  }
  return downloadAdminCsv(`/admin/practice-records/export?${params.toString()}`, token, 'practice-records.csv');
}
