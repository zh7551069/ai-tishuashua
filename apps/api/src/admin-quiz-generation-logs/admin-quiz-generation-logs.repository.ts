import { Inject, Injectable } from '@nestjs/common';
import {
  type AdminQuizGenerationLogDetail,
  type AdminQuizGenerationLogSummary,
  type AdminQuizGenerationRequestSummary,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import { maskAdminNick } from '../admin-users/nick-mask';
import type { QuizLogQuery } from './admin-quiz-generation-logs.query';
import {
  QUIZ_GENERATION_STATS_SELECT,
  QUIZ_LOG_DETAIL_MESSAGE_MAX,
  QUIZ_LOG_LIST_MESSAGE_MAX,
} from './admin-quiz-generation-logs.query';

interface LogRow {
  id: string;
  session_id: string | null;
  user_id: string | null;
  user_nick: string | null;
  cert_id: string | null;
  cert_name: string | null;
  template_id: string | null;
  template_version: number | string | null;
  template_code: string | null;
  used_builtin: boolean;
  success: boolean;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | string | null;
  request_summary: unknown;
  created_at: Date | string;
}

const FROM_SQL = `
  FROM quiz_generation_logs g
  LEFT JOIN users usr ON usr.id = g.user_id
`;

const SUMMARY_SQL = `
  g.id,
  g.session_id,
  g.user_id,
  usr.nick AS user_nick,
  g.cert_id,
  g.cert_name,
  g.template_id,
  g.template_version,
  g.template_code,
  g.used_builtin,
  g.success,
  g.error_code,
  g.error_message,
  g.duration_ms,
  g.created_at
`;

@Injectable()
export class AdminQuizGenerationLogRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: QuizLogQuery,
  ): Promise<{ items: AdminQuizGenerationLogSummary[]; total: number }> {
    try {
      const pool = this.database.requirePool();
      const filters = this.filters(query);
      const where = this.where();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${where}`,
        filters,
      );
      const result = await pool.query<LogRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${where}
          ORDER BY g.created_at DESC, g.id DESC
          LIMIT $7 OFFSET $8
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row, QUIZ_LOG_LIST_MESSAGE_MAX)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-quiz-generation-logs', error);
    }
  }

  async count(query: QuizLogQuery): Promise<number> {
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${this.where()}`,
        this.filters(query),
      );
      return Number(count.rows[0]?.total ?? 0);
    } catch (error) {
      rethrowDatabaseError('admin-quiz-generation-logs', error);
    }
  }

  async exportRows(query: QuizLogQuery): Promise<AdminQuizGenerationLogSummary[]> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<LogRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${this.where()}
          ORDER BY g.created_at DESC, g.id DESC
        `,
        this.filters(query),
      );
      return result.rows.map((row) => toSummary(row, QUIZ_LOG_DETAIL_MESSAGE_MAX));
    } catch (error) {
      rethrowDatabaseError('admin-quiz-generation-logs', error);
    }
  }

  async find(id: string): Promise<AdminQuizGenerationLogDetail | null> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<LogRow>(
        `
          SELECT ${SUMMARY_SQL}, g.request_summary
          ${FROM_SQL}
          WHERE g.id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        ...toSummary(row, QUIZ_LOG_DETAIL_MESSAGE_MAX),
        requestSummary: readSummary(row.request_summary),
      };
    } catch (error) {
      rethrowDatabaseError('admin-quiz-generation-logs', error);
    }
  }

  async stats(since: Date): Promise<{ attemptCount: number; failureCount: number; builtinFallbackCount: number }> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<{
        attempt_count: number | string;
        failure_count: number | string;
        builtin_fallback_count: number | string;
      }>(QUIZ_GENERATION_STATS_SELECT, [since]);
      const row = result.rows[0];
      return {
        attemptCount: Number(row?.attempt_count ?? 0),
        failureCount: Number(row?.failure_count ?? 0),
        builtinFallbackCount: Number(row?.builtin_fallback_count ?? 0),
      };
    } catch (error) {
      rethrowDatabaseError('admin-quiz-generation-logs', error);
    }
  }

  private where(): string {
    return `
      ($1::uuid IS NULL OR g.user_id = $1::uuid)
      AND ($2::text = 'all' OR g.success = ($2 = 'true'))
      AND ($3::text = 'all' OR g.used_builtin = ($3 = 'true'))
      AND ($4::text IS NULL OR g.error_code = $4)
      AND ($5::timestamptz IS NULL OR g.created_at >= $5)
      AND ($6::timestamptz IS NULL OR g.created_at <= $6)
    `;
  }

  private filters(query: QuizLogQuery): unknown[] {
    return [
      query.userId,
      query.success,
      query.usedBuiltin,
      query.errorCode,
      query.from,
      query.to,
    ];
  }
}

function toSummary(row: LogRow, messageMax: number): AdminQuizGenerationLogSummary {
  const version = row.template_version === null ? null : Number(row.template_version);
  const duration = row.duration_ms === null ? null : Number(row.duration_ms);
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    userNick: maskAdminNick(row.user_nick),
    certId: row.cert_id,
    certName: row.cert_name,
    templateId: row.template_id,
    templateVersion: version !== null && Number.isFinite(version) ? version : null,
    templateCode: row.template_code,
    usedBuiltin: row.used_builtin === true,
    success: row.success === true,
    errorCode: row.error_code,
    errorMessage: clip(row.error_message, messageMax),
    durationMs: duration !== null && Number.isFinite(duration) ? duration : null,
    createdAt: toIso(row.created_at),
  };
}

function readSummary(value: unknown): AdminQuizGenerationRequestSummary {
  const body = asRecord(value);
  const stats = asRecord(body?.generationStats);
  return {
    count: numberOrNull(body?.count),
    types: stringArray(body?.types),
    difficulty: typeof body?.difficulty === 'string' ? body.difficulty : null,
    mode: typeof body?.mode === 'string' ? body.mode : null,
    source: typeof body?.source === 'string' ? body.source : null,
    generationStats: stats
      ? {
          wrongCarried: numberOrNull(stats.wrongCarried) ?? 0,
          bankDrawn: numberOrNull(stats.bankDrawn) ?? 0,
          aiGenerated: numberOrNull(stats.aiGenerated) ?? 0,
        }
      : null,
  };
}

function clip(value: string | null, max: number): string | null {
  if (!value) {
    return null;
  }
  const chars = Array.from(value);
  if (chars.length <= max) {
    return value;
  }
  return chars.slice(0, max).join('');
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asRecord(value: unknown): Record<string, unknown> | null {
  const source = typeof value === 'string' ? parseJson(value) : value;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return null;
  }
  return source as Record<string, unknown>;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : String(value);
}
