import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  EXPORT_TOO_MANY_ROWS_MESSAGE,
  generationStatsSince,
  summarizeQuizGenerationAttempts,
} from '@tishuashua/shared';
import {
  QUIZ_GENERATION_STATS_SELECT,
  parseQuizGenerationLogQuery,
  parseQuizGenerationStatsQuery,
} from './admin-quiz-generation-logs.query';
import { quizGenerationLogsToCsv } from './admin-quiz-generation-logs.service';

describe('quiz generation log query', () => {
  test('分页默认 20，上限 100', () => {
    const defaults = parseQuizGenerationLogQuery({}, 'list');
    assert.equal(defaults.ok, true);
    if (!defaults.ok) {
      return;
    }
    assert.equal(defaults.query.pageSize, 20);
    assert.equal(defaults.query.success, 'all');
    assert.equal(defaults.query.usedBuiltin, 'all');
    const page = parseQuizGenerationLogQuery({ pageSize: '100' }, 'list');
    assert.equal(page.ok && page.query.pageSize, 100);
    assert.equal(parseQuizGenerationLogQuery({ pageSize: '101' }, 'list').ok, false);
  });

  test('导出无 from/to 或跨度 32 日都拒绝', () => {
    assert.equal(parseQuizGenerationLogQuery({}, 'export').ok, false);
    const wide = parseQuizGenerationLogQuery({ from: '2026-11-01', to: '2026-12-02' }, 'export');
    assert.equal(wide.ok, false);
    const fit = parseQuizGenerationLogQuery({ from: '2026-11-01', to: '2026-12-01' }, 'export');
    assert.equal(fit.ok, true);
  });

  test('days 默认 7，只允许 1 到 31', () => {
    const now = new Date('2026-11-11T08:00:00.000Z');
    const parsed = parseQuizGenerationStatsQuery({}, now);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.stats.days, 7);
    assert.equal(parsed.stats.since, '2026-11-04T16:00:00.000Z');
    assert.equal(generationStatsSince(now, 7).toISOString(), '2026-11-04T16:00:00.000Z');
    assert.equal(parseQuizGenerationStatsQuery({ days: '0' }).ok, false);
    assert.equal(parseQuizGenerationStatsQuery({ days: '32' }).ok, false);
    assert.equal(parseQuizGenerationStatsQuery({ days: '1' }, now).ok, true);
    assert.equal(parseQuizGenerationStatsQuery({ days: '31' }, now).ok, true);
  });

  test('纯回落内置且出题成功不计入失败分子', () => {
    const since = new Date('2026-11-04T16:00:00.000Z');
    const summary = summarizeQuizGenerationAttempts(
      [
        { success: true, usedBuiltin: true },
        { success: true, usedBuiltin: false },
        { success: false, usedBuiltin: true },
        { success: false, usedBuiltin: false },
      ],
      7,
      since,
    );
    assert.equal(summary.attemptCount, 4);
    assert.equal(summary.failureCount, 2);
    assert.equal(summary.builtinFallbackCount, 2);
    assert.equal(summary.failureRate, 0.5);
    const onlyFallback = summarizeQuizGenerationAttempts(
      [{ success: true, usedBuiltin: true }],
      7,
      since,
    );
    assert.equal(onlyFallback.failureCount, 0);
    assert.equal(onlyFallback.failureRate, 0);
    assert.equal(onlyFallback.builtinFallbackCount, 1);
    const empty = summarizeQuizGenerationAttempts([], 7, since);
    assert.equal(empty.attemptCount, 0);
    assert.equal(empty.failureRate, null);
    assert.match(QUIZ_GENERATION_STATS_SELECT, /success = false/);
    assert.match(QUIZ_GENERATION_STATS_SELECT, /used_builtin/);
    assert.equal(/used_builtin[\s\S]*success\s*=\s*false/.test(QUIZ_GENERATION_STATS_SELECT), false);
  });

  test('CSV 不含 Prompt 正文', () => {
    const csv = quizGenerationLogsToCsv([
      {
        id: 'log-1',
        sessionId: 'sess-1',
        userId: 'user-1',
        userNick: '李*四',
        certId: null,
        certName: '证书',
        templateId: null,
        templateVersion: null,
        templateCode: 'builtin',
        usedBuiltin: true,
        success: true,
        errorCode: null,
        errorMessage: null,
        durationMs: 80,
        createdAt: '2026-11-11T00:00:00.000Z',
      },
    ]);
    assert.match(csv, /usedBuiltin/);
    assert.match(csv, /builtin/);
    assert.match(csv, /李\*四/);
    assert.equal(csv.includes('system prompt'), false);
    assert.equal(csv.includes(EXPORT_TOO_MANY_ROWS_MESSAGE), false);
  });
});
