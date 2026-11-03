import type { AdminKnowledgeNode, CatalogNodeKind, PublishStatus } from '@tishuashua/shared';

export interface AdminKnowledgeRow {
  id: string;
  textbookId: string | null;
  parentId: string | null;
  code: string;
  name: string;
  kind: CatalogNodeKind;
  promptHint: string | null;
  sourceRef: string | null;
  level: number;
  status: PublishStatus;
  sortOrder: number;
}

/** 按 parentId 组树。父节点不在本批数据里、或成环时，节点自己当根。 */
export function assembleAdminNodes(rows: readonly AdminKnowledgeRow[]): AdminKnowledgeNode[] {
  const parentById = new Map(rows.map((row) => [row.id, row.parentId]));
  const nodes = new Map<string, AdminKnowledgeNode>();
  for (const row of rows) {
    nodes.set(row.id, {
      id: row.id,
      code: row.code,
      name: row.name,
      kind: row.kind,
      promptHint: row.promptHint,
      sourceRef: row.sourceRef,
      level: row.level,
      status: row.status,
      sortOrder: row.sortOrder,
      parentId: row.parentId,
      children: [],
    });
  }

  const roots: AdminKnowledgeNode[] = [];
  for (const row of rows) {
    const node = nodes.get(row.id);
    if (!node) {
      continue;
    }
    const parent = row.parentId ? nodes.get(row.parentId) : undefined;
    if (!parent || createsCycle(row.id, row.parentId, parentById)) {
      roots.push(node);
      continue;
    }
    parent.children.push(node);
  }
  sortTree(roots, new Set());
  return roots;
}

function createsCycle(
  nodeId: string,
  parentId: string | null,
  parentById: ReadonlyMap<string, string | null>,
): boolean {
  let current = parentId;
  const seen = new Set<string>();
  while (current) {
    if (current === nodeId || seen.has(current)) {
      return true;
    }
    seen.add(current);
    current = parentById.get(current) ?? null;
  }
  return false;
}

function sortTree(nodes: AdminKnowledgeNode[], seen: Set<string>): void {
  nodes.sort(compareNode);
  for (const node of nodes) {
    if (seen.has(node.id)) {
      continue;
    }
    seen.add(node.id);
    sortTree(node.children, seen);
  }
}

function compareNode(left: AdminKnowledgeNode, right: AdminKnowledgeNode): number {
  return (
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name, 'zh') ||
    left.id.localeCompare(right.id)
  );
}
