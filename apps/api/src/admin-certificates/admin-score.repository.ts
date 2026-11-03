import { Inject, Injectable } from '@nestjs/common';
import type { AdminScoreDetail, AdminScoreSummary, QuizMode } from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminScoreQuery } from './admin-certificates.query';
import {
  isSubmitReason,
  readAdminStoredScore,
  readPackSnapshot,
  type AdminStoredScore,
} from './admin-score-snapshot';

interface ScoreRow {
  id: string;
  user_id: string;
  user_nick: string | null;
  mode: string;
  pack_id: string | null;
  pack_snapshot: unknown;
  pass_snapshot: unknown;
  submit_reason: string | null;
  submitted_at: Date | string | null;
  started_at?: Date | string | null;
  created_at?: Date | string | null;
  cert_id: string | null;
  resolved_cert_name: string | null;
  domain_id: string | null;
  domain_name: string | null;
}

/**
 * 只看已交卷。证书对法与证书查询相同：先认快照里仍存在的 certId，再认还在的刷题包。
 * 对不上证书的会话仍出现在成绩里，certId 为空。不改 quiz.repository 的成绩列表。
 */
const FROM_SQL = `
  FROM quiz_sessions s
  JOIN users usr ON usr.id = s.user_id
  LEFT JOIN certificates snap
    ON snap.id::text = NULLIF(s.pack_snapshot->>'certId', '')
  LEFT JOIN domains snap_domain ON snap_domain.id = snap.domain_id
  LEFT JOIN packs p ON p.id = s.pack_id AND p.user_id = s.user_id
  LEFT JOIN certificates pack_cert ON pack_cert.id = p.cert_id
  LEFT JOIN domains pack_domain ON pack_domain.id = pack_cert.domain_id
`;

const FILTER_SQL = `
  s.status = 'submitted'
  AND ($1::uuid IS NULL OR s.user_id = $1::uuid)
  AND ($2::uuid IS NULL OR COALESCE(snap.id, pack_cert.id) = $2::uuid)
  AND ($3::uuid IS NULL OR COALESCE(snap.domain_id, pack_cert.domain_id) = $3::uuid)
  AND ($4::text = 'all' OR s.mode = $4)
  AND ($5::timestamptz IS NULL OR s.submitted_at >= $5::timestamptz)
  AND ($6::timestamptz IS NULL OR s.submitted_at <= $6::timestamptz)
`;

const SUMMARY_SQL = `
  s.id,
  s.user_id,
  usr.nick AS user_nick,
  s.mode,
  s.pack_id,
  s.pack_snapshot,
  s.pass_snapshot,
  s.submit_reason,
  s.submitted_at,
  COALESCE(snap.id, pack_cert.id) AS cert_id,
  COALESCE(snap.name, pack_cert.name) AS resolved_cert_name,
  COALESCE(snap_domain.id, pack_domain.id) AS domain_id,
  COALESCE(snap_domain.name, pack_domain.name) AS domain_name
`;

@Injectable()
export class AdminScoreRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: AdminScoreQuery): Promise<{ items: AdminScoreSummary[]; total: number }> {
    const filters = filtersOf(query);
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total ${FROM_SQL} WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<ScoreRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE ${FILTER_SQL}
          ORDER BY s.submitted_at DESC NULLS LAST, s.created_at DESC, s.id
          LIMIT $7 OFFSET $8
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-score', error);
    }
  }

  async find(sessionId: string): Promise<AdminScoreDetail | null> {
    try {
      const result = await this.database.requirePool().query<ScoreRow>(
        `
          SELECT ${SUMMARY_SQL}, s.started_at, s.created_at
          ${FROM_SQL}
          WHERE s.id = $1 AND s.status = 'submitted'
        `,
        [sessionId],
      );
      const row = result.rows[0];
      return row ? toDetail(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-score', error);
    }
  }
}

function filtersOf(query: AdminScoreQuery): Array<string | null> {
  return [
    query.userId,
    query.certId,
    query.domainId,
    query.mode,
    query.submittedFrom,
    query.submittedTo,
  ];
}

function toSummary(row: ScoreRow): AdminScoreSummary {
  const stored = readAdminStoredScore(row.pass_snapshot);
  const names = readPackSnapshot(row.pack_snapshot);
  const reason = isSubmitReason(row.submit_reason) ? row.submit_reason : (stored?.reason ?? null);
  return {
    id: row.id,
    userId: row.user_id,
    userNick: row.user_nick?.trim() ? row.user_nick.trim() : null,
    mode: asMode(row.mode),
    certId: row.cert_id,
    certName: names.certName,
    resolvedCertName: row.resolved_cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    packId: row.pack_id,
    packName: names.packName,
    earnedScore: stored?.earnedScore ?? null,
    totalScore: stored?.totalScore ?? null,
    accuracy: stored?.accuracy ?? null,
    scoreRate: stored?.scoreRate ?? null,
    correctCount: stored?.correctCount ?? null,
    questionCount: stored?.questionCount ?? null,
    passed: stored?.passed ?? null,
    passScore: stored?.passScore ?? null,
    reason,
    submittedAt: toIso(row.submitted_at),
    readable: stored !== null,
  };
}

function toDetail(row: ScoreRow): AdminScoreDetail {
  const stored = readAdminStoredScore(row.pass_snapshot);
  return {
    ...toSummary(row),
    wrongCount: countOf(stored, 'wrongCount'),
    unansweredCount: countOf(stored, 'unansweredCount'),
    partialCount: countOf(stored, 'partialCount'),
    startedAt: toIso(row.started_at),
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function countOf(
  stored: AdminStoredScore | null,
  key: 'wrongCount' | 'unansweredCount' | 'partialCount',
): number | null {
  return stored ? stored[key] : null;
}

function asMode(value: string): QuizMode {
  return value === 'exam' ? 'exam' : 'practice';
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
