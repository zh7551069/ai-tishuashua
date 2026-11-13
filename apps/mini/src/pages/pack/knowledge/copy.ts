import { aiQuestionCount } from '../../../ui/knowledge-meta';

/** 已选 0 的提示。句末句号是验收文案的一部分。 */
export const EMPTY_SELECTION_TIP = '请先选择知识点后再开始刷题。';

/**
 * 底栏文案。个数为 0 时只写知识点数，不写预估题量。
 * 个数 ≥ 1 时仍用现网「个数 × AI_QUESTIONS_PER_POINT」。
 */
export function knowledgeFootCopy(count: number): string {
  if (count <= 0) {
    return '已选 0 个知识点';
  }
  return `已选 ${count} 个知识点 · AI 将生成约 ${aiQuestionCount(count)} 题`;
}

export function knowledgeListTip(count: number, selectedTip: string): string {
  if (count <= 0) {
    return EMPTY_SELECTION_TIP;
  }
  return selectedTip;
}
