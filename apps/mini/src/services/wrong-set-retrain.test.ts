import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { wrongSetCreateBody, wrongSetRetrainLabel } from './wrong-set-retrain';

const miniRoot = join(__dirname, '../..');

test('再练文案只用未过滤错题数，N=0 不露出', () => {
  assert.equal(wrongSetRetrainLabel(0), null);
  assert.equal(wrongSetRetrainLabel(-1), null);
  assert.equal(wrongSetRetrainLabel(1.5), null);
  assert.equal(wrongSetRetrainLabel(4), '再练这 4 道');
  assert.equal(wrongSetRetrainLabel(50), '再练这 50 道');
});

test('wrongSet 请求体只有来源和来源场次', () => {
  assert.deepEqual(wrongSetCreateBody('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'), {
    source: 'wrongSet',
    sourceSessionId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  });
});

test('回顾底栏直接出卷，结果页再练一次仍回出题设置', () => {
  const result = readFileSync(join(miniRoot, 'src/pages/score/result.tsx'), 'utf8');
  const paper = readFileSync(join(miniRoot, 'src/pages/quiz/paper/index.tsx'), 'utf8');
  const start = readFileSync(join(miniRoot, 'src/services/wrong-set-retrain-start.ts'), 'utf8');
  assert.match(result, /RetrainBar/);
  assert.match(result, /count=\{wrong\.length\}/);
  assert.match(result, /再练一次/);
  assert.match(result, /\/pages\/quiz\/index\?packId=/);
  assert.doesNotMatch(result, /exhausted-sheet/);
  assert.match(paper, /RetrainBar/);
  assert.match(paper, /count=\{props\.wrongCount\}/);
  assert.doesNotMatch(paper, /exhausted-sheet/);
  assert.match(start, /wrongSetCreateBody/);
  assert.match(start, /\/pages\/quiz\/paper\/index\?sessionId=/);
  assert.doesNotMatch(start, /pages\/quiz\/index/);
  assert.doesNotMatch(start, /pages\/quiz\/progress/);
  assert.doesNotMatch(start, /exhausted/);
});
