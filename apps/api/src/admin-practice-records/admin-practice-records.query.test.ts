import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { keepOutcomeIfLogWriteFails } from '@tishuashua/shared/generation';
import {
  practiceDetailVisible,
  practiceRecordStatusSql,
  parsePracticeRecordQuery,
} from './admin-practice-records.query';
import { practiceRecordsToCsv } from './admin-practice-records.service';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('practice record query', () => {
  test('默认排除 wrongSet，分页 20', () => {
    const parsed = parsePracticeRecordQuery({}, 'list');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.includeWrongSet, false);
    assert.equal(parsed.query.page, 1);
    assert.equal(parsed.query.pageSize, 20);
    assert.equal(parsed.query.mode, 'all');
    assert.equal(practiceRecordStatusSql(false).includes("source <> 'wrongSet'"), true);
    assert.equal(practiceRecordStatusSql(true).includes('wrongSet'), false);
    assert.equal(practiceDetailVisible('wrongSet', false), false);
    assert.equal(practiceDetailVisible('wrongSet', true), true);
    assert.equal(practiceDetailVisible('normal', false), true);
  });

  test('includeWrongSet=true 才把 wrongSet 放进筛选', () => {
    const parsed = parsePracticeRecordQuery({ includeWrongSet: 'true', userId: USER_ID }, 'list');
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.includeWrongSet, true);
    assert.equal(parsed.query.userId, USER_ID);
  });

  test('pageSize 100 可以通过，101 拒绝', () => {
    const ok = parsePracticeRecordQuery({ pageSize: '100' }, 'list');
    const rejected = parsePracticeRecordQuery({ pageSize: '101' }, 'list');
    assert.equal(ok.ok && ok.query.pageSize, 100);
    assert.equal(rejected.ok, false);
  });

  test('导出必须带时间窗，32 个自然日拒绝，31 日可以通过', () => {
    const missing = parsePracticeRecordQuery({ from: '2026-11-01' }, 'export');
    assert.equal(missing.ok, false);
    const wide = parsePracticeRecordQuery({ from: '2026-11-01', to: '2026-12-02' }, 'export');
    assert.equal(wide.ok, false);
    if (!wide.ok) {
      assert.match(wide.message, /31/);
    }
    const fit = parsePracticeRecordQuery({ from: '2026-11-01', to: '2026-12-01' }, 'export');
    assert.equal(fit.ok, true);
  });

  test('CSV 含必填列，不含 Prompt 正文和未脱敏手机', () => {
    const csv = practiceRecordsToCsv([
      {
        id: 's1',
        userId: USER_ID,
        userNick: '张*三',
        mode: 'exam',
        source: 'normal',
        score: 86,
        totalScore: 100,
        passed: true,
        scoreReadable: true,
        durationSeconds: 1234,
        packId: 'p1',
        packName: '包',
        certId: 'c1',
        certName: '证书',
        domainName: '领域',
        startedAt: '2026-11-01T00:00:00.000Z',
        submittedAt: '2026-11-01T01:00:00.000Z',
      },
    ]);
    assert.match(csv, /会话 id/);
    assert.match(csv, /脱敏昵称/);
    assert.match(csv, /张\*三/);
    assert.equal(csv.includes('13812348000'), false);
    assert.equal(csv.includes('PROMPT_BODY'), false);
    assert.equal(csv.includes('openId'), false);
  });

  test('迁移 016 只建表，不回填历史场次', () => {
    const sql = readFileSync(
      join(__dirname, '../../migrations/016_admin_followup_tb12_logs.sql'),
      'utf8',
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS quiz_generation_logs/);
    assert.match(sql, /quiz_generation_logs_created_idx/);
    assert.match(sql, /ON DELETE SET NULL/);
    assert.equal(/INSERT\s+INTO\s+quiz_generation_logs/i.test(sql), false);
  });
});

describe('generation log write does not rewrite the outcome', () => {
  test('INSERT 抛错时原结果原样返回', async () => {
    const outcome = { status: 'ready' as const, stats: { wrongCarried: 0, bankDrawn: 0, aiGenerated: 1 } };
    const errors: unknown[] = [];
    const returned = await keepOutcomeIfLogWriteFails(
      outcome,
      async () => {
        throw new Error('insert failed');
      },
      (error) => errors.push(error),
    );
    assert.equal(returned, outcome);
    assert.equal(returned.status, 'ready');
    assert.equal(errors.length, 1);
  });

  test('失败出口的错误码也不会被日志错误改掉', async () => {
    const outcome = { status: 'failed' as const, code: 'QUIZ_GENERATION_FAILED', message: '没有可用的知识点，无法出题' };
    const returned = await keepOutcomeIfLogWriteFails(outcome, async () => {
      throw new Error('relation quiz_generation_logs does not exist');
    }, () => undefined);
    assert.deepEqual(returned, outcome);
  });

  test('取消和跳过不写日志', async () => {
    let called = false;
    const cancelled = await keepOutcomeIfLogWriteFails({ status: 'cancelled' }, async () => {
      called = true;
    });
    const skipped = await keepOutcomeIfLogWriteFails({ status: 'skipped' }, async () => {
      called = true;
    });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(skipped.status, 'skipped');
    assert.equal(called, false);
  });
});
