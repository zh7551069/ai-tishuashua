import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyWholePackSwitch,
  dailyPlanPointSelected,
  dailyPlanSessionKnowledgePointIds,
  toggleDailyPlanPoint,
} from './whole-pack';

const PACK = ['kp-a', 'kp-b', 'kp-c'];

test('打开整包练习选中全部知识点，关闭则全部清空', () => {
  const on = applyWholePackSwitch(true, PACK);
  assert.equal(on.wholePack, true);
  assert.deepEqual(on.kept, PACK);
  for (const id of PACK) {
    assert.equal(dailyPlanPointSelected(on, id), true);
  }
  assert.equal(dailyPlanSessionKnowledgePointIds(on), undefined);

  const off = applyWholePackSwitch(false, PACK);
  assert.equal(off.wholePack, false);
  assert.deepEqual(off.kept, []);
  for (const id of PACK) {
    assert.equal(dailyPlanPointSelected(off, id), false);
  }
  assert.deepEqual(dailyPlanSessionKnowledgePointIds(off), []);
});

test('整包打开时取消一个知识点，保留其余选中并退出整包', () => {
  const all = applyWholePackSwitch(true, PACK);
  const next = toggleDailyPlanPoint(all, 'kp-b', PACK);
  assert.equal(next.wholePack, false);
  assert.deepEqual(next.kept, ['kp-a', 'kp-c']);
  assert.equal(dailyPlanPointSelected(next, 'kp-a'), true);
  assert.equal(dailyPlanPointSelected(next, 'kp-b'), false);
  assert.equal(dailyPlanPointSelected(next, 'kp-c'), true);
  assert.deepEqual(dailyPlanSessionKnowledgePointIds(next), ['kp-a', 'kp-c']);
});

test('整包标记为开但 kept 仍是旧的部分选择时，取消一项仍按整包扣减', () => {
  const next = toggleDailyPlanPoint({ wholePack: true, kept: ['kp-a'] }, 'kp-c', PACK);
  assert.equal(next.wholePack, false);
  assert.deepEqual(next.kept, ['kp-a', 'kp-b']);
});

test('手动再次点满全部知识点时同步打开整包', () => {
  let selection = { wholePack: false, kept: ['kp-a', 'kp-c'] };
  selection = toggleDailyPlanPoint(selection, 'kp-b', PACK);
  assert.equal(selection.wholePack, true);
  assert.deepEqual(selection.kept, PACK);
  assert.equal(dailyPlanSessionKnowledgePointIds(selection), undefined);
});

test('默认今日计划只保留带入的知识点，开关保持关闭', () => {
  const seeded = { wholePack: false, kept: ['kp-a'] };
  assert.equal(dailyPlanPointSelected(seeded, 'kp-a'), true);
  assert.equal(dailyPlanPointSelected(seeded, 'kp-b'), false);
  assert.equal(dailyPlanPointSelected(seeded, 'kp-c'), false);
  assert.deepEqual(dailyPlanSessionKnowledgePointIds(seeded), ['kp-a']);
});

test('知识点 id 去重并忽略大小写', () => {
  const on = applyWholePackSwitch(true, ['Kp-A', ' kp-a ', 'KP-B']);
  assert.deepEqual(on.kept, ['kp-a', 'kp-b']);
  assert.equal(dailyPlanPointSelected(on, 'KP-B'), true);
});

test('出题设置页接线整包全选与清空，复练同类仍不能走整包', () => {
  const page = readFileSync(join(__dirname, 'index.tsx'), 'utf8');
  assert.match(page, /applyWholePackSwitch\(!wholePack/);
  assert.match(page, /toggleDailyPlanPoint\(/);
  assert.match(page, /dailyPlanPointSelected\(/);
  assert.match(page, /dailyPlanSessionKnowledgePointIds\(/);
  assert.equal(page.includes('!wholePack && (kept ?? []).includes'), false);
  assert.equal(page.includes('setKept([id])'), false);
  assert.match(page, /请选择至少一个知识点，或打开整包练习/);
  assert.match(page, /fromDailyPlan && !wholePack/);
  assert.match(page, /不能改成整包/);
  assert.match(page, /source: 'retrain_similar' as const, knowledgePointIds: kept \?\? \[\]/);
});
