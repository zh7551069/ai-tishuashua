import type { PublishStatus } from './catalog';

/** 最近一份能读出分数的已交卷快照。不重新判分。 */
export interface CertificateLatestScore {
  sessionId: string;
  earnedScore: number;
  totalScore: number;
  passed: boolean | null;
  submittedAt: string;
}

/**
 * 当前用户查到的一张证书。
 * 出现在这里，是因为本人有刷题包、错题、课件，或能对上这张证书的已交卷会话。
 * 目录选证用的 CertificateSummary 不是这个形状。
 */
export interface CertificateQueryItem {
  id: string;
  code: string;
  name: string;
  domainId: string;
  domainName: string;
  status: PublishStatus;
  /** 证书不是 online。和刷题包的 unavailable 同一条规则，不落库。 */
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
}

export interface CertificateQueryList {
  items: CertificateQueryItem[];
}
