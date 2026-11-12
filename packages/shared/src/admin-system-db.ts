/**
 * TB-13 角色矩阵、保留周期与全站审计的数据库访问。
 * 只从 `@tishuashua/shared/admin-system` 引入，不进 browser barrel。
 */
import {
  ADMIN_ROLE_MATRIX_KEY,
  DATA_RETENTION_KEY,
  DATA_RETENTION_NOTICE,
  auditLikeContains,
  auditLikePrefix,
  defaultAdminRoleMatrix,
  defaultDataRetention,
  parseAdminRoleMatrixWrite,
  retentionCutoff,
  type AdminRoleMatrix,
  type DataRetention,
  type RetentionPreview,
  type SystemAuditQuery,
} from './admin-system';
import type { SettingsDb } from './system-settings';

export interface AdminSystemAuditItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export interface AdminSystemAuditPage {
  items: AdminSystemAuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminRoleMatrixRecord extends AdminRoleMatrix {
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface DataRetentionRecord extends DataRetention {
  updatedAt: string | null;
  updatedBy: string | null;
  notice: typeof DATA_RETENTION_NOTICE;
}

export interface AdminAuditWrite {
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

interface SettingRow {
  value: unknown;
  updated_at: Date | string | null;
  updated_by: string | null;
}

export async function readAdminRoleMatrix(db: SettingsDb): Promise<AdminRoleMatrixRecord> {
  const row = await readSetting(db, ADMIN_ROLE_MATRIX_KEY);
  if (!row) {
    return { ...defaultAdminRoleMatrix(), updatedAt: null, updatedBy: null };
  }
  const parsed = parseAdminRoleMatrixWrite(row.value);
  const matrix = parsed.ok ? parsed.value : defaultAdminRoleMatrix();
  return {
    ...matrix,
    updatedAt: toIso(row.updated_at),
    updatedBy: textOrNull(row.updated_by),
  };
}

export async function writeAdminRoleMatrix(
  db: SettingsDb,
  matrix: AdminRoleMatrix,
  actor: string,
): Promise<AdminRoleMatrixRecord> {
  const before = await readAdminRoleMatrix(db);
  return transaction(db, async () => {
    const saved = await upsertSetting(db, ADMIN_ROLE_MATRIX_KEY, matrix, actor);
    await insertAdminAudit(db, {
      actor,
      action: 'system.roles.update',
      target: 'setting:adminRoleMatrix',
      before: { roles: before.roles, capabilities: before.capabilities },
      after: matrix,
    });
    const parsed = parseAdminRoleMatrixWrite(saved.value);
    return {
      ...(parsed.ok ? parsed.value : matrix),
      updatedAt: toIso(saved.updated_at),
      updatedBy: textOrNull(saved.updated_by) ?? actor,
    };
  });
}

export async function readDataRetention(db: SettingsDb): Promise<DataRetentionRecord> {
  const row = await readSetting(db, DATA_RETENTION_KEY);
  const fallback = defaultDataRetention();
  if (!row) {
    return { ...fallback, updatedAt: null, updatedBy: null, notice: DATA_RETENTION_NOTICE };
  }
  const days = readStoredDays(row.value) ?? fallback;
  return {
    ...days,
    updatedAt: toIso(row.updated_at),
    updatedBy: textOrNull(row.updated_by),
    notice: DATA_RETENTION_NOTICE,
  };
}

export async function writeDataRetention(
  db: SettingsDb,
  retention: DataRetention,
  actor: string,
): Promise<DataRetentionRecord> {
  const before = await readDataRetention(db);
  return transaction(db, async () => {
    const saved = await upsertSetting(db, DATA_RETENTION_KEY, retention, actor);
    await insertAdminAudit(db, {
      actor,
      action: 'system.retention.update',
      target: 'setting:dataRetention',
      before: {
        quizGenerationLogsDays: before.quizGenerationLogsDays,
        userUploadAndExtractDays: before.userUploadAndExtractDays,
      },
      after: retention,
    });
    return {
      ...(readStoredDays(saved.value) ?? retention),
      updatedAt: toIso(saved.updated_at),
      updatedBy: textOrNull(saved.updated_by) ?? actor,
      notice: DATA_RETENTION_NOTICE,
    };
  });
}

/** preview 与 purge 共用。只按 retentionCutoff 统计，不删除。 */
export async function countRetentionTargets(
  db: SettingsDb,
  retention: DataRetention,
  now: Date,
): Promise<RetentionPreview> {
  const logCutoff = retentionCutoff(now, retention.quizGenerationLogsDays).toISOString();
  const uploadCutoff = retentionCutoff(now, retention.userUploadAndExtractDays).toISOString();
  const logs = await db.query(
    `
      SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest_at, MAX(created_at) AS newest_at
      FROM quiz_generation_logs
      WHERE created_at < $1::timestamptz
    `,
    [logCutoff],
  );
  const uploads = await db.query(
    `
      SELECT COUNT(*)::int AS count, MIN(created_at) AS oldest_at, MAX(created_at) AS newest_at
      FROM user_uploads
      WHERE created_at < $1::timestamptz
    `,
    [uploadCutoff],
  );
  const jobs = await db.query(
    `
      SELECT COUNT(*)::int AS count
      FROM extract_jobs AS job
      JOIN user_uploads AS upload ON upload.id = job.upload_id
      WHERE upload.created_at < $1::timestamptz
    `,
    [uploadCutoff],
  );
  return {
    quizGenerationLogs: mapWindow(logs.rows[0]),
    userUploads: mapWindow(uploads.rows[0]),
    extractJobs: { count: readCount(jobs.rows[0]) },
  };
}

/**
 * 先写 system.retention.purge，再删到期出题日志与用户上传。
 * extract_jobs 随 user_uploads 外键级联删除。不碰练习记录、错题、证书成绩和题库。
 * count 为 0 也成功。
 */
export async function runDataRetentionPurge(
  db: SettingsDb,
  now = new Date(),
): Promise<RetentionPreview> {
  return transaction(db, async () => {
    const retention = await readDataRetention(db);
    const preview = await countRetentionTargets(db, retention, now);
    const logCutoff = retentionCutoff(now, retention.quizGenerationLogsDays).toISOString();
    const uploadCutoff = retentionCutoff(now, retention.userUploadAndExtractDays).toISOString();
    await insertAdminAudit(db, {
      actor: 'worker',
      action: 'system.retention.purge',
      target: 'setting:dataRetention',
      before: {
        quizGenerationLogsDays: retention.quizGenerationLogsDays,
        userUploadAndExtractDays: retention.userUploadAndExtractDays,
      },
      after: {
        ...preview,
        quizGenerationLogsCutoff: logCutoff,
        userUploadsCutoff: uploadCutoff,
      },
    });
    await db.query(`DELETE FROM quiz_generation_logs WHERE created_at < $1::timestamptz`, [
      logCutoff,
    ]);
    await db.query(`DELETE FROM user_uploads WHERE created_at < $1::timestamptz`, [uploadCutoff]);
    return preview;
  });
}

export async function listAdminSystemAudit(
  db: SettingsDb,
  query: SystemAuditQuery,
): Promise<AdminSystemAuditPage> {
  const params = [
    query.actionPrefix ? auditLikePrefix(query.actionPrefix) : null,
    query.actor,
    query.q ? auditLikeContains(query.q) : null,
    query.from,
    query.to,
  ];
  const where = `
    WHERE ($1::text IS NULL OR action LIKE $1 ESCAPE '\\')
      AND ($2::text IS NULL OR actor = $2)
      AND (
        $3::text IS NULL
        OR actor ILIKE $3 ESCAPE '\\'
        OR target ILIKE $3 ESCAPE '\\'
      )
      AND ($4::timestamptz IS NULL OR created_at >= $4::timestamptz)
      AND ($5::timestamptz IS NULL OR created_at <= $5::timestamptz)
  `;
  const total = await db.query(`SELECT COUNT(*)::int AS count FROM admin_audit_logs ${where}`, params);
  const rows = await db.query(
    `
      SELECT id, actor, action, target, before, after, created_at
      FROM admin_audit_logs
      ${where}
      ORDER BY created_at DESC, id DESC
      LIMIT $6 OFFSET $7
    `,
    [...params, query.pageSize, (query.page - 1) * query.pageSize],
  );
  return {
    items: rows.rows.map(mapAudit),
    total: readCount(total.rows[0]),
    page: query.page,
    pageSize: query.pageSize,
  };
}

export async function insertAdminAudit(db: SettingsDb, input: AdminAuditWrite): Promise<void> {
  await db.query(
    `
      INSERT INTO admin_audit_logs (actor, action, target, before, after)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
    `,
    [
      input.actor,
      input.action,
      input.target,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
    ],
  );
}

async function readSetting(db: SettingsDb, key: string): Promise<SettingRow | null> {
  const result = await db.query(
    `
      SELECT value, updated_at, updated_by
      FROM system_settings
      WHERE key = $1
    `,
    [key],
  );
  return (result.rows[0] as SettingRow | undefined) ?? null;
}

async function upsertSetting(
  db: SettingsDb,
  key: string,
  value: unknown,
  actor: string,
): Promise<SettingRow> {
  const result = await db.query(
    `
      INSERT INTO system_settings (key, value, updated_at, updated_by)
      VALUES ($1, $2::jsonb, now(), $3)
      ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = now(),
          updated_by = EXCLUDED.updated_by
      RETURNING value, updated_at, updated_by
    `,
    [key, JSON.stringify(value), actor],
  );
  const row = result.rows[0] as SettingRow | undefined;
  if (!row) {
    throw new Error('系统设置没有写上');
  }
  return row;
}

async function transaction<T>(db: SettingsDb, fn: () => Promise<T>): Promise<T> {
  await db.query('BEGIN');
  try {
    const result = await fn();
    await db.query('COMMIT');
    return result;
  } catch (error) {
    await db.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}

function readStoredDays(value: unknown): DataRetention | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const quizGenerationLogsDays = record.quizGenerationLogsDays;
  const userUploadAndExtractDays = record.userUploadAndExtractDays;
  if (
    typeof quizGenerationLogsDays !== 'number' ||
    !Number.isInteger(quizGenerationLogsDays) ||
    typeof userUploadAndExtractDays !== 'number' ||
    !Number.isInteger(userUploadAndExtractDays)
  ) {
    return null;
  }
  return { quizGenerationLogsDays, userUploadAndExtractDays };
}

function mapWindow(row: unknown): RetentionPreview['quizGenerationLogs'] {
  const record = (row ?? {}) as { count?: unknown; oldest_at?: unknown; newest_at?: unknown };
  return {
    count: readCount(record),
    oldestAt: toIso(record.oldest_at as Date | string | null | undefined),
    newestAt: toIso(record.newest_at as Date | string | null | undefined),
  };
}

function mapAudit(row: unknown): AdminSystemAuditItem {
  const record = row as Record<string, unknown>;
  return {
    id: String(record.id ?? ''),
    actor: String(record.actor ?? ''),
    action: String(record.action ?? ''),
    target: String(record.target ?? ''),
    before: record.before ?? null,
    after: record.after ?? null,
    createdAt: toIso(record.created_at as Date | string | null | undefined) ?? '',
  };
}

function readCount(row: unknown): number {
  const count = (row as { count?: unknown } | undefined)?.count;
  const parsed = typeof count === 'number' ? count : Number(count ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function textOrNull(value: string | null | undefined): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}
