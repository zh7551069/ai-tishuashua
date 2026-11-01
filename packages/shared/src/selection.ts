import type { CatalogTreeNode, KnowledgePointNode, TextbookNode } from './catalog';

/** 教材行的勾选态。部分子知识点被选中时为半选。 */
export type CheckState = 'checked' | 'indeterminate' | 'unchecked';

export function textbookCheckState(
  childIds: readonly string[],
  selectedIds: readonly string[],
): CheckState {
  if (childIds.length === 0) {
    return 'unchecked';
  }
  const selected = new Set(selectedIds);
  let count = 0;
  for (const id of childIds) {
    if (selected.has(id)) {
      count += 1;
    }
  }
  if (count === 0) {
    return 'unchecked';
  }
  if (count === childIds.length) {
    return 'checked';
  }
  return 'indeterminate';
}

/** 勾选教材等于全选其下知识点；已全选时再点则清空这些知识点。 */
export function toggleTextbook(
  selectedIds: readonly string[],
  childIds: readonly string[],
): string[] {
  if (childIds.length === 0) {
    return [...selectedIds];
  }
  if (textbookCheckState(childIds, selectedIds) === 'checked') {
    const drop = new Set(childIds);
    return selectedIds.filter((id) => !drop.has(id));
  }
  const next = [...selectedIds];
  const have = new Set(selectedIds);
  for (const id of childIds) {
    if (!have.has(id)) {
      next.push(id);
    }
  }
  return next;
}

export function toggleKnowledgePoint(selectedIds: readonly string[], id: string): string[] {
  if (selectedIds.includes(id)) {
    return selectedIds.filter((item) => item !== id);
  }
  return [...selectedIds, id];
}

export function collectKnowledgePointIds(nodes: readonly CatalogTreeNode[]): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.kind === 'knowledge_point') {
      ids.push(node.id);
      continue;
    }
    for (const child of node.children) {
      ids.push(child.id);
    }
  }
  return ids;
}

/** 搜索只影响展示。教材名命中时保留全部下级知识点。 */
export function filterCatalogTree(
  nodes: readonly CatalogTreeNode[],
  query: string,
): CatalogTreeNode[] {
  const keyword = query.trim().toLocaleLowerCase();
  if (!keyword) {
    return [...nodes];
  }
  const matched: CatalogTreeNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'knowledge_point') {
      if (includesKeyword(node, keyword)) {
        matched.push(node);
      }
      continue;
    }
    if (node.name.toLocaleLowerCase().includes(keyword)) {
      matched.push(node);
      continue;
    }
    const children = node.children.filter((child) => includesKeyword(child, keyword));
    if (children.length > 0) {
      matched.push({ ...node, children });
    }
  }
  return matched;
}

function includesKeyword(node: KnowledgePointNode | TextbookNode, keyword: string): boolean {
  return node.name.toLocaleLowerCase().includes(keyword);
}
