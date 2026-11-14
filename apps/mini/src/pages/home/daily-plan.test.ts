import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { dailyPlanQuizPath, resolveDailyPlanCta } from '@tishuashua/shared';

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
    const entry = readFileSync(join(root, 'theme/pack-entry.ts'), 'utf8');
    assert.match(home, /\/me\/daily-plan/);
    assert.match(home, /useDidShow/);
    assert.match(home, /homeEntryTarget\('knowledge'/);
    assert.match(home, /homeEntryTarget\(entry\)/);
    assert.match(home, /activatePack/);
    assert.match(home, /go\('plus'\)/);
    assert.match(home, /go\('cta'\)/);
    assert.match(home, /go\('create'\)/);
    assert.match(home, /go\('profile'\)/);
    assert.match(home, /HeroIllustration/);
    assert.equal(home.includes('saveHeroGender'), false);
    assert.equal(home.includes('/pages/pack/domain/index'), false);
    assert.match(entry, /PACK_INDEX_ROUTE = '\/pages\/pack\/index'/);
    assert.match(entry, /ME_ROUTE = '\/pages\/me\/index'/);
    assert.equal(
      /requestPayment|quiz\/sessions|session-ledger|daily-share|invite/.test(home),
      false,
    );
    assert.match(quiz, /intent\) === 'dailyPlan'/);
    assert.match(quiz, /knowledgePointIds: kept/);
    assert.match(quiz, /整包练习/);
  });

  test('四帧文案走现有入口，插画字节不变', () => {
    const home = readFileSync(join(root, 'pages/home/index.tsx'), 'utf8');
    const css = readFileSync(join(root, 'pages/home/daily-plan.css'), 'utf8');
    assert.match(home, /全部/);
    assert.match(home, /个知识点/);
    assert.match(home, /domainName/);
    assert.match(home, /DAILY_PLAN_ENCOURAGEMENT/);
    assert.match(home, /layout !== 'empty'/);
    assert.equal(home.includes('或点击右上方'), false);
    assert.equal(home.includes('仅显示当前包'), false);
    assert.equal(home.includes('待练习优先'), false);
    assert.equal(home.includes('dp-tool-plus'), false);
    assert.equal(home.includes('已完成'), false);
    assert.equal(home.includes('待练习'), false);
    assert.match(css, /#a8a29e/);
    const male = readFileSync(join(root, 'assets/hero/male.jpg'));
    const female = readFileSync(join(root, 'assets/hero/female.jpg'));
    assert.equal(male.length, 19510);
    assert.equal(female.length, 21314);
    assert.equal(
      createHash('sha256').update(male).digest('hex'),
      '2b2639279cd6d049972df63f65ea405bde10dd4f0c569f4135d2a9d0a2478dfd',
    );
    assert.equal(
      createHash('sha256').update(female).digest('hex'),
      'd5bdc0607378ee677114ac8119dd7dd32d8a30f03c8dfccfbb7d24487a3d615a',
    );
  });
});
