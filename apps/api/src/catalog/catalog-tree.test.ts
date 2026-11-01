import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assembleKnowledgeTree } from './catalog-tree';

const textbookId = '11111111-1111-4111-8111-111111111301';
const otherTextbookId = '22222222-2222-4222-8222-222222222301';

describe('assembleKnowledgeTree', () => {
  test('教材挂知识点，独立知识点放在后面，空教材和陌生教材下的知识点不出现', () => {
    const tree = assembleKnowledgeTree({
      certificateId: 'cert',
      certificateName: '中学教师资格',
      domainId: 'domain',
      domainName: '教师资格',
      textbooks: [
        { id: textbookId, name: '综合素质' },
        { id: 'empty-book', name: '空教材' },
      ],
      knowledgePoints: [
        point('kp-1', textbookId, '职业理念'),
        point('kp-2', textbookId, '教育法律法规'),
        point('orphan', otherTextbookId, '不属于这张证书的教材'),
        point('free', null, '文化素养'),
      ],
    });

    assert.equal(tree.nodes.length, 2);
    const textbook = tree.nodes[0];
    assert.equal(textbook?.kind, 'textbook');
    if (textbook?.kind !== 'textbook') {
      return;
    }
    assert.deepEqual(
      textbook.children.map((child) => child.name),
      ['职业理念', '教育法律法规'],
    );
    assert.equal(tree.nodes[1]?.kind, 'knowledge_point');
    assert.equal(tree.nodes[1]?.name, '文化素养');
    assert.equal(
      tree.nodes.some((node) => node.name === '空教材' || node.name === '不属于这张证书的教材'),
      false,
    );
  });
});

function point(id: string, textbookId: string | null, name: string) {
  return {
    id,
    textbookId,
    parentId: null,
    name,
    promptHint: '提示',
    sourceRef: null,
    level: 1,
  };
}
