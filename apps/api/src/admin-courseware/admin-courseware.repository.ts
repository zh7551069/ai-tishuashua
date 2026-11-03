import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_COURSEWARE_UNREADABLE_FILE,
  COURSEWARE_EXTENSIONS,
  EXTRACT_JOB_STATUSES,
  EXTRACT_STAGES,
  type AdminCoursewareDetail,
  type AdminCoursewareError,
  type AdminCoursewareSummary,
  type CoursewareExtension,
  type ExtractedDraft,
  type ExtractJobStatus,
  type ExtractStage,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminCoursewareQuery } from './admin-courseware.query';

interface CoursewareRow {
  id: string;
  job_id: string | null;
  user_id: string;
  user_nick: string | null;
  certificate_id: string | null;
  cert_name: string | null;
  domain_id: string | null;
  domain_name: string | null;
  status: string;
  stage: string | null;
  progress: number | string | null;
  estimated_minutes: number | null;
  file_meta: unknown;
  draft_count: number | string | null;
  error_code: string | null;
  error_message: string | null;
  accepted_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  drafts?: unknown;
  extracted_kp_ids?: string[] | null;
  accepted_draft_ids?: string[] | null;
}

const FILTER_SQL = `
  ($1::uuid IS NULL OR u.user_id = $1::uuid)
  AND ($2::uuid IS NULL OR u.certificate_id = $2::uuid)
  AND ($3::text = 'all' OR COALESCE(j.status, u.status) = $3)
`;

const FROM_SQL = `
  FROM user_uploads u
  JOIN users usr ON usr.id = u.user_id
  LEFT JOIN extract_jobs j ON j.upload_id = u.id
  LEFT JOIN certificates c ON c.id = u.certificate_id
  LEFT JOIN domains d ON d.id = c.domain_id
`;

const SUMMARY_SQL = `
  u.id,
  j.id AS job_id,
  u.user_id,
  usr.nick AS user_nick,
  u.certificate_id,
  c.name AS cert_name,
  d.id AS domain_id,
  d.name AS domain_name,
  COALESCE(j.status, u.status) AS status,
  j.stage,
  j.progress,
  j.estimated_minutes,
  u.file_meta,
  CASE
    WHEN j.drafts IS NULL OR jsonb_typeof(j.drafts) <> 'array' THEN 0
    ELSE jsonb_array_length(j.drafts)
  END AS draft_count,
  CASE
    WHEN j.error_code IS NOT NULL AND j.error_message IS NOT NULL THEN j.error_code
    ELSE u.error_code
  END AS error_code,
  CASE
    WHEN j.error_code IS NOT NULL AND j.error_message IS NOT NULL THEN j.error_message
    ELSE u.error_message
  END AS error_message,
  j.accepted_at,
  u.created_at,
  COALESCE(j.updated_at, u.updated_at) AS updated_at
`;

@Injectable()
export class AdminCoursewareRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminCoursewareQuery,
  ): Promise<{ items: AdminCoursewareSummary[]; total: number }> {
    const filters = [query.userId, query.certId, query.status];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<CoursewareRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${FILTER_SQL}
          ORDER BY COALESCE(j.updated_at, u.updated_at) DESC, u.id
          LIMIT $4 OFFSET $5
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-courseware', error);
    }
  }

  async find(uploadId: string): Promise<AdminCoursewareDetail | null> {
    try {
      const result = await this.database.requirePool().query<CoursewareRow>(
        `
          SELECT
            ${SUMMARY_SQL},
            j.drafts,
            j.extracted_kp_ids,
            j.accepted_draft_ids
          ${FROM_SQL}
          WHERE u.id = $1
        `,
        [uploadId],
      );
      const row = result.rows[0];
      return row ? toDetail(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-courseware', error);
    }
  }
}

function toSummary(row: CoursewareRow): AdminCoursewareSummary {
  const file = readFile(row.file_meta);
  const error = readError(row.error_code, row.error_message);
  const hasJob = Boolean(row.job_id);
  return {
    id: row.id,
    jobId: row.job_id,
    userId: row.user_id,
    userNick: row.user_nick?.trim() ? row.user_nick.trim() : null,
    certId: row.certificate_id,
    certName: row.cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    status: asStatus(row.status),
    stage: hasJob ? asStage(row.stage) : null,
    progress: hasJob ? Number(row.progress) || 0 : 0,
    estimatedMinutes: hasJob ? (row.estimated_minutes ?? 1) : null,
    fileName: file.fileName,
    extension: file.extension,
    byteSize: file.byteSize,
    committed: Boolean(row.accepted_at),
    draftCount: Number(row.draft_count) || 0,
    errorCode: error?.code ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toDetail(row: CoursewareRow): AdminCoursewareDetail {
  return {
    ...toSummary(row),
    drafts: asDrafts(row.drafts),
    extractedKpIds: readIds(row.extracted_kp_ids),
    acceptedDraftIds: readIds(row.accepted_draft_ids),
    error: readError(row.error_code, row.error_message),
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function readError(code: string | null, message: string | null): AdminCoursewareError | null {
  if (!code || !message) {
    return null;
  }
  return { code, message };
}

/**
 * 与用户端进度同一套文件元数据读法，但读不出来时仍保留这一行。
 * 对象键只存在库里，响应里不带。
 */
function readFile(value: unknown): {
  fileName: string;
  extension: CoursewareExtension | null;
  byteSize: number;
} {
  const empty = {
    fileName: ADMIN_COURSEWARE_UNREADABLE_FILE,
    extension: null as CoursewareExtension | null,
    byteSize: 0,
  };
  const record = typeof value === 'string' ? parseJson(value) : value;
  if (!record || typeof record !== 'object') {
    return empty;
  }
  const meta = record as { fileName?: unknown; extension?: unknown; byteSize?: unknown };
  if (typeof meta.fileName !== 'string' || !meta.fileName.trim()) {
    return empty;
  }
  if (!isExtension(meta.extension)) {
    return empty;
  }
  return {
    fileName: meta.fileName,
    extension: meta.extension,
    byteSize: Number(meta.byteSize) || 0,
  };
}

function asDrafts(value: unknown): ExtractedDraft[] {
  const source = typeof value === 'string' ? parseJson(value) : value;
  if (!Array.isArray(source)) {
    return [];
  }
  const drafts: ExtractedDraft[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Partial<ExtractedDraft>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') {
      continue;
    }
    drafts.push({
      id: row.id,
      name: row.name,
      promptHint: typeof row.promptHint === 'string' ? row.promptHint : row.name,
      excerpt: typeof row.excerpt === 'string' ? row.excerpt : row.name,
    });
  }
  return drafts;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function asStatus(value: string): ExtractJobStatus {
  return (EXTRACT_JOB_STATUSES as readonly string[]).includes(value)
    ? (value as ExtractJobStatus)
    : 'failed';
}

function asStage(value: string | null): ExtractStage {
  return value && (EXTRACT_STAGES as readonly string[]).includes(value)
    ? (value as ExtractStage)
    : 'uploading';
}

function isExtension(value: unknown): value is CoursewareExtension {
  return typeof value === 'string' && (COURSEWARE_EXTENSIONS as readonly string[]).includes(value);
}
