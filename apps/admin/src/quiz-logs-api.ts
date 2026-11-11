import type {
  AdminQuizGenerationLogDetail,
  AdminQuizGenerationLogList,
  AdminQuizGenerationLogStats,
} from '@tishuashua/shared';
import { adminFetch, downloadAdminCsv } from './api';

export type TriFilter = 'all' | 'true' | 'false';

export interface QuizLogFilters {
  userId: string;
  success: TriFilter;
  usedBuiltin: TriFilter;
  errorCode: string;
  page: number;
  pageSize: number;
}

export function listQuizGenerationLogs(
  token: string,
  query: QuizLogFilters,
): Promise<AdminQuizGenerationLogList> {
  const params = new URLSearchParams();
  params.set('success', query.success);
  params.set('usedBuiltin', query.usedBuiltin);
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.userId) {
    params.set('userId', query.userId);
  }
  if (query.errorCode) {
    params.set('errorCode', query.errorCode);
  }
  return adminFetch(`/admin/quiz-generation-logs?${params.toString()}`, { token });
}

export function getQuizGenerationLog(token: string, id: string): Promise<AdminQuizGenerationLogDetail> {
  return adminFetch(`/admin/quiz-generation-logs/${id}`, { token });
}

export function getQuizGenerationStats(token: string, days = 7): Promise<AdminQuizGenerationLogStats> {
  return adminFetch(`/admin/quiz-generation-logs/stats?days=${days}`, { token });
}

export function exportQuizGenerationLogs(
  token: string,
  query: { userId: string; success: TriFilter; usedBuiltin: TriFilter; errorCode: string; from: string; to: string },
): Promise<void> {
  const params = new URLSearchParams();
  params.set('from', query.from);
  params.set('to', query.to);
  params.set('success', query.success);
  params.set('usedBuiltin', query.usedBuiltin);
  if (query.userId) {
    params.set('userId', query.userId);
  }
  if (query.errorCode) {
    params.set('errorCode', query.errorCode);
  }
  return downloadAdminCsv(
    `/admin/quiz-generation-logs/export?${params.toString()}`,
    token,
    'quiz-generation-logs.csv',
  );
}
