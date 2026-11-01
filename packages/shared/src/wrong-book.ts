import type { QuizOption, QuizTypeCode } from './quiz';

export const WRONG_ITEM_STATUSES = ['pending', 'cleared'] as const;
export type WrongItemStatus = (typeof WRONG_ITEM_STATUSES)[number];

export const WRONG_ITEM_STATUS_LABELS: Record<WrongItemStatus, string> = {
  pending: '未消灭',
  cleared: '已消灭',
};

export interface WrongBookItem {
  id: string;
  certId: string;
  certName: string;
  status: WrongItemStatus;
  wrongCount: number;
  type: QuizTypeCode | null;
  stem: string;
  options: QuizOption[];
  answer: string[];
  analysis: string;
  score: number;
  updatedAt: string;
}

export interface WrongBookList {
  items: WrongBookItem[];
}
