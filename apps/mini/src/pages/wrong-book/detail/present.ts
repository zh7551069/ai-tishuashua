import type { KnowledgeTree, QuizTypeCode, WrongBookItem } from '@tishuashua/shared';

/**
 * 错题详情契约只有标准答案，没有用户当时的选项。
 * selected 为空时只把正确项标成「正确答案」。
 * 传入选项后，按 Bridge 7 帧标「你的答案 / 漏选 / 错选」。
 */
export type DetailOptionTone = 'idle' | 'wrong' | 'right';
export type DetailTagTone = 'wrong' | 'right' | 'miss';

export interface DetailOptionTag {
  text: string;
  tone: DetailTagTone;
}

export interface DetailOptionFace {
  tone: DetailOptionTone;
  tags: DetailOptionTag[];
}

export function detailOptionFace(input: {
  type: QuizTypeCode | null;
  selected: readonly string[];
  answer: readonly string[];
  optionId: string;
}): DetailOptionFace {
  const picked = input.selected.includes(input.optionId);
  const correct = input.answer.includes(input.optionId);
  if ((input.type ?? 'single') === 'multi') {
    if (correct && picked) {
      return {
        tone: 'right',
        tags: [
          { text: '你的答案', tone: 'right' },
          { text: '正确答案', tone: 'right' },
        ],
      };
    }
    if (picked && !correct) {
      return { tone: 'wrong', tags: [{ text: '你的答案 · 错选', tone: 'wrong' }] };
    }
    if (correct) {
      const anyHit = input.answer.some((id) => input.selected.includes(id));
      return anyHit
        ? { tone: 'right', tags: [{ text: '正确答案 · 漏选', tone: 'miss' }] }
        : { tone: 'right', tags: [{ text: '正确答案', tone: 'right' }] };
    }
    return { tone: 'idle', tags: [] };
  }
  if (picked && !correct) {
    return { tone: 'wrong', tags: [{ text: '你的答案', tone: 'wrong' }] };
  }
  if (correct) {
    return { tone: 'right', tags: [{ text: '正确答案', tone: 'right' }] };
  }
  return { tone: 'idle', tags: [] };
}

/** 稿面元信息：证书 · 知识点 · 今天/昨天/月日时刻。详情没有练习/考试字段。 */
export function detailMeta(
  item: Pick<WrongBookItem, 'certName' | 'kpNames' | 'updatedAt'>,
  now = new Date(),
): string {
  const parts: string[] = [];
  const cert = item.certName.trim();
  if (cert) {
    parts.push(cert);
  }
  const point = item.kpNames?.map((name) => name.trim()).find(Boolean);
  if (point) {
    parts.push(point);
  }
  const when = formatDetailWhen(item.updatedAt, now);
  if (when) {
    parts.push(when);
  }
  return parts.join(' · ');
}

export function formatDetailWhen(iso: string, now = new Date()): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return iso;
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  const day = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((day(now) - day(date)) / 86400000);
  if (diff === 0) {
    return `今天 ${clock}`;
  }
  if (diff === 1) {
    return `昨天 ${clock}`;
  }
  return `${date.getMonth() + 1}月${date.getDate()}日 ${clock}`;
}

export interface DetailSource {
  key: string;
  title: string;
  subtitle: string;
}

/** 用已有知识树把知识点对上教材和 sourceRef。对不上就不出假书名。 */
export function detailSources(
  kpIds: readonly string[],
  tree: KnowledgeTree | null,
): DetailSource[] {
  if (!tree || kpIds.length === 0) {
    return [];
  }
  const located = new Map<
    string,
    { bookId: string; bookName: string; name: string; sourceRef: string }
  >();
  for (const node of tree.nodes) {
    if (node.kind === 'textbook') {
      for (const child of node.children) {
        located.set(child.id.toLowerCase(), {
          bookId: node.id,
          bookName: node.name,
          name: child.name,
          sourceRef: (child.sourceRef ?? '').trim(),
        });
      }
      continue;
    }
    located.set(node.id.toLowerCase(), {
      bookId: '',
      bookName: '',
      name: node.name,
      sourceRef: (node.sourceRef ?? '').trim(),
    });
  }
  const cards: DetailSource[] = [];
  const seen = new Set<string>();
  for (const id of kpIds) {
    const point = located.get(id.toLowerCase());
    if (!point) {
      continue;
    }
    const title = bookTitle(point.bookName || point.name);
    const subtitle = point.sourceRef || (point.bookName ? point.name : '');
    const key = `${point.bookId || id.toLowerCase()}:${subtitle}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    cards.push({ key, title, subtitle });
  }
  return cards;
}

function bookTitle(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) {
    return '教材';
  }
  if (trimmed.startsWith('《') && trimmed.endsWith('》')) {
    return trimmed;
  }
  return `《${trimmed}》`;
}
