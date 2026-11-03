import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_CERTIFICATE_SOURCES,
  ADMIN_CERTIFICATE_UNREADABLE_PACK,
  QUESTION_SOURCES,
  QUIZ_MODES,
  QUIZ_SUBMIT_REASONS,
  QUIZ_TYPES,
  type AdminCertificateScoreDetail,
  type AdminCertificateScoreQuestion,
  type AdminCertificateSource,
  type AdminCertificateScoreSummary,
  type QuestionSource,
  type QuizMode,
  type QuizOption,
  type QuizSubmitReason,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminCertificateQuery } from './admin-certificates.query';

interface SessionRow {
  id: string;
  user_id: string;
  user_nick: string | null;
  cert_id: string | null;
  cert_name: string | null;
  domain_id: string | null;
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

interface QuestionRow {
  id: string;
  ordinal: number | string;
  type_code: string;
  stem: string;
  options: unknown;
  answer: unknown;
  analysis: string | null;
  kp_ids: string[] | null;
  source: string;
  score: number | string | null;
  selected: unknown;
}

interface StoredScore {
  earnedScore: number;
  totalScore: number;
  correctCount: number;
  wrongCount: number;
  unansweredCount: number;
  partialCount: number;
  questionCount: number;
  accuracy: number;
  scoreRate: number;
  passed: boolean | null;
  passScore: number | null;
  reason: QuizSubmitReason;
}

const FILTER_SQL = `
  s.status = 'submitted'
  AND ($1::uuid IS NULL OR s.user_id = $1::uuid)
  AND ($2::uuid IS NULL OR COALESCE(snap.id, pack_cert.id) = $2::uuid)
  AND ($3::text = 'all' OR s.mode = $3)
`;

/**
 * 证书对法与小程序证书查询相同：快照里的 certId 能对上证书时用它，
 * 否则再用仍属于该用户的刷题包。对不上的已交卷仍列出。
 */
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
  c.name AS cert_name,
  d.id AS domain_id,
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
export class AdminCertificateRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminCertificateQuery,
  ): Promise<{ items: AdminCertificateScoreSummary[]; total: number }> {
    const filters = [query.userId, query.certId, query.mode];
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
          ORDER BY s.submitted_at DESC NULLS LAST, s.id DESC
          LIMIT $4 OFFSET $5
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-certificates', error);
    }
  }

  async find(sessionId: string): Promise<AdminCertificateScoreDetail | null> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<SessionRow>(
        `
          SELECT ${SUMMARY_SQL}
          ${FROM_SQL}
          WHERE s.id = $1 AND s.status = 'submitted'
        `,
        [sessionId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const questions = await pool.query<QuestionRow>(
        `
          SELECT
            q.id,
            q.ordinal,
            q.type_code,
            q.stem,
            q.options,
            q.answer,
            q.analysis,
            q.kp_ids,
            q.source,
            q.score,
            COALESCE(a.selected, '[]'::jsonb) AS selected
          FROM paper_questions q
          LEFT JOIN quiz_answers a ON a.question_id = q.id
          WHERE q.session_id = $1
          ORDER BY q.ordinal, q.id
        `,
        [sessionId],
      );
      return toDetail(row, questions.rows.map(toQuestion));
    } catch (error) {
      rethrowDatabaseError('admin-certificates', error);
    }
  }
}

function toSummary(row: SessionRow): AdminCertificateScoreSummary {
  const pack = readPack(row.pack_snapshot);
  const stored = readScore(row.pass_snapshot);
  const nick = row.user_nick?.trim() ? row.user_nick.trim() : null;
  return {
    id: row.id,
    userId: row.user_id,
    userNick: nick,
    certId: row.cert_id,
    certName: row.cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    snapshotCertName: pack.snapshotCertName,
    packId: row.pack_id,
    packName: pack.packName,
    mode: asMode(row.mode),
    source: asSource(row.source),
    scoreReadable: stored !== null,
    earnedScore: stored?.earnedScore ?? null,
    totalScore: stored?.totalScore ?? null,
    accuracy: stored?.accuracy ?? null,
    scoreRate: stored?.scoreRate ?? null,
    correctCount: stored?.correctCount ?? null,
    questionCount: stored?.questionCount ?? null,
    passed: stored?.passed ?? null,
    passScore: stored?.passScore ?? null,
    reason: readReason(row.submit_reason, stored),
    submittedAt: toIso(row.submitted_at),
  };
}

function toDetail(
  row: SessionRow,
  questions: AdminCertificateScoreQuestion[],
): AdminCertificateScoreDetail {
  const stored = readScore(row.pass_snapshot);
  return {
    ...toSummary(row),
    startedAt: toIso(row.started_at),
    wrongCount: stored?.wrongCount ?? null,
    unansweredCount: stored?.unansweredCount ?? null,
    partialCount: stored?.partialCount ?? null,
    questions,
  };
}

function toQuestion(row: QuestionRow): AdminCertificateScoreQuestion {
  const score = Number(row.score);
  return {
    id: row.id,
    ordinal: Number(row.ordinal) || 0,
    type: asQuizType(row.type_code),
    stem: typeof row.stem === 'string' && row.stem.trim() ? row.stem : '题目内容无法读取',
    options: parseOptions(row.options),
    selected: parseStringArray(row.selected),
    answer: parseStringArray(row.answer),
    analysis: typeof row.analysis === 'string' ? row.analysis : '',
    score: Number.isFinite(score) ? score : 0,
    kpIds: (row.kp_ids ?? []).filter((item) => typeof item === 'string' && item.length > 0),
    source: asQuestionSource(row.source),
  };
}

/**
 * 与小程序成绩列表同一套快照字段。缺数字或交卷原因时整份视为读不出，
 * 不把 quiz_sessions.score 当成另一套成绩。
 */
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
    'questionCount',
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
    questionCount: 0,
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
  const passScore =
    body.passScore === null || body.passScore === undefined ? null : Number(body.passScore);
  if (passScore !== null && !Number.isFinite(passScore)) {
    return null;
  }
  return {
    ...parsed,
    passed: typeof body.passed === 'boolean' ? body.passed : null,
    passScore,
    reason: body.reason,
  };
}

function readReason(column: string | null, stored: StoredScore | null): QuizSubmitReason | null {
  if (isReason(column)) {
    return column;
  }
  return stored?.reason ?? null;
}

function readPack(value: unknown): { packName: string; snapshotCertName: string | null } {
  const body = asRecord(value);
  if (!body) {
    return { packName: ADMIN_CERTIFICATE_UNREADABLE_PACK, snapshotCertName: null };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const certName = typeof body.certName === 'string' ? body.certName.trim() : '';
  return {
    packName: name || ADMIN_CERTIFICATE_UNREADABLE_PACK,
    snapshotCertName: certName || null,
  };
}

function toIso(value: Date | string | null): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
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

function parseOptions(value: unknown): QuizOption[] {
  const source = typeof value === 'string' ? parseJson(value) : value;
  if (!Array.isArray(source)) {
    return [];
  }
  const options: QuizOption[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
    if (id && text) {
      options.push({ id, text });
    }
  }
  return options;
}

function parseStringArray(value: unknown): string[] {
  const source = typeof value === 'string' ? parseJson(value) : value;
  if (!Array.isArray(source)) {
    return [];
  }
  return source.filter((item): item is string => typeof item === 'string');
}

function asMode(value: string): QuizMode {
  return (QUIZ_MODES as readonly string[]).includes(value) ? (value as QuizMode) : 'practice';
}

function asSource(value: string): AdminCertificateSource {
  return (ADMIN_CERTIFICATE_SOURCES as readonly string[]).includes(value)
    ? (value as AdminCertificateSource)
    : 'normal';
}

function asQuizType(value: string): QuizTypeCode | null {
  return (QUIZ_TYPES as readonly string[]).includes(value) ? (value as QuizTypeCode) : null;
}

function asQuestionSource(value: string): QuestionSource | null {
  return (QUESTION_SOURCES as readonly string[]).includes(value) ? (value as QuestionSource) : null;
}

function isReason(value: unknown): value is QuizSubmitReason {
  return typeof value === 'string' && (QUIZ_SUBMIT_REASONS as readonly string[]).includes(value);
}
