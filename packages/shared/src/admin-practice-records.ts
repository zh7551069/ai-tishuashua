import type { QuizMode, QuizSessionSource, QuizSubmitReason } from './quiz';

/**
 * 一场已交卷练习记录。id 是 quiz_sessions.id。
 * 默认列表不含 source=wrongSet。分数只读 pass_snapshot，不改分，不带题目快照。
 */
export interface AdminPracticeRecordSummary {
  id: string;
  userId: string;
  userNick: string | null;
  mode: QuizMode;
  source: QuizSessionSource;
  score: number | null;
  totalScore: number | null;
  passed: boolean | null;
  /** 读不出 pass_snapshot 时为 false，score / totalScore 为空。 */
  scoreReadable: boolean;
  durationSeconds: number | null;
  packId: string | null;
  packName: string;
  certId: string | null;
  certName: string | null;
  domainName: string | null;
  startedAt: string | null;
  submittedAt: string | null;
}

export interface AdminPracticeRecordList {
  items: AdminPracticeRecordSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情是列表投影加上结果摘要。仍然不返回题目快照。 */
export interface AdminPracticeRecordDetail extends AdminPracticeRecordSummary {
  correctCount: number | null;
  wrongCount: number | null;
  partialCount: number | null;
  unansweredCount: number | null;
  accuracy: number | null;
  scoreRate: number | null;
  submitReason: QuizSubmitReason | null;
}
