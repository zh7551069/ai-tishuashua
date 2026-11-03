import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assembleAdminNodes, type AdminKnowledgeRow } from './admin-catalog-tree';

describe('assembleAdminNodes', () => {
  test('分组套子节点，缺父节点的行自己当根，并按排序号排列', () => {
    const rows = [
      row('child', 'group', '逻辑思维', 2, 5),
      row('group', null, '综合素质章节', 1, 4, 'group'),
      row('root', null, '职业理念', 1, 1),
      row('orphan', 'missing', '失联节点', 2, 6),
    ];
    const tree = assembleAdminNodes(rows);
    assert.deepEqual(
      tree.map((node) => node.name),
      ['职业理念', '综合素质章节', '失联节点'],
    );
    assert.equal(tree[1]?.children[0]?.name, '逻辑思维');
    assert.equal(tree[1]?.children[0]?.parentId, 'group');
    assert.equal(tree[2]?.parentId, 'missing');
  });

  test('父子互相指向时不再递归', () => {
    const tree = assembleAdminNodes([row('a', 'b', '甲', 1, 1), row('b', 'a', '乙', 1, 2)]);
    assert.equal(tree.length, 2);
    assert.equal(
      tree.some((node) => node.children.length > 0),
      false,
    );
  });
});

function row(
  id: string,
  parentId: string | null,
  name: string,
  level: number,
  sortOrder: number,
  kind: 'knowledge_point' | 'group' = 'knowledge_point',
): AdminKnowledgeRow {
  return {
    id,
    textbookId: 'book',
    parentId,
    code: id,
    name,
    kind,
    promptHint: kind === 'group' ? null : '提示',
    sourceRef: null,
    level,
    status: 'online',
    sortOrder,
  };
}
