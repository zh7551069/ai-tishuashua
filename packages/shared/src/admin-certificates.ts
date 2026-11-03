import type { PublishStatus } from './catalog';
import type { CertificateLatestScore } from './certificate-query';
import type { QuizMode, QuizSubmitReason } from './quiz';

/** 后管成绩列表在快照读不出来时仍保留这一行，用这句代替分数。 */
export const ADMIN_SCORE_UNREADABLE = '成绩无法读取';

/**
 * 一名用户与一张证书的关联摘要。
 * 字段对齐小程序证书卡，并补上用户。id 是证书 id，一行的身份是 userId + id。
 * 不带微信 openId。
 */
export interface AdminCertificateLinkSummary {
  userId: string;
  userNick: string | null;
  id: string;
  code: string;
  name: string;
  domainId: string;
  domainName: string;
  status: PublishStatus;
  /** 证书不是 online。和证书卡的 unavailable 同一条规则，不落库。 */
  unavailable: boolean;
  totalScore: number;
  passScore: number | null;
  enabledQuestionTypeCodes: string[];
  extraConstraint: string | null;
  packCount: number;
  activePackId: string | null;
  submittedCount: number;
  pendingWrongCount: number;
  uploadCount: number;
  latestScore: CertificateLatestScore | null;
  /** 刷题包、错题、课件、已交卷四类时间里较晚的那个。和证书查询的排序时间同一条规则。 */
  touchedAt: string | null;
}

export interface AdminCertificateLinkList {
  items: AdminCertificateLinkSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情补上每个来源自己的最近时间。没有该来源时为 null。 */
export interface AdminCertificateLinkDetail extends AdminCertificateLinkSummary {
  packTouchedAt: string | null;
  wrongTouchedAt: string | null;
  uploadTouchedAt: string | null;
  submittedTouchedAt: string | null;
}

/**
 * 一次已交卷的摘要。分数、证书名、刷题包名和交卷原因对齐 QuizScoreSummary。
 * 读不出 pass_snapshot 时 readable 为 false，数字为 null，这一行仍保留。
 * 小程序成绩列表会丢掉这种行，后管不丢。
 */
export interface AdminScoreSummary {
  id: string;
  userId: string;
  userNick: string | null;
  mode: QuizMode;
  certId: string | null;
  /** 交卷时写入 pack_snapshot 的证书名。读不出时为空字符串。 */
  certName: string;
  /** 能对上现存证书时的当前名称。对不上时为 null。 */
  resolvedCertName: string | null;
  domainId: string | null;
  domainName: string | null;
  packId: string | null;
  /** 交卷时写入 pack_snapshot 的刷题包名。读不出时为空字符串。 */
  packName: string;
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
  readable: boolean;
}

export interface AdminScoreList {
  items: AdminScoreSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情补上快照里的错题、未作答、少选，以及开考和创建时间。不含题目。 */
export interface AdminScoreDetail extends AdminScoreSummary {
  wrongCount: number | null;
  unansweredCount: number | null;
  partialCount: number | null;
  startedAt: string | null;
  createdAt: string;
}
