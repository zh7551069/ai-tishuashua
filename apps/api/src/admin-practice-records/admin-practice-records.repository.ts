import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_CERTIFICATE_UNREADABLE_PACK,
  QUIZ_MODES,
  QUIZ_SESSION_SOURCES,
  QUIZ_SUBMIT_REASONS,
  type AdminPracticeRecordDetail,
  type AdminPracticeRecordSummary,
  type QuizMode,
  type QuizSessionSource,
  type QuizSubmitReason,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import { maskAdminNick } from '../admin-users/nick-mask';
import type { PracticeRecordQuery } from './admin-practice-records.query';
import { practiceRecordStatusSql } from './admin-practice-records.query';

interface SessionRow {
  id: string;
  user_id: string;
  user_nick: string | null;
  cert_id: string | null;
  cert_name: string | null;
  domain_name: string | null;
  pack_id: string | null;
  pack_snapshot: unknown;
  mode: string;
  source: string;
  pass_snapshot: unknown;
  submit_reason: string | null;
  submitted_at: Date | string | null;
  started_at: Date | string | null;
}

const FROM_SQL = `
  FROM quiz_sessions s
  JOIN users usr ON usr.id = s.user_id
  LEFT JOIN certificates snap
    ON snap.id::text = NULLIF(s.pack_snapshot->>'certId', '')
  LEFT JOIN packs p
    ON p.id = s.pack_id AND p.user_id = s.user_id
  LEFT JOIN certificates pack_cert
    ON pack_cert.id = p.cert_id
  LEFT JOIN certificates c
    ON c.id = COALESCE(snap.id, pack_cert.id)
  LEFT JOIN domains d
    ON d.id = c.domain_id
`;

const SUMMARY_SQL = `
  s.id,
  s.user_id,
  usr.nick AS user_nick,
  COALESCE(snap.id, pack_cert.id) AS cert_id,
  COALESCE(c.name, NULLIF(s.pack_snapshot->>'certName', '')) AS cert_name,
  d.name AS domain_name,
  s.pack_id,
  s.pack_snapshot,
  s.mode,
  s.source,
  s.pass_snapshot,
  s.submit_reason,
  s.submitted_at,
  s.started_at
`;

@Injectable()
export class AdminPracticeRecordRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: PracticeRecordQuery): Promise<{ items: AdminPracticeRecordSummary[]; total: number }> {
    const filters = this.filters(query);
    try {
      const pool = this.database.requirePool();
      const where = this.where(query.includeWrongSet);
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${where}`,
        filters,
      );
      const result = await pool.query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${where}
          ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
          LIMIT $5 OFFSET $6
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-practice-records', error);
    }
  }

  async count(query: PracticeRecordQuery): Promise<number> {
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${this.where(query.includeWrongSet)}`,
        this.filters(query),
      );
      return Number(count.rows[0]?.total ?? 0);
    } catch (error) {
      rethrowDatabaseError('admin-practice-records', error);
    }
  }

  async exportRows(query: PracticeRecordQuery): Promise<AdminPracticeRecordSummary[]> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${this.where(query.includeWrongSet)}
          ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
        `,
        this.filters(query),
      );
      return result.rows.map((row) => toSummary(row));
    } catch (error) {
      rethrowDatabaseError('admin-practice-records', error);
    }
  }

  async find(sessionId: string, includeWrongSet: boolean): Promise<AdminPracticeRecordDetail | null> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE s.id = $1 AND ${practiceRecordStatusSql(includeWrongSet)}
        `,
        [sessionId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return toDetail(row);
    } catch (error) {
      rethrowDatabaseError('admin-practice-records', error);
    }
  }

  private where(includeWrongSet: boolean): string {
    return `
      ${practiceRecordStatusSql(includeWrongSet)}
      AND ($1::uuid IS NULL OR s.user_id = $1::uuid)
      AND ($2::text = 'all' OR s.mode = $2)
      AND ($3::timestamptz IS NULL OR s.submitted_at >= $3)
      AND ($4::timestamptz IS NULL OR s.submitted_at <= $4)
    `;
  }

  private filters(query: PracticeRecordQuery): unknown[] {
    return [query.userId, query.mode, query.from, query.to];
  }
}

function toSummary(row: SessionRow): AdminPracticeRecordSummary {
  const stored = readScore(row.pass_snapshot);
  const packName = readPackName(row.pack_snapshot);
  return {
    id: row.id,
    userId: row.user_id,
    userNick: maskAdminNick(row.user_nick),
    mode: asMode(row.mode),
    source: asSource(row.source),
    score: stored?.earnedScore ?? null,
    totalScore: stored?.totalScore ?? null,
    passed: stored?.passed ?? null,
    scoreReadable: stored !== null,
    durationSeconds: durationSeconds(row.started_at, row.submitted_at),
    packId: row.pack_id,
    packName,
    certId: row.cert_id,
    certName: row.cert_name,
    domainName: row.domain_name,
    startedAt: toIso(row.started_at),
    submittedAt: toIso(row.submitted_at),
  };
}

function toDetail(row: SessionRow): AdminPracticeRecordDetail {
  const stored = readScore(row.pass_snapshot);
  return {
    ...toSummary(row),
    correctCount: stored?.correctCount ?? null,
    wrongCount: stored?.wrongCount ?? null,
    partialCount: stored?.partialCount ?? null,
    unansweredCount: stored?.unansweredCount ?? null,
    accuracy: stored?.accuracy ?? null,
    scoreRate: stored?.scoreRate ?? null,
    submitReason: readReason(row.submit_reason, stored?.reason ?? null),
  };
}

interface StoredScore {
  earnedScore: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  partialCount: number;
  accuracy: number;
  scoreRate: number;
  passed: boolean | null;
  reason: QuizSubmitReason;
}

function readScore(value: unknown): StoredScore | null {
  const body = asRecord(value);
  if (!body || !isReason(body.reason)) {
    return null;
  }
  const numbers = [
    'earnedScore',
    'totalScore',
    'correctCount',
    'wrongCount',
    'unansweredCount',
    'partialCount',
    'accuracy',
    'scoreRate',
  ] as const;
  const parsed = {
    earnedScore: 0,
    totalScore: 0,
    correctCount: 0,
    wrongCount: 0,
    unansweredCount: 0,
    partialCount: 0,
    accuracy: 0,
    scoreRate: 0,
  };
  for (const key of numbers) {
    const number = Number(body[key]);
    if (!Number.isFinite(number)) {
      return null;
    }
    parsed[key] = number;
  }
  return {
    ...parsed,
    passed: typeof body.passed === 'boolean' ? body.passed : null,
    reason: body.reason,
  };
}

function readReason(column: string | null, stored: QuizSubmitReason | null): QuizSubmitReason | null {
  if (isReason(column)) {
    return column;
  }
  return stored;
}

function readPackName(value: unknown): string {
  const body = asRecord(value);
  const name = body && typeof body.name === 'string' ? body.name.trim() : '';
  return name || ADMIN_CERTIFICATE_UNREADABLE_PACK;
}

function durationSeconds(started: Date | string | null, submitted: Date | string | null): number | null {
  const start = toDate(started);
  const end = toDate(submitted);
  if (!start || !end) {
    return null;
  }
  const seconds = Math.floor((end.getTime() - start.getTime()) / 1000);
  if (!Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  return seconds;
}

function toDate(value: Date | string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value: Date | string | null): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
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

function asMode(value: string): QuizMode {
  return (QUIZ_MODES as readonly string[]).includes(value) ? (value as QuizMode) : 'practice';
}

function asSource(value: string): QuizSessionSource {
  return (QUIZ_SESSION_SOURCES as readonly string[]).includes(value)
    ? (value as QuizSessionSource)
    : 'normal';
}

function isReason(value: unknown): value is QuizSubmitReason {
  return typeof value === 'string' && (QUIZ_SUBMIT_REASONS as readonly string[]).includes(value);
}
