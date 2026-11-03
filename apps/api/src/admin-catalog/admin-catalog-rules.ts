import type { CatalogNodeKind } from '@tishuashua/shared';

export const KNOWLEDGE_LEVEL_MIN = 1;
export const KNOWLEDGE_LEVEL_MAX = 4;

/** 没有父节点时是 1 级。超出 1 到 4 返回 null。 */
export function levelUnderParent(parentLevel: number | null): number | null {
  const level = parentLevel === null ? KNOWLEDGE_LEVEL_MIN : parentLevel + 1;
  if (level < KNOWLEDGE_LEVEL_MIN || level > KNOWLEDGE_LEVEL_MAX) {
    return null;
  }
  return level;
}

export function subtreeLevelsFit(min: number, max: number, delta: number): boolean {
  return min + delta >= KNOWLEDGE_LEVEL_MIN && max + delta <= KNOWLEDGE_LEVEL_MAX;
}

/**
 * 分组不能带出题提示。知识点必须有提示。
 * requested 为 undefined 时，知识点沿用 current；分组则清空提示。
 */
export function resolvePromptHint(input: {
  kind: CatalogNodeKind;
  requested: string | null | undefined;
  current: string | null;
}): { ok: true; promptHint: string | null } | { ok: false; message: string } {
  if (input.kind === 'group') {
    if (typeof input.requested === 'string' && input.requested.trim()) {
      return { ok: false, message: '分组不能填写出题提示' };
    }
    return { ok: true, promptHint: null };
  }
  const hint = (input.requested === undefined ? input.current : input.requested)?.trim() ?? '';
  if (!hint) {
    return { ok: false, message: '知识点需要出题提示' };
  }
  return { ok: true, promptHint: hint };
}
