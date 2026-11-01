import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  collectKnowledgePointIds,
  filterCatalogTree,
  textbookCheckState,
  toggleKnowledgePoint,
  toggleTextbook,
  type CatalogTreeNode,
} from '@tishuashua/shared';

const tree: CatalogTreeNode[] = [
  {
    id: 'book',
    kind: 'textbook',
    name: '综合素质',
    children: [
      {
        id: 'kp-1',
        kind: 'knowledge_point',
        name: '职业理念',
        promptHint: '提示',
        sourceRef: null,
        parentId: null,
        level: 1,
      },
      {
        id: 'kp-2',
        kind: 'knowledge_point',
        name: '教育法律法规',
        promptHint: '提示',
        sourceRef: null,
        parentId: null,
        level: 1,
      },
    ],
  },
  {
    id: 'free',
    kind: 'knowledge_point',
    name: '文化素养',
    promptHint: '提示',
    sourceRef: null,
    parentId: null,
    level: 1,
  },
];

describe('刷题包知识点半选', () => {
  test('未选、部分选中、全选', () => {
    assert.equal(textbookCheckState(['kp-1', 'kp-2'], []), 'unchecked');
    assert.equal(textbookCheckState(['kp-1', 'kp-2'], ['kp-1']), 'indeterminate');
    assert.equal(textbookCheckState(['kp-1', 'kp-2'], ['kp-2', 'kp-1', 'free']), 'checked');
    assert.equal(textbookCheckState([], ['kp-1']), 'unchecked');
  });

  test('勾选教材会全选下级，再点一次清空这些知识点', () => {
    const partial = toggleTextbook(['kp-1'], ['kp-1', 'kp-2']);
    assert.deepEqual(partial, ['kp-1', 'kp-2']);
    assert.deepEqual(toggleTextbook(partial, ['kp-1', 'kp-2']), []);
    assert.deepEqual(toggleKnowledgePoint(['kp-1'], 'free'), ['kp-1', 'free']);
    assert.deepEqual(toggleKnowledgePoint(['kp-1', 'free'], 'kp-1'), ['free']);
  });

  test('搜索教材保留全部知识点，搜索知识点只保留命中项', () => {
    assert.equal(filterCatalogTree(tree, ' 综合 ').length, 1);
    const byChild = filterCatalogTree(tree, '法律');
    const book = byChild[0];
    assert.equal(book?.kind, 'textbook');
    if (book?.kind === 'textbook') {
      assert.deepEqual(
        book.children.map((child) => child.id),
        ['kp-2'],
      );
    }
    assert.equal(filterCatalogTree(tree, '文化')[0]?.id, 'free');
    assert.deepEqual(filterCatalogTree(tree, '不存在'), []);
    assert.deepEqual(collectKnowledgePointIds(tree), ['kp-1', 'kp-2', 'free']);
  });
});
