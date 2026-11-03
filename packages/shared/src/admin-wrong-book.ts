import type { QuizOption, QuizTypeCode } from './quiz';
import type { WrongItemStatus } from './wrong-book';

/**
 * 后管错题摘要。列表不带选项、答案和解析。
 * 用户只暴露 id 和昵称，不带微信 openId。
 */
export interface AdminWrongBookSummary {
  id: string;
  userId: string;
  userNick: string | null;
  certId: string;
  certName: string;
  domainId: string;
  domainName: string;
  status: WrongItemStatus;
  wrongCount: number;
  type: QuizTypeCode | null;
  stem: string;
  createdAt: string;
  updatedAt: string;
}

export interface AdminWrongBookList {
  items: AdminWrongBookSummary[];
  total: number;
  page: number;
  pageSize: number;
}

/** 详情在摘要上补齐快照和知识点 id。没有名称，因为表里只存 id 数组。 */
export interface AdminWrongBookDetail extends AdminWrongBookSummary {
  options: QuizOption[];
  answer: string[];
  analysis: string;
  score: number;
  kpIds: string[];
}
