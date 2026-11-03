import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_QUIZ_SESSION_SOURCES,
  ADMIN_QUIZ_SESSION_STATUSES,
  QUIZ_MODES,
  type AdminQuizSessionDetail,
  type AdminQuizSessionSource,
  type AdminQuizSessionStatus,
  type AdminQuizSessionSummary,
  type QuizMode,
} from '@tishuashua/shared';
import { maskAdminNick } from '../admin-users/nick-mask';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminQuizSessionQuery } from './admin-quiz-sessions.query';
import {
  readDeadline,
  readPackSnapshot,
  readProgress,
  readQuizSettings,
  readSessionError,
} from './admin-quiz-sessions.read';

interface SessionRow {
  id: string;
  user_id: string;
  user_nick: string | null;
  pack_id: string | null;
  pack_snapshot: unknown;
  mode: string;
  status: string;
  source: string;
  settings: unknown;
  question_count: number | string;
  generated_count: number | string;
  error_code: string | null;
  error_message: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
}

const OPEN_STATUSES = [...ADMIN_QUIZ_SESSION_STATUSES];

const FILTER_SQL = `
  s.status = ANY($1::text[])
  AND ($2::uuid IS NULL OR s.user_id = $2::uuid)
  AND ($3::text = 'all' OR s.mode = $3)
`;

const SUMMARY_SQL = `
  s.id,
  s.user_id,
  usr.nick AS user_nick,
  s.pack_id,
  s.pack_snapshot,
  s.mode,
  s.status,
  s.source,
  s.settings,
  s.question_count,
  s.generated_count,
  s.error_code,
  s.error_message,
  s.created_at,
  s.updated_at,
  s.started_at
`;

const FROM_SQL = `
  FROM quiz_sessions s
  JOIN users usr ON usr.id = s.user_id
`;

@Injectable()
export class AdminQuizSessionRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminQuizSessionQuery,
  ): Promise<{ items: AdminQuizSessionSummary[]; total: number }> {
    const statuses = query.status === 'all' ? OPEN_STATUSES : [query.status];
    const filters = [statuses, query.userId, query.mode];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${FILTER_SQL}
          ORDER BY s.created_at DESC, s.id DESC
          LIMIT $4 OFFSET $5
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map(toSummary),
      };
    } catch (error) {
      rethrowDatabaseError('admin-quiz-sessions', error);
    }
  }

  /** submitted 单独返回，调用方给出指向成绩页的说明，且不带分数。 */
  async find(sessionId: string): Promise<AdminQuizSessionDetail | 'submitted' | null> {
    try {
      const result = await this.database.requirePool().query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE s.id = $1
        `,
        [sessionId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      if (row.status === 'submitted') {
        return 'submitted';
      }
      if (!isOpenStatus(row.status)) {
        return null;
      }
      return toDetail(row);
    } catch (error) {
      rethrowDatabaseError('admin-quiz-sessions', error);
    }
  }
}

function toSummary(row: SessionRow): AdminQuizSessionSummary {
  const pack = readPackSnapshot(row.pack_snapshot);
  return {
    id: row.id,
    userId: row.user_id,
    userNick: maskAdminNick(row.user_nick),
    packId: row.pack_id,
    packName: pack.packName,
    domainName: pack.domainName,
    certName: pack.certName,
    mode: asMode(row.mode),
    status: asStatus(row.status),
    source: asSource(row.source),
    progress: readProgress(row.generated_count, row.question_count),
    error: readSessionError(row.error_code, row.error_message),
    createdAt: toIso(row.created_at) ?? '',
    updatedAt: toIso(row.updated_at) ?? '',
    startedAt: toIso(row.started_at),
  };
}

function toDetail(row: SessionRow): AdminQuizSessionDetail {
  const summary = toSummary(row);
  const settings = readQuizSettings(row.settings);
  return {
    ...summary,
    settingsReadable: settings !== null,
    settings,
    deadlineAt: readDeadline(summary.startedAt, settings),
  };
}

function isOpenStatus(value: string): value is AdminQuizSessionStatus {
  return (ADMIN_QUIZ_SESSION_STATUSES as readonly string[]).includes(value);
}

function asStatus(value: string): AdminQuizSessionStatus {
  return isOpenStatus(value) ? value : 'failed';
}

function asMode(value: string): QuizMode {
  return (QUIZ_MODES as readonly string[]).includes(value) ? (value as QuizMode) : 'practice';
}

function asSource(value: string): AdminQuizSessionSource {
  return (ADMIN_QUIZ_SESSION_SOURCES as readonly string[]).includes(value)
    ? (value as AdminQuizSessionSource)
    : 'normal';
}

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
