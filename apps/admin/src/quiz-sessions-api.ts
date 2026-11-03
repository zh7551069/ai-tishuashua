import type {
  AdminQuizSessionDetail,
  AdminQuizSessionList,
  AdminQuizSessionStatus,
  QuizMode,
} from '@tishuashua/shared';
import { adminFetch } from './api';

export type AdminQuizSessionStatusFilter = AdminQuizSessionStatus | 'all';
export type AdminQuizSessionModeFilter = QuizMode | 'all';

export interface AdminQuizSessionFilters {
  userId: string;
  mode: AdminQuizSessionModeFilter;
  status: AdminQuizSessionStatusFilter;
  page: number;
}

export function listAdminQuizSessions(
  token: string,
  query: AdminQuizSessionFilters,
): Promise<AdminQuizSessionList> {
  const params = new URLSearchParams();
  params.set('status', query.status);
  params.set('mode', query.mode);
  params.set('page', String(query.page));
  if (query.userId) {
    params.set('userId', query.userId);
  }
  return adminFetch(`/admin/quiz-sessions?${params.toString()}`, { token });
}

export function getAdminQuizSession(token: string, id: string): Promise<AdminQuizSessionDetail> {
  return adminFetch(`/admin/quiz-sessions/${id}`, { token });
}
