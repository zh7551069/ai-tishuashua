import { Inject, Injectable } from '@nestjs/common';
import {
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  QUIZ_TYPES,
  normalizeSelection,
  type QuizMode,
  type QuizOption,
  type QuizQuestionView,
  type QuizSessionStatus,
  type QuizSessionView,
  type QuizSettings,
  type QuizTypeCode,
} from '@tishuashua/shared';
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
  status: string;
  settings: unknown;
  question_count: number;
  generated_count: number;
  error_code: string | null;
  error_message: string | null;
  pack_snapshot: unknown;
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

  async insertSession(
    db: Queryable,
    input: {
      id: string;
      userId: string;
      pack: QuizPackRecord;
      settings: QuizSettings;
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
          id, user_id, pack_id, pack_snapshot, mode, settings, status, source, question_count, generated_count
        )
        VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, 'pending', 'normal', $7, 0)
      `,
      [
        input.id,
        input.userId,
        input.pack.id,
        JSON.stringify(snapshot),
        input.settings.mode,
        JSON.stringify(input.settings),
        input.settings.count,
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
            id, pack_id, mode, status, settings, question_count, generated_count,
            error_code, error_message, pack_snapshot
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
      const questions = visible ? await this.loadQuestions(pool, row.id) : [];
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

  async start(userId: string, sessionId: string): Promise<'missing' | 'conflict' | 'started'> {
    return this.transaction(async (client) => {
      const result = await client.query<{ status: string }>(
        `SELECT status FROM quiz_sessions WHERE id = $1 AND user_id = $2 FOR UPDATE`,
        [sessionId, userId],
      );
      const status = result.rows[0]?.status;
      if (!status) {
        return 'missing';
      }
      if (status !== 'ready' && status !== 'in_progress') {
        return 'conflict';
      }
      if (status === 'ready') {
        await client.query(
          `UPDATE quiz_sessions SET status = 'in_progress', updated_at = now() WHERE id = $1`,
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
    | { kind: 'conflict' }
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
      if (status !== 'ready' && status !== 'in_progress') {
        return { kind: 'conflict' };
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
          `UPDATE quiz_sessions SET status = 'in_progress', updated_at = now() WHERE id = $1`,
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

  private async loadQuestions(db: Queryable, sessionId: string): Promise<QuizQuestionView[]> {
    const result = await db.query<QuestionRow>(
      `
        SELECT
          q.id,
          q.ordinal,
          q.type_code,
          q.stem,
          q.options,
          q.score,
          q.source,
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
      if (!isQuizType(row.type_code) || (row.source !== 'ai' && row.source !== 'wrong_carry')) {
        continue;
      }
      questions.push({
        id: row.id,
        ordinal: Number(row.ordinal),
        type: row.type_code,
        stem: row.stem,
        options: parseOptions(row.options),
        score: Number(row.score),
        source: row.source,
        selected: parseStringArray(row.selected),
      });
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
  return {
    id: row.id,
    packId: row.pack_id,
    mode: isMode(row.mode) ? row.mode : settings.mode,
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
    (count !== 10 && count !== 20 && count !== 30 && count !== 50) ||
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
