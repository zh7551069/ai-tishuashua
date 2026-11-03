import type { QuizMode, QuizSettings } from './quiz';

/**
 * 后管出题会话只含未交卷。
 * submitted 属于证书与成绩，不在这一页。
 */
export const ADMIN_QUIZ_SESSION_STATUSES = [
  'pending',
  'generating',
  'ready',
  'in_progress',
  'cancelled',
  'failed',
] as const;
export type AdminQuizSessionStatus = (typeof ADMIN_QUIZ_SESSION_STATUSES)[number];

export const ADMIN_QUIZ_SESSION_STATUS_LABELS: Record<AdminQuizSessionStatus, string> = {
  pending: '等待出题',
  generating: '正在出题',
  ready: '待作答',
  in_progress: '作答中',
  cancelled: '已取消',
  failed: '出题失败',
};

export const ADMIN_QUIZ_SESSION_SOURCES = ['normal', 'wrongSet'] as const;
export type AdminQuizSessionSource = (typeof ADMIN_QUIZ_SESSION_SOURCES)[number];

export const ADMIN_QUIZ_SESSION_SOURCE_LABELS: Record<AdminQuizSessionSource, string> = {
  normal: '普通出题',
  wrongSet: '错题再练',
};

/** 刷题包快照里没有名称时的回落。这一行仍保留。 */
export const ADMIN_QUIZ_SESSION_UNREADABLE_PACK = '刷题包信息无法读取';

export interface AdminQuizSessionProgress {
  generated: number;
  total: number;
}

export interface AdminQuizSessionError {
  code: string;
  message: string;
}

/**
 * 一场未交卷的摘要。id 是 quiz_sessions.id。
 * 不带题目、答案、分数、run_token。昵称已脱敏。
 */
export interface AdminQuizSessionSummary {
  id: string;
  userId: string;
  userNick: string | null;
  packId: string | null;
  packName: string;
  domainName: string | null;
  certName: string | null;
  mode: QuizMode;
  status: AdminQuizSessionStatus;
  source: AdminQuizSessionSource;
  progress: AdminQuizSessionProgress;
  error: AdminQuizSessionError | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
}

export interface AdminQuizSessionList {
  items: AdminQuizSessionSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 详情补上能读出的出题设置和考试截止时间。
 * 设置读不出来时 settings 为 null，不回传原始 JSON。
 */
export interface AdminQuizSessionDetail extends AdminQuizSessionSummary {
  settingsReadable: boolean;
  settings: QuizSettings | null;
  deadlineAt: string | null;
}
