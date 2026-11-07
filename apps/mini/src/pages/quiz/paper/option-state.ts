import type { QuizMode, QuizOutcome, QuizTypeCode } from '@tishuashua/shared';

/** 稿面标签。共享文案仍是「单选 / 多选 / 判断」，这一页按 Bridge 用全称。 */
export const PAPER_TYPE_LABEL: Record<QuizTypeCode, string> = {
  single: '单选题',
  multi: '多选题',
  judge: '判断题',
};

export type PaperTag = 'right' | 'mine' | 'miss' | 'key';

export const PAPER_TAG_LABEL: Record<PaperTag, string> = {
  right: '正确',
  mine: '你的答案',
  miss: '漏选',
  key: '正确答案',
};

export type OptionTone = 'idle' | 'picked' | 'right' | 'wrong';
export type OptionControl = 'letter' | 'check';

export interface OptionFace {
  tone: OptionTone;
  /** 考试未揭晓用勾选框；练习，以及任何已有标准答案的题，用字母。 */
  control: OptionControl;
  tag: PaperTag | null;
}

/**
 * `answer === null` 表示还没交卷，服务端不下发标准答案。
 * 这时不能画「正确 / 你的答案 / 漏选」，只区分选中与未选。
 */
export function optionFace(input: {
  mode: QuizMode;
  type: QuizTypeCode;
  selected: readonly string[];
  answer: readonly string[] | null;
  optionId: string;
}): OptionFace {
  const picked = input.selected.includes(input.optionId);
  if (!input.answer) {
    return {
      tone: picked ? 'picked' : 'idle',
      control: input.mode === 'exam' ? 'check' : 'letter',
      tag: null,
    };
  }
  const correct = input.answer.includes(input.optionId);
  if (correct && picked) {
    return { tone: 'right', control: 'letter', tag: 'right' };
  }
  if (correct && input.type === 'multi') {
    return { tone: 'right', control: 'letter', tag: 'miss' };
  }
  if (correct && input.type === 'judge') {
    return { tone: 'right', control: 'letter', tag: 'key' };
  }
  if (correct) {
    return { tone: 'right', control: 'letter', tag: 'right' };
  }
  if (picked) {
    return { tone: 'wrong', control: 'letter', tag: 'mine' };
  }
  return { tone: 'idle', control: 'letter', tag: null };
}

export type CellTone = 'current' | 'right' | 'wrong' | 'blank' | 'picked';

/** 当前题压过对错，和题板稿里第 8 题是橙色「当前」一致。 */
export function cellTone(input: {
  current: boolean;
  outcome: QuizOutcome | null;
  answered: boolean;
}): CellTone {
  if (input.current) {
    return 'current';
  }
  if (input.outcome === 'correct') {
    return 'right';
  }
  if (input.outcome === 'wrong' || input.outcome === 'partial') {
    return 'wrong';
  }
  if (input.outcome === null && input.answered) {
    return 'picked';
  }
  return 'blank';
}

export function questionHint(mode: QuizMode, type: QuizTypeCode, revealed: boolean): string | null {
  if (type === 'multi') {
    return '请选择所有正确项';
  }
  if (type === 'judge' && mode === 'exam' && !revealed) {
    return '请判断正误';
  }
  return null;
}
