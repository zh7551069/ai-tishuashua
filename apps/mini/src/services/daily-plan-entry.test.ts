import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { test } from 'node:test';

const require = createRequire(__filename);
const sharedRoot = join(__dirname, '../../../../packages/shared');

const FUNCTIONS = [
  'dailyPlanDayNumber',
  'dailyPlanFootnote',
  'dailyPlanLayout',
  'dailyPlanPercent',
  'dailyPlanQuizPath',
  'dailyPlanRing',
  'dailyPlanWeek',
  'formatDailyPlanDate',
  'resolveDailyPlanCta',
] as const;

const CONSTANTS = [
  'DAILY_PLAN_CTA_LABEL',
  'DAILY_PLAN_EMPTY_HINT',
  'DAILY_PLAN_ENCOURAGEMENT',
  'DAILY_PLAN_GREETING',
  'DAILY_PLAN_MULTI_PACE',
  'DAILY_PLAN_WEEK_STARTS_ON',
  'DAILY_PLAN_WEEKDAY_LABELS',
] as const;

test('daily-plan 从 @tishuashua/shared 入口拿到的是函数和常量', () => {
  const shared = require('@tishuashua/shared') as Record<string, unknown>;

  for (const name of FUNCTIONS) {
    assert.equal(typeof shared[name], 'function', name);
  }

  assert.equal(shared.DAILY_PLAN_CTA_LABEL, '开始今日刷题练习');
  assert.equal(shared.DAILY_PLAN_EMPTY_HINT, '创建刷题包后，即可开始今日练习');
  assert.equal(shared.DAILY_PLAN_ENCOURAGEMENT, '今天的每一次练习，都在积累进步');
  assert.equal(shared.DAILY_PLAN_GREETING, '你好，备考人');
  assert.equal(shared.DAILY_PLAN_MULTI_PACE, '按自己的节奏，一包包进步。');
  assert.equal(shared.DAILY_PLAN_WEEK_STARTS_ON, 'monday');
  assert.deepEqual(shared.DAILY_PLAN_WEEKDAY_LABELS, ['一', '二', '三', '四', '五', '六', '日']);

  const layout = shared.dailyPlanLayout as (plan: {
    empty: boolean;
    packs: readonly unknown[];
  }) => string;
  assert.equal(layout({ empty: true, packs: [] }), 'empty');
  assert.equal(layout({ empty: false, packs: [{}] }), 'single');
  assert.equal(layout({ empty: false, packs: [{}, {}] }), 'multi');

  const dayNumber = shared.dailyPlanDayNumber as (isoDate: string) => number;
  assert.equal(dayNumber('2026-11-10'), 10);
  const formatDate = shared.formatDailyPlanDate as (isoDate: string) => string;
  assert.match(formatDate('2026-11-10'), /2026年11月10日/);
  assert.match(formatDate('2026-11-10'), /星期二/);

  const cta = shared.resolveDailyPlanCta as (plan: { empty: boolean; activePack: null }) => {
    enabled: boolean;
    hint?: string;
  };
  const emptyCta = cta({ empty: true, activePack: null });
  assert.equal(emptyCta.enabled, false);
  assert.equal(emptyCta.hint, shared.DAILY_PLAN_EMPTY_HINT);

  const quizPath = shared.dailyPlanQuizPath as (packId: string, knowledgePointId: string) => string;
  assert.match(quizPath('pack-1', 'kp-1'), /intent=dailyPlan/);
  assert.equal((shared.dailyPlanPercent as (done: number, total: number) => number)(1, 3), 33);

  const emptyPlan = {
    businessDate: '2026-11-10',
    weekStartsOn: 'monday' as const,
    empty: true,
    activePackId: null,
    summary: {
      availablePackCount: 0,
      completedCount: 0,
      totalCount: 0,
      remainingCount: 0,
      percent: 0,
    },
    activePack: null,
    packs: [],
    week: [],
  };
  assert.equal(
    (shared.dailyPlanFootnote as (plan: typeof emptyPlan) => string)(emptyPlan),
    '创建刷题包后，即可开始今日练习',
  );
  assert.equal((shared.dailyPlanRing as (plan: typeof emptyPlan) => unknown)(emptyPlan), null);
  const week = (shared.dailyPlanWeek as (isoDate: string) => Array<{ date: string }>)('2026-11-10');
  assert.equal(week[0]?.date, '2026-11-09');
  assert.equal(week[1]?.date, '2026-11-10');

  const entry = readFileSync(join(sharedRoot, 'dist/index.js'), 'utf8');
  const codeLines = entry.split('\n').filter((line) => {
    const trimmed = line.trim();
    return trimmed.length > 0 && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
  });
  for (const name of FUNCTIONS) {
    assert.match(entry, new RegExp(`function ${name}\\(`));
    assert.match(entry, new RegExp(`exports\\.${name} = ${name};`));
    assert.equal(entry.includes(`Object.defineProperty(exports, "${name}"`), false, name);
    assert.equal(
      codeLines.some((line) => line.includes(`exports.${name} =`) && line.includes('void 0')),
      false,
      name,
    );
  }
  for (const name of CONSTANTS) {
    assert.match(entry, new RegExp(`exports\\.${name} = daily_plan_1\\.${name};`));
    assert.equal(entry.includes(`Object.defineProperty(exports, "${name}"`), false, name);
  }

  const barrel = readFileSync(join(sharedRoot, 'src/index.ts'), 'utf8');
  const barrelCode = barrel
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !trimmed.startsWith('*') && !trimmed.startsWith('/*') && !trimmed.startsWith('//');
    })
    .join('\n');
  assert.equal(/export\s*\{[^}]*\}\s*from\s*'\.\/daily-plan'/.test(barrelCode), false);
  assert.match(barrelCode, /export type \{[^}]*DailyPlanLayout[^}]*\} from '\.\/daily-plan'/);
  assert.match(barrel, /不要改回 `export \{ \.\.\. \} from '\.\/daily-plan'`/);
  assert.equal(barrel.includes('node:crypto'), false);
  assert.equal(barrel.includes('entitlement-server'), false);
});
