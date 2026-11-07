import type {
  BankIngestSource,
  BankStatus,
  QuizDifficulty,
  QuizOption,
  QuizTypeCode,
} from './quiz';

/** 后管题库列表的时间范围。缺省 `30d`。 */
export const ADMIN_QUESTION_BANK_RANGES = ['7d', '30d', '90d', 'all'] as const;
export type AdminQuestionBankRange = (typeof ADMIN_QUESTION_BANK_RANGES)[number];

export const ADMIN_QUESTION_BANK_DEFAULT_RANGE: AdminQuestionBankRange = '30d';

/** 列表「题目摘要」的最大字数。超出加省略号。 */
export const ADMIN_QUESTION_BANK_SUMMARY_MAX = 40;

/** 表头「来源」列。稿面样例行都是 AI。 */
export const ADMIN_QUESTION_BANK_SOURCE_LABELS: Record<BankIngestSource, string> = {
  ai: 'AI',
  ai_variant: '变异',
};

/**
 * 列表行。不含选项、答案和解析。
 * `summary` 是题干截断；`knowledgeLabel` 是知识点名称用「、」拼接，名称缺失时为空字符串。
 */
export interface AdminQuestionBankSummary {
  id: string;
  summary: string;
  domainId: string;
  domainName: string;
  certificateId: string;
  certificateName: string;
  kpIds: string[];
  knowledgeLabel: string;
  source: BankIngestSource;
  createdAt: string;
}

export interface AdminQuestionBankList {
  items: AdminQuestionBankSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 只读详情。在摘要上补齐题干和作答内容，没有写字段。 */
export interface AdminQuestionBankDetail extends AdminQuestionBankSummary {
  stem: string;
  type: QuizTypeCode;
  options: QuizOption[];
  answer: string[];
  analysis: string | null;
  difficulty: QuizDifficulty | null;
  status: BankStatus;
}

export function summarizeQuestionBankStem(stem: string): string {
  const compact = stem.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '题目内容无法读取';
  }
  const chars = Array.from(compact);
  if (chars.length <= ADMIN_QUESTION_BANK_SUMMARY_MAX) {
    return compact;
  }
  return `${chars.slice(0, ADMIN_QUESTION_BANK_SUMMARY_MAX).join('')}…`;
}
