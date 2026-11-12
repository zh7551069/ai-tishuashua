import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  DATA_RETENTION_PURGE_CRON,
  DATA_RETENTION_PURGE_JOB,
  defaultAdminRoleMatrix,
  defaultDataRetention,
  isRetentionExpired,
  parseAdminRoleMatrixWrite,
  parseDataRetentionWrite,
  parseSystemAuditQuery,
  retentionCutoff,
  selectExpiredRows,
  summarizeRetentionPreview,
  SYSTEM_AUDIT_DEFAULT_PAGE_SIZE,
} from '@tishuashua/shared';
import { countRetentionTargets } from '@tishuashua/shared/admin-system';

const repoRoot = join(__dirname, '../../../..');

describe('TB-13 角色矩阵与保留选择器', () => {
  test('默认矩阵可改运营 Prompt，未知键和非法枚举被拒绝', () => {
    const matrix = defaultAdminRoleMatrix();
    assert.equal(matrix.capabilities['prompt.write'].ops, 'read');
    assert.equal(matrix.capabilities['user.ban'].ops, 'none');
    matrix.capabilities['prompt.write'].ops = 'none';
    const saved = parseAdminRoleMatrixWrite(matrix);
    assert.equal(saved.ok, true);
    if (saved.ok) {
      assert.equal(saved.value.capabilities['prompt.write'].ops, 'none');
    }
    const unknown = parseAdminRoleMatrixWrite({
      ...matrix,
      capabilities: { ...matrix.capabilities, 'prompt.extra': matrix.capabilities['prompt.write'] },
    });
    assert.equal(unknown.ok, false);
    const badLevel = parseAdminRoleMatrixWrite({
      ...defaultAdminRoleMatrix(),
      capabilities: {
        ...defaultAdminRoleMatrix().capabilities,
        'prompt.write': { research: 'write', ops: 'admin', superadmin: 'write' },
      },
    });
    assert.equal(badLevel.ok, false);
  });

  test('保留天数 1…3650，拒绝 0、未知键和练习记录/错题清理键', () => {
    assert.deepEqual(defaultDataRetention(), {
      quizGenerationLogsDays: 90,
      userUploadAndExtractDays: 90,
    });
    assert.equal(parseDataRetentionWrite({ quizGenerationLogsDays: 1, userUploadAndExtractDays: 3650 }).ok, true);
    assert.equal(parseDataRetentionWrite({ quizGenerationLogsDays: 0, userUploadAndExtractDays: 90 }).ok, false);
    assert.equal(parseDataRetentionWrite({ quizGenerationLogsDays: 3651, userUploadAndExtractDays: 90 }).ok, false);
    assert.equal(parseDataRetentionWrite({ quizGenerationLogsDays: 90.5, userUploadAndExtractDays: 90 }).ok, false);
    const unknown = parseDataRetentionWrite({
      quizGenerationLogsDays: 90,
      userUploadAndExtractDays: 90,
      extra: 1,
    });
    assert.equal(unknown.ok, false);
    const practice = parseDataRetentionWrite({
      quizGenerationLogsDays: 90,
      userUploadAndExtractDays: 90,
      practiceRecordsDays: 30,
    });
    assert.equal(practice.ok, false);
    if (!practice.ok) {
      assert.match(practice.message, /练习记录或错题/);
    }
    const wrong = parseDataRetentionWrite({
      quizGenerationLogsDays: 90,
      wrongItemsDays: 30,
    });
    assert.equal(wrong.ok, false);
  });

  test('到期边界不含等于截止瞬时的行，空库 preview count=0', () => {
    const now = new Date('2026-11-12T00:00:00.000Z');
    const cutoff = retentionCutoff(now, 90);
    assert.equal(isRetentionExpired(cutoff, cutoff), false);
    assert.equal(isRetentionExpired(new Date(cutoff.getTime() - 1), cutoff), true);
    const rows = [
      { id: 'keep', createdAt: cutoff.toISOString() },
      { id: 'drop', createdAt: new Date(cutoff.getTime() - 1).toISOString() },
    ];
    assert.deepEqual(
      selectExpiredRows(rows, now, 90).map((row) => row.id),
      ['drop'],
    );
    const empty = summarizeRetentionPreview({
      logs: [],
      uploads: [],
      jobs: [],
      now,
      retention: defaultDataRetention(),
    });
    assert.equal(empty.quizGenerationLogs.count, 0);
    assert.equal(empty.quizGenerationLogs.oldestAt, null);
    assert.equal(empty.userUploads.count, 0);
    assert.equal(empty.extractJobs.count, 0);
  });

  test('空库 SQL 选择器 count=0 且不发删除', async () => {
    const sql: string[] = [];
    const preview = await countRetentionTargets(
      {
        async query(statement) {
          sql.push(statement);
          return { rows: [{ count: 0, oldest_at: null, newest_at: null }] };
        },
      },
      defaultDataRetention(),
      new Date('2026-11-12T00:00:00.000Z'),
    );
    assert.equal(preview.quizGenerationLogs.count, 0);
    assert.equal(preview.userUploads.count, 0);
    assert.equal(preview.extractJobs.count, 0);
    assert.equal(sql.some((statement) => /DELETE/i.test(statement)), false);
    assert.equal(sql.filter((statement) => /created_at </.test(statement)).length, 3);
  });

  test('全站审计默认 20、上限 100，前缀默认空', () => {
    const parsed = parseSystemAuditQuery({});
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.equal(parsed.value.page, 1);
      assert.equal(parsed.value.pageSize, SYSTEM_AUDIT_DEFAULT_PAGE_SIZE);
      assert.equal(parsed.value.actionPrefix, null);
    }
    assert.equal(parseSystemAuditQuery({ pageSize: '100' }).ok, true);
    assert.equal(parseSystemAuditQuery({ pageSize: '101' }).ok, false);
    assert.equal(parseSystemAuditQuery({ pageSize: '0' }).ok, false);
    const prefix = parseSystemAuditQuery({ actionPrefix: 'commerce.' });
    assert.equal(prefix.ok && prefix.value.actionPrefix, 'commerce.');
  });

  test('迁移 018 与 Worker 共用清理任务，barrel 不导出删除 SQL', () => {
    const migration = readFileSync(
      join(repoRoot, 'apps/api/migrations/018_admin_followup_tb13_system.sql'),
      'utf8',
    );
    assert.match(migration, /adminRoleMatrix/);
    assert.match(migration, /quizGenerationLogsDays/);
    assert.equal(/DELETE\s+FROM\s+quiz_sessions/i.test(migration), false);
    const worker = readFileSync(join(repoRoot, 'apps/worker/src/retention-jobs.ts'), 'utf8');
    const selector = readFileSync(join(repoRoot, 'packages/shared/src/admin-system.ts'), 'utf8');
    assert.match(worker, /system\.retention\.purge/);
    assert.match(worker, /DATA_RETENTION_PURGE_CRON/);
    assert.match(selector, /0 3 \* \* \*/);
    assert.equal(DATA_RETENTION_PURGE_CRON, '0 3 * * *');
    assert.equal(DATA_RETENTION_PURGE_JOB, 'system.retention.purge');
    const barrel = readFileSync(join(repoRoot, 'packages/shared/src/index.ts'), 'utf8');
    assert.equal(barrel.includes('admin-system-db'), false);
    assert.equal(/DELETE FROM quiz_generation_logs/.test(barrel), false);
    assert.equal(/export \{[^}]+\} from '\.\/admin-system'/.test(barrel), false);
  });
});
