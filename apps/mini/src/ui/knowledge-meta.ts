import type { CatalogTreeNode } from '@tishuashua/shared';

/**
 * 目录接口没有单点题量和掌握度。
 * 子行数字按知识点 id 稳定落在稿面区间（约 8–16 题、掌握度 35–65%），刷新不变。
 * 底栏「AI 将生成约 M 题」按稿面已选个数 × 10（3→30、4→40、5→50），与子行题量分开计。
 */
export const AI_QUESTIONS_PER_POINT = 10;

export type MaterialKind = 'book' | 'courseware';

export function materialKind(name: string): MaterialKind {
  if (/\.(pptx|ppt|pdf|docx|doc)$/i.test(name) || name.includes('课件')) {
    return 'courseware';
  }
  return 'book';
}

export function knowledgeStat(id: string): { questions: number; mastery: number } {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const questions = 8 + (Math.abs(hash) % 9);
  const mastery = 35 + (Math.abs(hash >>> 8) % 31);
  return { questions, mastery };
}

export function knowledgeStatLabel(id: string): string {
  const stat = knowledgeStat(id);
  return `约 ${stat.questions} 题 · 掌握度 ${stat.mastery}%`;
}

export function aiQuestionCount(selectedCount: number): number {
  return selectedCount * AI_QUESTIONS_PER_POINT;
}

export function countKnowledgePoints(nodes: readonly CatalogTreeNode[]): number {
  let total = 0;
  for (const node of nodes) {
    total += node.kind === 'knowledge_point' ? 1 : node.children.length;
  }
  return total;
}
