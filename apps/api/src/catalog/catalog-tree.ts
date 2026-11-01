import type { CatalogTreeNode, KnowledgePointNode, KnowledgeTree } from '@tishuashua/shared';

export interface TextbookRow {
  id: string;
  name: string;
}

export interface KnowledgeRow {
  id: string;
  textbookId: string | null;
  parentId: string | null;
  name: string;
  promptHint: string;
  sourceRef: string | null;
  level: number;
}

export function assembleKnowledgeTree(input: {
  certificateId: string;
  certificateName: string;
  domainId: string;
  domainName: string;
  textbooks: readonly TextbookRow[];
  knowledgePoints: readonly KnowledgeRow[];
}): KnowledgeTree {
  const textbookIds = new Set(input.textbooks.map((textbook) => textbook.id));
  const byTextbook = new Map<string, KnowledgePointNode[]>();
  const independent: KnowledgePointNode[] = [];

  for (const row of input.knowledgePoints) {
    const node: KnowledgePointNode = {
      id: row.id,
      kind: 'knowledge_point',
      name: row.name,
      promptHint: row.promptHint,
      sourceRef: row.sourceRef,
      parentId: row.parentId,
      level: row.level,
    };
    if (row.textbookId) {
      if (!textbookIds.has(row.textbookId)) {
        continue;
      }
      const children = byTextbook.get(row.textbookId) ?? [];
      children.push(node);
      byTextbook.set(row.textbookId, children);
      continue;
    }
    independent.push(node);
  }

  const nodes: CatalogTreeNode[] = [];
  for (const textbook of input.textbooks) {
    const children = byTextbook.get(textbook.id) ?? [];
    if (children.length === 0) {
      continue;
    }
    nodes.push({
      id: textbook.id,
      kind: 'textbook',
      name: textbook.name,
      children,
    });
  }
  nodes.push(...independent);

  return {
    certificateId: input.certificateId,
    certificateName: input.certificateName,
    domainId: input.domainId,
    domainName: input.domainName,
    nodes,
  };
}
