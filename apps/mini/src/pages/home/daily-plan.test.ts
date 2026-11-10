import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  dailyPlanQuizPath,
  resolveDailyPlanCta,
} from '@tishuashua/shared';

const root = join(__dirname, '..', '..');

describe('home daily plan wiring', () => {
  test('默认只带一个待练知识点', () => {
    const cta = resolveDailyPlanCta({
      empty: false,
      activePack: {
        packId: 'pack-1',
        name: '包',
        domainName: '领域',
        certName: '证书',
        unavailable: false,
        knowledgePointCount: 2,
        completedCount: 1,
        remainingCount: 1,
        percent: 50,
        items: [
          {
            knowledgePointId: 'kp-next',
            name: '待练',
            done: false,
            completedAt: null,
          },
          {
            knowledgePointId: 'kp-done',
            name: '已练',
            done: true,
            completedAt: '2026-11-10T01:00:00.000Z',
          },
        ],
      },
    });
    assert.equal(cta.enabled, true);
    if (!cta.enabled) {
      return;
    }
    const url = dailyPlanQuizPath(cta.packId, cta.knowledgePointId);
    assert.match(url, /kpIds=kp-next/);
    assert.match(url, /intent=dailyPlan/);
    assert.equal(url.includes('kpIds=&'), false);
    assert.equal(url.endsWith('kpIds='), false);
  });

  test('空态文案固定，首页不接支付、分享或成绩列表', () => {
    const empty = resolveDailyPlanCta({ empty: true, activePack: null });
    assert.equal(empty.enabled, false);
    if (!empty.enabled) {
      assert.equal(empty.hint, '创建刷题包后，即可开始今日练习');
    }
    const home = readFileSync(join(root, 'pages/home/index.tsx'), 'utf8');
    const quiz = readFileSync(join(root, 'pages/quiz/index.tsx'), 'utf8');
    assert.match(home, /\/me\/daily-plan/);
    assert.match(home, /useDidShow/);
    assert.match(home, /dailyPlanQuizPath/);
    assert.match(home, /activatePack/);
    assert.match(home, /\/pages\/pack\/domain\/index/);
    assert.equal(/requestPayment|quiz\/sessions|session-ledger|daily-share|invite/.test(home), false);
    assert.match(quiz, /intent\) === 'dailyPlan'/);
    assert.match(quiz, /knowledgePointIds: kept/);
    assert.match(quiz, /整包练习/);
  });
});
