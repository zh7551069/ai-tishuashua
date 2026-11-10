import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { packStartAction } from './pack-entry';
import { heroSourceFile, normalizeHeroGender, FEMALE_HERO_FILE, MALE_HERO_FILE } from './hero';
import { normalizeThemeId, paletteById, THEME_IDS, themeClassName, themeCssVars } from './palettes';

const root = join(__dirname, '..');

describe('黄绿主题与主图', () => {
  test('旧主题和非法值回落黄绿', () => {
    for (const legacy of ['blue', 'teal', 'violet', 'orange', 'rose', '', 'pink', null, 1]) {
      assert.equal(normalizeThemeId(legacy), 'yellow-green');
    }
    assert.deepEqual(THEME_IDS, ['yellow-green', 'forest', 'tea', 'warm-sprout']);
    assert.equal(paletteById('forest').accent, '#3F5C25');
    assert.equal(paletteById('tea').accent, '#7A8B54');
    assert.equal(paletteById('warm-sprout').accent, '#C6A63A');
    assert.equal(paletteById('yellow-green').accent, '#8ECA3A');
  });

  test('apply-theme 把强调色打进根节点变量，画布不随主题改', () => {
    const forest = themeCssVars('forest');
    const lime = themeCssVars('yellow-green');
    assert.equal(themeClassName('forest'), 'ts-theme ts-theme-forest');
    assert.equal(forest['--ts-accent'], '#3F5C25');
    assert.equal(forest['--ts-canvas'], lime['--ts-canvas']);
    assert.equal(forest['--ts-ink'], '#1C1917');
    assert.notEqual(forest['--ts-accent'], lime['--ts-accent']);
  });

  test('默认女主图，只有 male 用男图', () => {
    assert.equal(normalizeHeroGender(undefined), 'female');
    assert.equal(normalizeHeroGender(''), 'female');
    assert.equal(normalizeHeroGender('other'), 'female');
    assert.equal(normalizeHeroGender('male'), 'male');
    assert.equal(heroSourceFile('female'), FEMALE_HERO_FILE);
    assert.equal(heroSourceFile('male'), MALE_HERO_FILE);
    assert.match(FEMALE_HERO_FILE, /^87ad184d/);
    assert.match(MALE_HERO_FILE, /^44cac9e1/);
  });

  test('清缓存保留性别键，首页人物图标不写性别', () => {
    const prefs = readFileSync(join(root, 'services/local-prefs.ts'), 'utf8');
    const home = readFileSync(join(root, 'pages/home/index.tsx'), 'utf8');
    assert.match(prefs, /tishuashua\.heroGender/);
    assert.match(prefs, /saveHeroGender\(heroGender\)/);
    assert.equal(home.includes('saveHeroGender'), false);
    assert.match(home, /go\('profile'\)/);
  });
});

describe('刷题包页开始刷题', () => {
  test('默认只带第一个待练知识点', () => {
    const action = packStartAction({
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
          { knowledgePointId: 'kp-next', name: '待练', done: false, completedAt: null },
          { knowledgePointId: 'kp-done', name: '已练', done: true, completedAt: null },
        ],
      },
    });
    assert.equal(action.action, 'quiz');
    if (action.action !== 'quiz') {
      return;
    }
    assert.equal(action.knowledgePointId, 'kp-next');
    assert.match(action.url, /kpIds=kp-next/);
    assert.match(action.url, /intent=dailyPlan/);
    assert.equal(action.url.includes('kpIds=&'), false);
  });

  test('无包去选包，不可用包不能出题，做完仍可再练', () => {
    assert.deepEqual(packStartAction({ empty: true, activePack: null }), { action: 'pick' });
    const blocked = packStartAction({
      empty: false,
      activePack: {
        packId: 'pack-1',
        name: '包',
        domainName: '领域',
        certName: '证书',
        unavailable: true,
        knowledgePointCount: 1,
        completedCount: 0,
        remainingCount: 1,
        percent: 0,
        items: [{ knowledgePointId: 'kp-1', name: '点', done: false, completedAt: null }],
      },
    });
    assert.deepEqual(blocked, { action: 'disabled', reason: 'unavailable' });
    const done = packStartAction({
      empty: false,
      activePack: {
        packId: 'pack-1',
        name: '包',
        domainName: '领域',
        certName: '证书',
        unavailable: false,
        knowledgePointCount: 1,
        completedCount: 1,
        remainingCount: 0,
        percent: 100,
        items: [{ knowledgePointId: 'kp-done', name: '已练', done: true, completedAt: null }],
      },
    });
    assert.equal(done.action, 'quiz');
  });

  test('刷题包页走既有接口，空态去选领域', () => {
    const page = readFileSync(join(root, 'pages/pack/index.tsx'), 'utf8');
    assert.match(page, /packStartAction/);
    assert.match(page, /开始刷题/);
    assert.match(page, /去选包/);
    assert.match(page, /PACK_DOMAIN_ROUTE/);
    assert.match(page, /activatePack/);
    assert.match(page, /updatePack/);
    assert.match(page, /deletePack/);
    assert.match(page, /\/me\/daily-plan/);
    assert.equal(/app\.(post|get|put|delete)\(/i.test(page), false);
  });
});
