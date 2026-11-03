import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ADMIN_QUIZ_SESSION_UNREADABLE_PACK } from '@tishuashua/shared';
import {
  readDeadline,
  readPackSnapshot,
  readProgress,
  readQuizSettings,
  readSessionError,
} from './admin-quiz-sessions.read';

const SECRET = 'session-secret-marker';

describe('admin quiz session read', () => {
  test('合法设置只留下声明过的字段', () => {
    const settings = readQuizSettings({
      count: 20,
      difficulty: 'medium',
      types: ['single', 'judge'],
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
      mode: 'exam',
      hidden: SECRET,
    });
    assert.deepEqual(settings, {
      count: 20,
      difficulty: 'medium',
      types: ['single', 'judge'],
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
      mode: 'exam',
    });
    assert.equal(JSON.stringify(settings).includes(SECRET), false);
  });

  test('缺字段或坏计时整份设置作废，不回落到默认题量', () => {
    assert.equal(readQuizSettings({ hidden: SECRET }), null);
    assert.equal(
      readQuizSettings({
        count: 20,
        difficulty: 'medium',
        types: ['single'],
        timer: { enabled: true, kind: 'paper' },
        mode: 'practice',
      }),
      null,
    );
    assert.equal(readQuizSettings(null), null);
  });

  test('快照没有名称时用固定文案，不带知识点名单', () => {
    const missing = readPackSnapshot({ knowledgePointNames: [SECRET] });
    assert.equal(missing.packName, ADMIN_QUIZ_SESSION_UNREADABLE_PACK);
    assert.equal(missing.domainName, null);
    assert.equal(JSON.stringify(missing).includes(SECRET), false);

    const named = readPackSnapshot({
      name: ' 甲的包 ',
      domainName: '领域',
      certName: '证书',
    });
    assert.deepEqual(named, { packName: '甲的包', domainName: '领域', certName: '证书' });
  });

  test('进度、错误和截止时间', () => {
    assert.deepEqual(readProgress('2', 10), { generated: 2, total: 10 });
    assert.deepEqual(readSessionError(' LLM_UNAVAILABLE ', ''), {
      code: 'LLM_UNAVAILABLE',
      message: '出题失败',
    });
    assert.equal(readSessionError(null, SECRET), null);

    const started = '2026-11-03T00:00:00.000Z';
    const settings = readQuizSettings({
      count: 10,
      difficulty: 'easy',
      types: ['single'],
      timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
      mode: 'exam',
    });
    assert.equal(readDeadline(started, settings), '2026-11-03T00:30:00.000Z');
    assert.equal(readDeadline(started, settings ? { ...settings, mode: 'practice' } : null), null);
  });
});
