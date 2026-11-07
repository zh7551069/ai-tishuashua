import { Inject, Injectable } from '@nestjs/common';
import {
  QUESTION_SOURCES,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  QUIZ_SCORE_LIST_LIMIT,
  QUIZ_SESSION_SOURCES,
  QUIZ_SUBMIT_REASONS,
  QUIZ_TYPES,
  VARIANT_QUIZ_COUNT,
  examDeadlineAt,
  gradeSelection,
  normalizeSelection,
  summarizeGrades,
  type QuizMode,
  type QuizOption,
  type QuizOutcome,
  type QuizQuestionView,
  type QuizResultView,
  type QuizScoreSummary,
  type QuizSessionSource,
  type QuizSessionStatus,
  type QuizSessionView,
  type QuizSettings,
  type QuizSubmitReason,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

type Queryable = Pool | PoolClient;

interface PackRow {
  id: string;
  name: string;
  domain_id: string;
  domain_name: string;
  cert_id: string;
  cert_name: string;
  cert_status: string;
  total_score: number;
  enabled_question_type_codes: string[];
  knowledge_points: unknown;
}

interface SessionRow {
  id: string;
  pack_id: string | null;
  mode: string;
  source: string;
  status: string;
  settings: unknown;
  question_count: number;
  generated_count: number;
  error_code: string | null;
  error_message: string | null;
  pack_snapshot: unknown;
  started_at: Date | string | null;
  submitted_at: Date | string | null;
  pass_snapshot: unknown;
  submit_reason: string | null;
}

interface LockedSessionRow {
  id: string;
  user_id: string;
  status: string;
  mode: string;
  settings: unknown;
  question_count: number | string;
  started_at: Date | string | null;
  pack_snapshot: unknown;
}

interface GradableQuestion {
  id: string;
  type: QuizTypeCode;
  stem: string;
  options: QuizOption[];
  answer: string[];
  analysis: string;
  kpIds: string[];
  score: number;
  selected: string[];
  earnedScore: number;
  outcome: QuizOutcome;
}

interface QuestionRow {
  id: string;
  ordinal: number;
  type_code: string;
  stem: string;
  options: unknown;
  score: number | string;
  source: string;
  selected: unknown;
  kp_ids: string[] | null;
  answer?: unknown;
  analysis?: string | null;
}

export interface QuizPackRecord {
  id: string;
  name: string;
  domainId: string;
  domainName: string;
  certId: string;
  certName: string;
  unavailable: boolean;
  totalScore: number;
  enabledQuestionTypeCodes: string[];
  knowledgePoints: { id: string; name: string }[];
}

@Injectable()
export class QuizRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      rethrowDatabaseError('quiz', error);
    } finally {
      client.release();
    }
  }

  async loadPack(userId: string, packId: string, db?: Queryable): Promise<QuizPackRecord | null> {
    try {
      const result = await (db ?? this.database.requirePool()).query<PackRow>(
        `
          SELECT
            p.id,
            p.name,
            p.domain_id,
            d.name AS domain_name,
            p.cert_id,
            c.name AS cert_name,
            c.status AS cert_status,
            c.total_score,
            c.enabled_question_type_codes,
            COALESCE(
              jsonb_agg(
                jsonb_build_object('id', kp.id, 'name', kp.name)
                ORDER BY pkp.position
              ) FILTER (WHERE kp.id IS NOT NULL),
              '[]'::jsonb
            ) AS knowledge_points
          FROM packs p
          JOIN domains d ON d.id = p.domain_id
          JOIN certificates c ON c.id = p.cert_id
          LEFT JOIN pack_knowledge_points pkp ON pkp.pack_id = p.id
          LEFT JOIN knowledge_points kp ON kp.id = pkp.knowledge_point_id
          WHERE p.user_id = $1 AND p.id = $2
          GROUP BY p.id, d.name, c.name, c.status, c.total_score, c.enabled_question_type_codes
        `,
        [userId, packId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        name: row.name,
        domainId: row.domain_id,
        domainName: row.domain_name,
        certId: row.cert_id,
        certName: row.cert_name,
        unavailable: row.cert_status !== 'online',
        totalScore: Number(row.total_score),
        enabledQuestionTypeCodes: row.enabled_question_type_codes ?? [],
        knowledgePoints: parseKnowledgePoints(row.knowledge_points),
      };
    } catch (error) {
      rethrowDatabaseError('quiz', error);
    }
  }

  async findOwnedWrongItem(
    db: Queryable,
    userId: string,
    itemId: string,
  ): Promise<{ id: string; certId: string; kpIds: string[] } | null> {
    const result = await db.query<{ id: string; cert_id: string; kp_ids: string[] | null }>(
      `
        SELECT id::text AS id, cert_id::text AS cert_id, kp_ids
        FROM wrong_items
        WHERE id = $1 AND user_id = $2
      `,
      [itemId, userId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      certId: row.cert_id,
      kpIds: (row.kp_ids ?? []).map((id) => id.toLowerCase()),
    };
  }

  /** 只返回该包内、kind=knowledge_point 且 online 的 id。不写包。 */
  async usablePackKnowledgePointIds(
    db: Queryable,
    packId: string,
    ids: readonly string[],
  ): Promise<string[]> {
    if (ids.length === 0) {
      return [];
    }
    const result = await db.query<{ id: string }>(
      `
        SELECT kp.id::text AS id
        FROM pack_knowledge_points pkp
        JOIN knowledge_points kp ON kp.id = pkp.knowledge_point_id
        WHERE pkp.pack_id = $1
          AND kp.id = ANY($2::uuid[])
          AND kp.kind = 'knowledge_point'
          AND kp.status = 'online'
      `,
      [packId, ids],
    );
    return result.rows.map((row) => row.id.toLowerCase());
  }

  async insertSession(
    db: Queryable,
    input: {
      id: string;
      userId: string;
      pack: QuizPackRecord;
      settings: QuizSettings;
      source: Exclude<QuizSessionSource, 'wrongSet'>;
      knowledgePointIds: string[] | null;
      wrongItemId: string | null;
    },
  ): Promise<void> {
    const snapshot = {
      packId: input.pack.id,
      name: input.pack.name,
      domainId: input.pack.domainId,
      domainName: input.pack.domainName,
      certId: input.pack.certId,
      certName: input.pack.certName,
      totalScore: input.pack.totalScore,
      knowledgePointNames: input.pack.knowledgePoints.map((item) => item.name),
    };
    await db.query(
      `
        INSERT INTO quiz_sessions (
          id, user_id, pack_id, pack_snapshot, mode, settings, status, source,
          question_count, generated_count, knowledge_point_ids, wrong_item_id
        )
        VALUES (
          $1, $2, $3, $4::jsonb, $5, $6::jsonb, 'pending', $7, $8, 0, $9::uuid[], $10
        )
      `,
      [
        input.id,
        input.userId,
        input.pack.id,
        JSON.stringify(snapshot),
        input.settings.mode,
        JSON.stringify(input.settings),
        input.source,
        input.settings.count,
        input.knowledgePointIds,
        input.wrongItemId,
      ],
    );
  }

  async deletePending(userId: string, sessionId: string): Promise<void> {
    try {
      await this.database
        .requirePool()
        .query(`DELETE FROM quiz_sessions WHERE id = $1 AND user_id = $2 AND status = 'pending'`, [
          sessionId,
          userId,
        ]);
    } catch (error) {
      rethrowDatabaseError('quiz', error);
    }
  }

  async findSession(userId: string, sessionId: string): Promise<QuizSessionView | null> {
    try {
      const pool = this.database.requirePool();
      const result = await pool.query<SessionRow>(
        `
          SELECT
            id, pack_id, mode, source, status, settings, question_count, generated_count,
            error_code, error_message, pack_snapshot, started_at, submitted_at,
            pass_snapshot, submit_reason
          FROM quiz_sessions
          WHERE id = $1 AND user_id = $2
        `,
        [sessionId, userId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      const visible =
        row.status === 'ready' || row.status === 'in_progress' || row.status === 'submitted';
      const questions = visible
        ? await this.loadQuestions(pool, row.id, row.status === 'submitted')
        : [];
      return mapSession(row, questions);
    } catch (error) {
      rethrowDatabaseError('quiz', error);
    }
  }

  async cancel(userId: string, sessionId: string): Promise<'missing' | 'conflict' | 'cancelled'> {
    return this.transaction(async (client) => {
      const result = await client.query<{ status: string }>(
        `SELECT status FROM quiz_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const status = result.rows[0]?.status;
      if (!status) {
        return 'missing';
      }
      if (status === 'cancelled') {
        return 'cancelled';
      }
      if (status !== 'pending' && status !== 'generating') {
        return 'conflict';
      }
      await client.query(`DELETE FROM paper_questions WHERE session_id = $1`, [sessionId]);
      await client.query(
        `
          UPDATE quiz_sessions
          SET status = 'cancelled', run_token = NULL, generated_count = 0, updated_at = now()
          WHERE id = $1
        `,
        [sessionId],
      );
      return 'cancelled';
    });
  }

  async start(
    userId: string,
    sessionId: string,
  ): Promise<'missing' | 'conflict' | 'started' | 'submitted'> {
    return this.transaction(async (client) => {
      const result = await client.query<{ status: string; started_at: Date | string | null }>(
        `SELECT status, started_at FROM quiz_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const row = result.rows[0];
      if (!row) {
        return 'missing';
      }
      if (row.status === 'submitted') {
        return 'submitted';
      }
      if (row.status !== 'ready' && row.status !== 'in_progress') {
        return 'conflict';
      }
      if (row.status === 'ready' || !row.started_at) {
        await client.query(
          `
            UPDATE quiz_sessions
            SET status = 'in_progress',
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            WHERE id = $1
          `,
          [sessionId],
        );
      }
      return 'started';
    });
  }

  async saveAnswer(
    userId: string,
    sessionId: string,
    questionId: string,
    selected: string[],
  ): Promise<
    | { kind: 'missing' }
    | { kind: 'conflict'; message: string }
    | { kind: 'question' }
    | { kind: 'invalid'; message: string }
    | { kind: 'saved'; selected: string[] }
  > {
    return this.transaction(async (client) => {
      const session = await client.query<{ status: string }>(
        `SELECT status FROM quiz_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const status = session.rows[0]?.status;
      if (!status) {
        return { kind: 'missing' };
      }
      if (status === 'submitted') {
        return { kind: 'conflict', message: '已经交卷，不能再改答案' };
      }
      if (status !== 'ready' && status !== 'in_progress') {
        return { kind: 'conflict', message: '试卷还不能作答' };
      }
      const question = await client.query<{ type_code: string; options: unknown }>(
        `
          SELECT type_code, options
          FROM paper_questions
          WHERE id = $1 AND session_id = $2
        `,
        [questionId, sessionId],
      );
      const row = question.rows[0];
      if (!row || !isQuizType(row.type_code)) {
        return { kind: 'question' };
      }
      const normalized = normalizeSelection(
        row.type_code,
        parseOptions(row.options).map((option) => option.id),
        selected,
      );
      if (!normalized.ok) {
        return { kind: 'invalid', message: normalized.message };
      }
      if (status === 'ready') {
        await client.query(
          `
            UPDATE quiz_sessions
            SET status = 'in_progress',
                started_at = COALESCE(started_at, now()),
                updated_at = now()
            WHERE id = $1
          `,
          [sessionId],
        );
      }
      if (normalized.selected.length === 0) {
        await client.query(`DELETE FROM quiz_answers WHERE question_id = $1`, [questionId]);
      } else {
        await client.query(
          `
            INSERT INTO quiz_answers (question_id, session_id, selected)
            VALUES ($1, $2, $3::jsonb)
            ON CONFLICT (question_id)
            DO UPDATE SET selected = EXCLUDED.selected, updated_at = now()
          `,
          [questionId, sessionId, JSON.stringify(normalized.selected)],
        );
      }
      return { kind: 'saved', selected: normalized.selected };
    });
  }

  async expireDueExams(userId: string): Promise<void> {
    await this.transaction(async (client) => {
      const result = await client.query<LockedSessionRow>(
        `
          SELECT id, user_id, status, mode, settings, question_count, started_at, pack_snapshot
          FROM quiz_sessions
          WHERE user_id = $1 AND status IN ('ready', 'in_progress') AND mode = 'exam'
          FOR UPDATE
        `,
        [userId],
      );
      const now = new Date();
      for (const row of result.rows) {
        if (isExamExpired(row, now)) {
          await finishSession(client, row, 'timeout');
        }
      }
    });
  }

  async submit(
    userId: string,
    sessionId: string,
    requested: QuizSubmitReason,
  ): Promise<'missing' | 'conflict' | 'submitted'> {
    return this.transaction(async (client) => {
      const row = await lockSession(client, userId, sessionId);
      if (!row) {
        return 'missing';
      }
      if (row.status === 'submitted') {
        return 'submitted';
      }
      if (row.status !== 'ready' && row.status !== 'in_progress') {
        return 'conflict';
      }
      const now = new Date();
      const expired = isExamExpired(row, now);
      const nearTimeout = requested === 'timeout' && isExamExpired(row, now, TIMEOUT_GRACE_MS);
      await finishSession(client, row, expired || nearTimeout ? 'timeout' : 'manual');
      return 'submitted';
    });
  }

  async listScores(userId: string): Promise<{ items: QuizScoreSummary[]; total: number }> {
    try {
      const result = await this.database.requirePool().query<ScoreRow>(
        `
          SELECT
            id,
            mode,
            source,
            pack_snapshot,
            pass_snapshot,
            submit_reason,
            submitted_at,
            COUNT(*) OVER ()::int AS total_count
          FROM quiz_sessions
          WHERE user_id = $1 AND status = 'submitted'
          ORDER BY submitted_at DESC NULLS LAST, created_at DESC
          LIMIT $2
        `,
        [userId, QUIZ_SCORE_LIST_LIMIT],
      );
      const items: QuizScoreSummary[] = [];
      for (const row of result.rows) {
        const item = mapScore(row);
        if (item) {
          items.push(item);
        }
      }
      const rawTotal = result.rows[0]?.total_count;
      const total = rawTotal === undefined || rawTotal === null ? 0 : Number(rawTotal);
      return { items, total: Number.isFinite(total) ? total : items.length };
    } catch (error) {
      rethrowDatabaseError('quiz', error);
    }
  }

  private async loadQuestions(
    db: Queryable,
    sessionId: string,
    reveal: boolean,
  ): Promise<QuizQuestionView[]> {
    const result = await db.query<QuestionRow>(
      reveal
        ? `
          SELECT
            q.id,
            q.ordinal,
            q.type_code,
            q.stem,
            q.options,
            q.score,
            q.source,
            q.kp_ids,
            q.answer,
            q.analysis,
            COALESCE(a.selected, '[]'::jsonb) AS selected
          FROM paper_questions q
          LEFT JOIN quiz_answers a ON a.question_id = q.id
          WHERE q.session_id = $1
          ORDER BY q.ordinal
        `
        : `
          SELECT
            q.id,
            q.ordinal,
            q.type_code,
            q.stem,
            q.options,
            q.score,
            q.source,
            q.kp_ids,
            COALESCE(a.selected, '[]'::jsonb) AS selected
          FROM paper_questions q
          LEFT JOIN quiz_answers a ON a.question_id = q.id
          WHERE q.session_id = $1
          ORDER BY q.ordinal
        `,
      [sessionId],
    );
    const questions: QuizQuestionView[] = [];
    for (const row of result.rows) {
      if (!isQuizType(row.type_code) || !isQuestionSource(row.source)) {
        continue;
      }
      const selected = parseStringArray(row.selected);
      const score = Number(row.score);
      const question: QuizQuestionView = {
        id: row.id,
        ordinal: Number(row.ordinal),
        type: row.type_code,
        stem: row.stem,
        options: parseOptions(row.options),
        score,
        source: row.source,
        selected,
        review: reveal ? reviewOf(row.type_code, row.answer, row.analysis, selected, score) : null,
      };
      if (reveal) {
        const kpIds = (row.kp_ids ?? []).map((id) => id.toLowerCase()).filter(isUuid);
        if (kpIds.length > 0) {
          question.kpIds = kpIds;
        }
      }
      questions.push(question);
    }
    if (reveal) {
      await attachKnowledgeNames(db, questions);
    }
    return questions;
  }
}

function mapSession(row: SessionRow, questions: QuizQuestionView[]): QuizSessionView {
  const settings = parseSettings(row.settings);
  const snapshot = parseSnapshot(row.pack_snapshot);
  const total = Number(row.question_count) || settings.count;
  const paperTotal = questions.reduce((sum, question) => sum + question.score, 0);
  const visible =
    row.status === 'ready' || row.status === 'in_progress' || row.status === 'submitted';
  const mode = isMode(row.mode) ? row.mode : settings.mode;
  const startedAt = toDate(row.started_at);
  const deadline =
    startedAt === null
      ? null
      : examDeadlineAt({
          mode,
          timer: settings.timer,
          startedAt,
          questionCount: total,
        });
  return {
    id: row.id,
    packId: row.pack_id,
    mode,
    source: asSessionSource(row.source),
    status: isStatus(row.status) ? row.status : 'failed',
    progress: {
      generated: Number(row.generated_count) || 0,
      total,
    },
    settings,
    error: row.error_code
      ? { code: row.error_code, message: row.error_message || '出题失败' }
      : null,
    context: {
      packName: snapshot.name,
      domainName: snapshot.domainName,
      certName: snapshot.certName,
      totalScore: visible && questions.length > 0 ? paperTotal : snapshot.totalScore,
    },
    paper: visible
      ? {
          totalScore: paperTotal,
          questions,
        }
      : null,
    result: row.status === 'submitted' ? readResult(row, questions) : null,
    startedAt: startedAt ? startedAt.toISOString() : null,
    deadlineAt: deadline ? deadline.toISOString() : null,
  };
}

function parseSettings(value: unknown): QuizSettings {
  const fallback: QuizSettings = {
    count: 20,
    difficulty: 'medium',
    types: ['single'],
    timer: { enabled: false },
    mode: 'practice',
  };
  if (!value || typeof value !== 'object') {
    return fallback;
  }
  const body = value as Partial<QuizSettings>;
  const count = body.count;
  const difficulty = body.difficulty;
  const mode = body.mode;
  const types = Array.isArray(body.types) ? body.types.filter(isQuizType) : [];
  if (
    (count !== VARIANT_QUIZ_COUNT &&
      count !== 10 &&
      count !== 20 &&
      count !== 30 &&
      count !== 50) ||
    !isDifficulty(difficulty) ||
    !isMode(mode) ||
    types.length === 0
  ) {
    return fallback;
  }
  return {
    count,
    difficulty,
    types,
    timer: parseTimer(body.timer),
    mode,
  };
}

function parseTimer(value: QuizSettings['timer'] | undefined): QuizSettings['timer'] {
  if (!value || value.enabled === false) {
    return { enabled: false };
  }
  if (value.kind === 'per_question' && Number.isInteger(value.perQuestionSeconds)) {
    return {
      enabled: true,
      kind: 'per_question',
      perQuestionSeconds: value.perQuestionSeconds,
    };
  }
  if (value.kind === 'paper' && Number.isInteger(value.paperMinutes)) {
    return { enabled: true, kind: 'paper', paperMinutes: value.paperMinutes };
  }
  return { enabled: false };
}

function parseSnapshot(value: unknown): {
  name: string;
  domainName: string;
  certName: string;
  totalScore: number;
} {
  if (!value || typeof value !== 'object') {
    return { name: '', domainName: '', certName: '', totalScore: 0 };
  }
  const body = value as {
    name?: unknown;
    domainName?: unknown;
    certName?: unknown;
    totalScore?: unknown;
  };
  return {
    name: typeof body.name === 'string' ? body.name : '',
    domainName: typeof body.domainName === 'string' ? body.domainName : '',
    certName: typeof body.certName === 'string' ? body.certName : '',
    totalScore:
      typeof body.totalScore === 'number' ? body.totalScore : Number(body.totalScore) || 0,
  };
}

function parseKnowledgePoints(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const points: { id: string; name: string }[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const name = 'name' in item && typeof item.name === 'string' ? item.name : '';
    if (id && name) {
      points.push({ id, name });
    }
  }
  return points;
}

function parseOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: QuizOption[] = [];
  for (const item of value) {
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
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function isQuizType(value: unknown): value is QuizTypeCode {
  return typeof value === 'string' && (QUIZ_TYPES as readonly string[]).includes(value);
}

function isDifficulty(value: unknown): value is QuizSettings['difficulty'] {
  return typeof value === 'string' && (QUIZ_DIFFICULTIES as readonly string[]).includes(value);
}

function isMode(value: unknown): value is QuizMode {
  return typeof value === 'string' && (QUIZ_MODES as readonly string[]).includes(value);
}

const TIMEOUT_GRACE_MS = 1500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ScoreRow {
  id: string;
  mode: string;
  source: string;
  pack_snapshot: unknown;
  pass_snapshot: unknown;
  submit_reason: string | null;
  submitted_at: Date | string | null;
  total_count?: number | string | null;
}

interface WrongItemRow {
  id: string;
  status: string;
  wrong_count: number | string;
  question_snapshot: unknown;
}

async function lockSession(
  client: Queryable,
  userId: string,
  sessionId: string,
): Promise<LockedSessionRow | null> {
  const result = await client.query<LockedSessionRow>(
    `
      SELECT id, user_id, status, mode, settings, question_count, started_at, pack_snapshot
      FROM quiz_sessions
      WHERE id = $1 AND user_id = $2
      FOR UPDATE
    `,
    [sessionId, userId],
  );
  return result.rows[0] ?? null;
}

function isExamExpired(row: LockedSessionRow, now: Date, graceMs = 0): boolean {
  if (row.mode !== 'exam') {
    return false;
  }
  const startedAt = toDate(row.started_at);
  if (!startedAt) {
    return false;
  }
  const settings = parseSettings(row.settings);
  const deadline = examDeadlineAt({
    mode: 'exam',
    timer: settings.timer,
    startedAt,
    questionCount: Number(row.question_count) || settings.count,
  });
  if (!deadline) {
    return false;
  }
  return now.getTime() + graceMs >= deadline.getTime();
}

async function finishSession(
  client: Queryable,
  row: LockedSessionRow,
  reason: QuizSubmitReason,
): Promise<void> {
  const questions = await loadGradable(client, row.id);
  const certId = readCertId(row.pack_snapshot);
  const passScore = await loadPassScore(client, certId);
  const summary = summarizeGrades(questions, passScore);
  const stored = { ...summary, reason };
  await client.query(
    `
      UPDATE quiz_sessions
      SET status = 'submitted',
          score = $2,
          pass_snapshot = $3::jsonb,
          submit_reason = $4,
          started_at = COALESCE(started_at, now()),
          submitted_at = now(),
          updated_at = now()
      WHERE id = $1
    `,
    [row.id, summary.earnedScore, JSON.stringify(stored), reason],
  );
  if (certId) {
    await syncWrongItems(client, row.user_id, certId, questions);
  }
}

async function loadGradable(client: Queryable, sessionId: string): Promise<GradableQuestion[]> {
  const result = await client.query<{
    id: string;
    type_code: string;
    stem: string;
    options: unknown;
    answer: unknown;
    analysis: string | null;
    kp_ids: string[] | null;
    score: number | string;
    selected: unknown;
  }>(
    `
      SELECT
        q.id,
        q.type_code,
        q.stem,
        q.options,
        q.answer,
        q.analysis,
        q.kp_ids,
        q.score,
        COALESCE(a.selected, '[]'::jsonb) AS selected
      FROM paper_questions q
      LEFT JOIN quiz_answers a ON a.question_id = q.id
      WHERE q.session_id = $1
      ORDER BY q.ordinal
    `,
    [sessionId],
  );
  const questions: GradableQuestion[] = [];
  for (const row of result.rows) {
    if (!isQuizType(row.type_code)) {
      continue;
    }
    const answer = parseStringArray(row.answer);
    const selected = parseStringArray(row.selected);
    const score = Number(row.score);
    const graded = gradeSelection({ type: row.type_code, answer, selected, score });
    questions.push({
      id: row.id,
      type: row.type_code,
      stem: row.stem,
      options: parseOptions(row.options),
      answer,
      analysis: typeof row.analysis === 'string' ? row.analysis : '',
      kpIds: (row.kp_ids ?? []).filter(isUuid),
      score,
      selected,
      earnedScore: graded.earnedScore,
      outcome: graded.outcome,
    });
  }
  return questions;
}

async function loadPassScore(client: Queryable, certId: string | null): Promise<number | null> {
  if (!certId) {
    return null;
  }
  const result = await client.query<{ pass_score: number | string | null }>(
    `SELECT pass_score FROM certificates WHERE id = $1`,
    [certId],
  );
  const value = result.rows[0]?.pass_score;
  if (value === null || value === undefined) {
    return null;
  }
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

/**
 * 按题干指纹写入或消灭错题。
 * 答对只清除指纹相同的记录，不按 quiz_sessions.wrong_item_id 做同源清除。
 * 因此答对变异题不会消灭原错题，除非变异题与原题指纹完全一致。
 */
async function syncWrongItems(
  client: Queryable,
  userId: string,
  certId: string,
  questions: readonly GradableQuestion[],
): Promise<void> {
  const existing = await client.query<WrongItemRow>(
    `
      SELECT id, status, wrong_count, question_snapshot
      FROM wrong_items
      WHERE user_id = $1 AND cert_id = $2
      FOR UPDATE
    `,
    [userId, certId],
  );
  const byKey = new Map<string, WrongItemRow>();
  for (const item of existing.rows) {
    const key = keyFromSnapshot(item.question_snapshot);
    if (!key) {
      continue;
    }
    const current = byKey.get(key);
    if (!current || preferWrongItem(item, current)) {
      byKey.set(key, item);
    }
  }

  for (const question of questions) {
    const snapshot = {
      type: question.type,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
      score: question.score,
    };
    const key = wrongItemKey(snapshot);
    const match = byKey.get(key);
    if (question.outcome === 'correct') {
      if (match && match.status !== 'cleared') {
        await client.query(
          `UPDATE wrong_items SET status = 'cleared', updated_at = now() WHERE id = $1`,
          [match.id],
        );
        match.status = 'cleared';
      }
      continue;
    }
    if (!match) {
      const inserted = await client.query<{ id: string }>(
        `
          INSERT INTO wrong_items (
            id, user_id, cert_id, kp_ids, question_snapshot, status, wrong_count
          )
          VALUES ($5, $1, $2, $3::uuid[], $4::jsonb, 'pending', 1)
          RETURNING id
        `,
        [userId, certId, question.kpIds, JSON.stringify(snapshot), randomUUID()],
      );
      const id = inserted.rows[0]?.id;
      if (id) {
        byKey.set(key, {
          id,
          status: 'pending',
          wrong_count: 1,
          question_snapshot: snapshot,
        });
      }
      continue;
    }
    await client.query(
      `
        UPDATE wrong_items
        SET status = 'pending',
            wrong_count = wrong_count + 1,
            question_snapshot = $2::jsonb,
            kp_ids = $3::uuid[],
            updated_at = now()
        WHERE id = $1
      `,
      [match.id, JSON.stringify(snapshot), question.kpIds],
    );
    match.status = 'pending';
    match.wrong_count = Number(match.wrong_count) + 1;
    match.question_snapshot = snapshot;
  }
}

function preferWrongItem(next: WrongItemRow, current: WrongItemRow): boolean {
  if (next.status === 'pending' && current.status !== 'pending') {
    return true;
  }
  if (current.status === 'pending' && next.status !== 'pending') {
    return false;
  }
  return Number(next.wrong_count) > Number(current.wrong_count);
}

function wrongItemKey(snapshot: {
  type: string;
  stem: string;
  options: readonly QuizOption[];
  answer: readonly string[];
}): string {
  const options = snapshot.options
    .map((option) => `${option.id}\u0000${option.text}`)
    .join('\u0001');
  const answer = [...snapshot.answer].sort().join('\u0001');
  return `${snapshot.type}\u0002${snapshot.stem.trim()}\u0002${options}\u0002${answer}`;
}

function keyFromSnapshot(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const body = value as {
    type?: unknown;
    stem?: unknown;
    options?: unknown;
    answer?: unknown;
  };
  if (typeof body.type !== 'string' || typeof body.stem !== 'string') {
    return null;
  }
  return wrongItemKey({
    type: body.type,
    stem: body.stem,
    options: parseOptions(body.options),
    answer: parseStringArray(body.answer),
  });
}

async function attachKnowledgeNames(db: Queryable, questions: QuizQuestionView[]): Promise<void> {
  const ids = [...new Set(questions.flatMap((question) => question.kpIds ?? []))];
  if (ids.length === 0) {
    return;
  }
  const named = await db.query<{ id: string; name: string }>(
    `
      SELECT id::text AS id, name
      FROM knowledge_points
      WHERE id = ANY($1::uuid[])
    `,
    [ids],
  );
  const nameById = new Map(named.rows.map((row) => [row.id.toLowerCase(), row.name]));
  for (const question of questions) {
    if (!question.kpIds) {
      continue;
    }
    question.kpNames = question.kpIds.map((id) => nameById.get(id) ?? '');
  }
}

function reviewOf(
  type: QuizTypeCode,
  answer: unknown,
  analysis: string | null | undefined,
  selected: string[],
  score: number,
): QuizQuestionView['review'] {
  const correct = parseStringArray(answer);
  const graded = gradeSelection({ type, answer: correct, selected, score });
  return {
    answer: correct,
    analysis: typeof analysis === 'string' ? analysis : '',
    earnedScore: graded.earnedScore,
    outcome: graded.outcome,
  };
}

function readResult(row: SessionRow, questions: QuizQuestionView[]): QuizResultView {
  const submittedAt = toIso(row.submitted_at) ?? new Date(0).toISOString();
  const reason = isSubmitReason(row.submit_reason) ? row.submit_reason : 'manual';
  const stored = parseStoredResult(row.pass_snapshot);
  if (stored) {
    return { ...stored, reason: stored.reason, submittedAt };
  }
  const summary = summarizeGrades(
    questions.map((question) => ({
      score: question.score,
      earnedScore: question.review?.earnedScore ?? 0,
      outcome: question.review?.outcome ?? 'unanswered',
    })),
    null,
  );
  return { ...summary, reason, submittedAt };
}

function mapScore(row: ScoreRow): QuizScoreSummary | null {
  const stored = parseStoredResult(row.pass_snapshot);
  if (!stored) {
    return null;
  }
  const snapshot = parseSnapshot(row.pack_snapshot);
  const submittedAt = toIso(row.submitted_at);
  if (!submittedAt) {
    return null;
  }
  return {
    id: row.id,
    mode: isMode(row.mode) ? row.mode : 'practice',
    source: asSessionSource(row.source),
    certName: snapshot.certName,
    packName: snapshot.name,
    earnedScore: stored.earnedScore,
    totalScore: stored.totalScore,
    accuracy: stored.accuracy,
    scoreRate: stored.scoreRate,
    correctCount: stored.correctCount,
    questionCount: stored.questionCount,
    passed: stored.passed,
    passScore: stored.passScore,
    reason: isSubmitReason(row.submit_reason) ? row.submit_reason : stored.reason,
    submittedAt,
  };
}

type StoredResult = Omit<QuizResultView, 'submittedAt'>;

function parseStoredResult(value: unknown): StoredResult | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const body = value as Record<string, unknown>;
  const reason = body.reason;
  if (!isSubmitReason(reason)) {
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
  const parsed: Record<(typeof numbers)[number], number> = {
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
  const passed = typeof body.passed === 'boolean' ? body.passed : null;
  return {
    ...parsed,
    passed,
    passScore,
    reason,
  };
}

function readCertId(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('certId' in value)) {
    return null;
  }
  const certId = (value as { certId?: unknown }).certId;
  return typeof certId === 'string' && isUuid(certId) ? certId : null;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value: Date | string | null | undefined): string | null {
  const date = toDate(value);
  return date ? date.toISOString() : null;
}

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function isSubmitReason(value: unknown): value is QuizSubmitReason {
  return typeof value === 'string' && (QUIZ_SUBMIT_REASONS as readonly string[]).includes(value);
}

function asSessionSource(value: string): QuizSessionSource {
  return (QUIZ_SESSION_SOURCES as readonly string[]).includes(value)
    ? (value as QuizSessionSource)
    : 'normal';
}

function isQuestionSource(value: string): value is QuizQuestionView['source'] {
  return (QUESTION_SOURCES as readonly string[]).includes(value);
}

function isStatus(value: string): value is QuizSessionStatus {
  return (
    value === 'pending' ||
    value === 'generating' ||
    value === 'ready' ||
    value === 'in_progress' ||
    value === 'submitted' ||
    value === 'cancelled' ||
    value === 'failed'
  );
}
