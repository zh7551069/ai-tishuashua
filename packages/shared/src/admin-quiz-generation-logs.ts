/** 出题尝试的请求摘要。不放 Prompt 正文。 */
export interface AdminQuizGenerationRequestSummary {
  count: number | null;
  types: string[] | null;
  difficulty: string | null;
  mode: string | null;
  source: string | null;
  generationStats: {
    wrongCarried: number;
    bankDrawn: number;
    aiGenerated: number;
  } | null;
}

/**
 * 一行出题尝试。列表里的 errorMessage 最多 120 字。
 * 不回传 Prompt 正文，也不回传模型密钥。
 */
export interface AdminQuizGenerationLogSummary {
  id: string;
  sessionId: string | null;
  userId: string | null;
  userNick: string | null;
  certId: string | null;
  certName: string | null;
  templateId: string | null;
  templateVersion: number | null;
  templateCode: string | null;
  usedBuiltin: boolean;
  success: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AdminQuizGenerationLogList {
  items: AdminQuizGenerationLogSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情补上 requestSummary，errorMessage 用库里已截断到 500 字的全文。 */
export interface AdminQuizGenerationLogDetail extends AdminQuizGenerationLogSummary {
  requestSummary: AdminQuizGenerationRequestSummary;
}

export interface AdminQuizGenerationLogStats {
  days: number;
  since: string;
  attemptCount: number;
  failureCount: number;
  /** 没有尝试时为 null。回落内置且出题成功不增加 failureCount。 */
  failureRate: number | null;
  builtinFallbackCount: number;
}
