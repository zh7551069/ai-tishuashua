import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { levelUnderParent, resolvePromptHint, subtreeLevelsFit } from './admin-catalog-rules';

describe('admin catalog rules', () => {
  test('层级从父节点加一，最高 4 级', () => {
    assert.equal(levelUnderParent(null), 1);
    assert.equal(levelUnderParent(1), 2);
    assert.equal(levelUnderParent(4), null);
    assert.equal(subtreeLevelsFit(1, 2, 2), true);
    assert.equal(subtreeLevelsFit(1, 2, 3), false);
    assert.equal(subtreeLevelsFit(2, 3, -1), true);
  });

  test('分组清空提示，知识点必须有提示', () => {
    assert.deepEqual(
      resolvePromptHint({ kind: 'group', requested: undefined, current: '旧提示' }),
      {
        ok: true,
        promptHint: null,
      },
    );
    assert.equal(resolvePromptHint({ kind: 'group', requested: '不要', current: null }).ok, false);
    assert.deepEqual(
      resolvePromptHint({ kind: 'knowledge_point', requested: undefined, current: '保留' }),
      { ok: true, promptHint: '保留' },
    );
    assert.equal(
      resolvePromptHint({ kind: 'knowledge_point', requested: '  ', current: '保留' }).ok,
      false,
    );
    assert.deepEqual(
      resolvePromptHint({ kind: 'knowledge_point', requested: ' 新提示 ', current: null }),
      { ok: true, promptHint: '新提示' },
    );
  });
});
