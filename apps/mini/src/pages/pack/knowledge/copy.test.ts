import assert from 'node:assert/strict';
import test from 'node:test';
import { EMPTY_SELECTION_TIP, knowledgeFootCopy, knowledgeListTip } from './copy';

test('已选 0 的底栏不出现预估题量', () => {
  const text = knowledgeFootCopy(0);
  assert.equal(text, '已选 0 个知识点');
  assert.equal(text.includes('约'), false);
  assert.equal(text.includes('题'), false);
});

test('已选不少于 1 时底栏按每个知识点 10 题估算', () => {
  assert.equal(knowledgeFootCopy(3), '已选 3 个知识点 · AI 将生成约 30 题');
  assert.equal(knowledgeFootCopy(4), '已选 4 个知识点 · AI 将生成约 40 题');
  assert.equal(knowledgeFootCopy(5), '已选 5 个知识点 · AI 将生成约 50 题');
});

test('未选题时提示带句号，已选后回到树提示', () => {
  assert.equal(EMPTY_SELECTION_TIP, '请先选择知识点后再开始刷题。');
  assert.equal(
    knowledgeListTip(0, '勾选教材 = 全选其下知识点；半选表示部分已选。'),
    EMPTY_SELECTION_TIP,
  );
  assert.equal(
    knowledgeListTip(2, '教材勾选后折叠仍显示已选；点行展开查看明细。'),
    '教材勾选后折叠仍显示已选；点行展开查看明细。',
  );
});
