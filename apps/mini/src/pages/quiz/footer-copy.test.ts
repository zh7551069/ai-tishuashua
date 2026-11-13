import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { quizSettingsFooterLine } from './footer-copy';

const pageDir = __dirname;
const miniRoot = join(pageDir, '..', '..');

test('未选题型只出底栏提示，已选后按题量、难度、题型和计时拼摘要', () => {
  assert.deepEqual(
    quizSettingsFooterLine({
      types: [],
      count: 20,
      difficulty: 'medium',
      timerOn: false,
      timerKind: 'paper',
      paperMinutes: 30,
      perQuestionSeconds: 60,
    }),
    { kind: 'alert', text: '请先选择题型' },
  );
  assert.equal(
    quizSettingsFooterLine({
      types: ['multi', 'single'],
      count: 20,
      difficulty: 'medium',
      timerOn: false,
      timerKind: 'paper',
      paperMinutes: 30,
      perQuestionSeconds: 60,
    }).text,
    '20 题 · 中等 · 单选、多选 · 不限时',
  );
  assert.equal(
    quizSettingsFooterLine({
      types: ['single', 'multi'],
      count: 20,
      difficulty: 'medium',
      timerOn: true,
      timerKind: 'paper',
      paperMinutes: 30,
      perQuestionSeconds: 60,
    }).text,
    '20 题 · 中等 · 单选、多选 · 整卷倒计时 30 分钟',
  );
  const perQuestion = quizSettingsFooterLine({
    types: ['single', 'multi'],
    count: 20,
    difficulty: 'medium',
    timerOn: true,
    timerKind: 'per_question',
    paperMinutes: 30,
    perQuestionSeconds: 60,
  }).text;
  assert.equal(perQuestion, '20 题 · 中等 · 单选、多选 · 每题限时 60 秒');
  assert.equal(perQuestion.includes('60 分钟'), false);
  assert.equal(perQuestion.includes('30 分钟'), false);
});

test('出题设置页保持秒制接线，样式落在新稿宽度，且不改公共画布与 TB-47 浅底', () => {
  const page = readFileSync(join(pageDir, 'index.tsx'), 'utf8');
  const css = readFileSync(join(pageDir, 'index.css'), 'utf8');
  const config = readFileSync(join(pageDir, 'index.config.ts'), 'utf8');
  const tokens = readFileSync(join(miniRoot, 'theme/tokens.css'), 'utf8');
  const knowledge = readFileSync(join(miniRoot, 'pages/pack/knowledge/index.css'), 'utf8');

  assert.match(page, /每题限时（秒）/);
  assert.match(page, /总时长（分钟）/);
  assert.match(page, /clamp\(next, 1, 180\)/);
  assert.match(page, /clamp\(next, 1, 600\)/);
  assert.match(page, /step=\{10\}/);
  assert.match(page, /kind: 'per_question', perQuestionSeconds/);
  assert.match(page, /kind: 'paper', paperMinutes/);
  assert.match(page, /enabled: false/);
  assert.match(page, /if \(!pack \|\| blocked\)/);
  assert.match(page, /DEFAULT_QUIZ_MODE/);
  assert.match(page, /模式/);
  assert.match(page, /−/);
  assert.equal(page.includes('请先选择题型</Text>'), false);
  assert.match(page, /quizSettingsFooterLine/);
  assert.match(page, /settings-hero\.jpg/);

  assert.match(css, /width: 80\.75px/);
  assert.match(css, /width: 83\.75px/);
  assert.match(css, /114\.67px/);
  assert.match(css, /width: 111\.33px/);
  assert.match(css, /width: 112px/);
  assert.match(css, /width: 110px/);
  assert.match(css, /rgb\(231, 229, 228\)/);
  assert.match(css, /rgb\(168, 162, 158\)/);
  assert.match(css, /rgb\(154, 63, 44\)/);
  assert.match(css, /rgba\(247, 248, 244, 0\.92\)/);
  assert.match(css, /left: 14\.5px/);
  assert.match(css, /top: 10px/);
  assert.match(css, /height: 128px/);
  assert.match(css, /border-radius: 20px/);
  assert.match(css, /inset 0 0 0 1px var\(--ts-accent-100\)/);
  assert.match(css, /inset 0 0 0 1\.5px var\(--ts-accent\)/);
  assert.equal(css.split('rgb(231, 229, 228)').length - 1, 1);
  assert.match(css, /\.u-foot\.qs-foot \{[^}]*background: #ffffff/);

  assert.match(config, /backgroundColor: '#f5f5f7'/);
  assert.match(tokens, /--ts-canvas: #f5f5f7/);
  assert.match(tokens, /--ts-tint: #f4f8e8/);
  assert.match(knowledge, /\.kp-point-on \{[^}]*background: #F7F8F4/);
});
