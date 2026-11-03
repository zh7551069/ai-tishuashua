import type { QuestionSource, QuizMode, QuizOption, QuizSubmitReason, QuizTypeCode } from './quiz';

/** 刷题包快照里没有名称时的回落。这一行仍保留。 */
export const ADMIN_CERTIFICATE_UNREADABLE_PACK = '刷题包信息无法读取';

/** pass_snapshot 读不出分数时的回落。不拿 quiz_sessions.score 顶上，也不重新判分。 */
export const ADMIN_CERTIFICATE_UNREADABLE_SCORE = '成绩无法读取';

export const ADMIN_CERTIFICATE_SOURCES = ['normal', 'wrongSet'] as const;
export type AdminCertificateSource = (typeof ADMIN_CERTIFICATE_SOURCES)[number];

export const ADMIN_CERTIFICATE_SOURCE_LABELS: Record<AdminCertificateSource, string> = {
  normal: '普通出题',
  wrongSet: '错题再练',
};

/**
 * 一场已交卷的摘要。id 是 quiz_sessions.id。
 * 分数只读当时写入的 pass_snapshot。读不出来时 scoreReadable 为 false，数字字段为空。
 * 不带题目、微信 openId 和 run_token。
 */
export interface AdminCertificateScoreSummary {
  id: string;
  userId: string;
  userNick: string | null;
  certId: string | null;
  certName: string | null;
  domainId: string | null;
  domainName: string | null;
  /** 快照里的证书名。证书行已经不在时，列表仍能看到当时的名字。 */
  snapshotCertName: string | null;
  packId: string | null;
  packName: string;
  mode: QuizMode;
  source: AdminCertificateSource;
  scoreReadable: boolean;
  earnedScore: number | null;
  totalScore: number | null;
  accuracy: number | null;
  scoreRate: number | null;
  correctCount: number | null;
  questionCount: number | null;
  passed: boolean | null;
  passScore: number | null;
  reason: QuizSubmitReason | null;
  submittedAt: string | null;
}

export interface AdminCertificateScoreList {
  items: AdminCertificateScoreSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情里的一题。只展示库里记下的选择和答案，不重新判分。 */
export interface AdminCertificateScoreQuestion {
  id: string;
  ordinal: number;
  type: QuizTypeCode | null;
  stem: string;
  options: QuizOption[];
  selected: string[];
  answer: string[];
  analysis: string;
  score: number;
  kpIds: string[];
  source: QuestionSource | null;
}

export interface AdminCertificateScoreDetail extends AdminCertificateScoreSummary {
  startedAt: string | null;
  wrongCount: number | null;
  unansweredCount: number | null;
  partialCount: number | null;
  questions: AdminCertificateScoreQuestion[];
}
