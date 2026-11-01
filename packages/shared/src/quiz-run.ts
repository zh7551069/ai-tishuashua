import { randomUUID } from 'node:crypto';
import { type LlmProvider } from './constants';
import { ApiErrorCode } from './errors';
import { LlmCallError, requestAiQuestions } from './quiz-llm';
import {
  BUILTIN_QUIZ_PROMPT,
  buildPromptVariables,
  mockAiQuestions,
  normalizeQuestionScores,
  parseAiQuestions,
  pickPublishedPrompt,
  renderPrompt,
  takeWrongCarry,
  type PaperDraft,
  type PromptCandidate,
} from './quiz-engine';
import { QUIZ_DIFFICULTIES, QUIZ_TYPES, type QuizDifficulty, type QuizTypeCode } from './quiz';

interface QueryResultLike {
  rows: unknown[];
  rowCount?: number | null;
}

export interface SqlQueryable {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>;
}

export interface SqlExecutor extends SqlQueryable {
  transaction<T>(fn: (tx: SqlQueryable) => Promise<T>): Promise<T>;
}

interface PgClientLike extends SqlQueryable {
  release(): void;
}

interface PgPoolLike extends SqlQueryable {
  connect(): Promise<PgClientLike>;
}

export function createPgExecutor(pool: PgPoolLike): SqlExecutor {
  return {
    query: (sql, params) => pool.query(sql, params),
    transaction: async (fn) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export type GenerationOutcome =
  | { status: 'ready' }
  | { status: 'cancelled' }
  | { status: 'skipped' }
  | { status: 'failed'; code: string; message: string };

export type GenerationOptions =
  | { mode: 'mock'; beforePersist?: (ordinal: number) => Promise<void> }
  | { mode: 'unconfigured'; message: string }
  | {
      mode: 'live';
      provider: LlmProvider;
      apiKey: string;
      baseUrl: string;
      beforePersist?: (ordinal: number) => Promise<void>;
      completeAi?: (prompt: { system: string; user: string }) => Promise<unknown>;
      fetchImpl?: typeof fetch;
    };

interface SessionLock {
  status: string;
  runToken: string | null;
  errorCode: string | null;
  errorMessage: string | null;
}

interface GenerationContext {
  userId: string;
  packId: string;
  questionCount: number;
  difficulty: QuizDifficulty;
  types: QuizTypeCode[];
  certId: string;
  certStatus: string;
  totalScore: number;
  extraConstraint: string | null;
  certName: string;
  domainId: string;
  domainName: string;
  knowledgePoints: { id: string; name: string; promptHint: string }[];
}

/**
 * 成卷只在全部题目写入且状态仍是本次 run 时变为 ready。
 * 取消或失败会删掉已写入的 PaperQuestion，不留半卷。
 */
export async function runQuizGeneration(
  db: SqlExecutor,
  sessionId: string,
  options: GenerationOptions,
): Promise<GenerationOutcome> {
  const claim = await claimSession(db, sessionId);
  if (claim.kind === 'failed') {
    return { status: 'failed', code: claim.code, message: claim.message };
  }
  if (claim.kind === 'missing') {
    return { status: 'failed', code: ApiErrorCode.NOT_FOUND, message: '出题会话不存在' };
  }
  if (claim.kind !== 'go') {
    return { status: claim.kind };
  }

  try {
    if (options.mode === 'unconfigured') {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.LLM_NOT_CONFIGURED,
        options.message,
      );
    }
    const context = await loadContext(db, sessionId);
    if (!context) {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.QUIZ_GENERATION_FAILED,
        '刷题包已删除，不能出题',
      );
    }
    if (context.certStatus !== 'online') {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.PACK_UNAVAILABLE,
        '关联证书已下架，不能出题',
      );
    }
    if (context.knowledgePoints.length === 0) {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.QUIZ_GENERATION_FAILED,
        '刷题包没有可用知识点',
      );
    }

    const drafts = await buildDrafts(db, sessionId, context, options);
    const scores = normalizeQuestionScores(
      drafts.map((draft) => draft.score),
      context.totalScore,
    );
    for (let index = 0; index < drafts.length; index += 1) {
      const draft = drafts[index];
      const score = scores[index];
      if (!draft || score === undefined) {
        return await failSession(
          db,
          sessionId,
          claim.token,
          ApiErrorCode.QUIZ_GENERATION_FAILED,
          '组卷结果不完整',
        );
      }
      if (options.beforePersist) {
        await options.beforePersist(index + 1);
      }
      const inserted = await insertQuestion(db, sessionId, claim.token, index + 1, draft, score);
      if (!inserted) {
        return await stopWithoutPaper(db, sessionId, claim.token);
      }
    }

    const ready = await markReady(db, sessionId, claim.token, drafts.length, context.totalScore);
    if (!ready) {
      return await stopWithoutPaper(db, sessionId, claim.token);
    }
    return { status: 'ready' };
  } catch (error) {
    const mapped = mapGenerationError(error);
    return failSession(db, sessionId, claim.token, mapped.code, mapped.message);
  }
}

async function buildDrafts(
  db: SqlExecutor,
  sessionId: string,
  context: GenerationContext,
  options: Exclude<GenerationOptions, { mode: 'unconfigured' }>,
): Promise<PaperDraft[]> {
  const wrongItems = await loadWrongItems(db, context.userId, context.certId);
  const carry = takeWrongCarry(
    wrongItems,
    context.questionCount,
    context.knowledgePoints.map((item) => item.id),
    context.types,
  );
  const aiCount = context.questionCount - carry.length;
  if (aiCount < 0) {
    throw new Error('错题配额超过题量');
  }
  const aiQuestions =
    aiCount === 0 ? [] : await requestOriginalQuestions(db, sessionId, context, options, aiCount);
  const drafts: PaperDraft[] = [
    ...carry,
    ...aiQuestions.map((question) => ({
      type: question.type,
      stem: question.stem,
      options: question.options,
      answer: question.answer,
      analysis: question.analysis,
      score: question.score,
      knowledgePointIds: question.knowledgePointId ? [question.knowledgePointId] : [],
      source: 'ai' as const,
    })),
  ];
  const stems = new Set<string>();
  for (const draft of drafts) {
    if (stems.has(draft.stem)) {
      throw new LlmCallError(ApiErrorCode.LLM_INVALID_OUTPUT, '题干重复');
    }
    stems.add(draft.stem);
  }
  if (drafts.length !== context.questionCount) {
    throw new Error('组卷题量不正确');
  }
  return drafts;
}

async function requestOriginalQuestions(
  db: SqlExecutor,
  sessionId: string,
  context: GenerationContext,
  options: Exclude<GenerationOptions, { mode: 'unconfigured' }>,
  aiCount: number,
) {
  const prompts = await loadPrompts(db, context.certId, context.domainId);
  const template =
    pickPublishedPrompt(prompts, { certificateId: context.certId, domainId: context.domainId }) ??
    BUILTIN_QUIZ_PROMPT;
  const rendered = renderPrompt(
    template,
    buildPromptVariables({
      domainName: context.domainName,
      certificateName: context.certName,
      totalScore: context.totalScore,
      difficulty: context.difficulty,
      types: context.types,
      count: aiCount,
      knowledgePoints: context.knowledgePoints,
      extraConstraint: context.extraConstraint,
    }),
  );
  const raw =
    options.mode === 'mock'
      ? {
          questions: mockAiQuestions({
            count: aiCount,
            types: context.types,
            difficulty: context.difficulty,
            knowledgePoints: context.knowledgePoints,
            sessionId,
          }),
        }
      : options.completeAi
        ? await options.completeAi(rendered)
        : await requestAiQuestions({
            provider: options.provider,
            apiKey: options.apiKey,
            baseUrl: options.baseUrl,
            system: rendered.system,
            user: rendered.user,
            fetchImpl: options.fetchImpl,
          });
  const parsed = parseAiQuestions(raw, {
    count: aiCount,
    types: context.types,
    knowledgePointIds: context.knowledgePoints.map((item) => item.id),
  });
  if (!parsed.ok) {
    throw new LlmCallError(ApiErrorCode.LLM_INVALID_OUTPUT, parsed.message);
  }
  return parsed.questions;
}

async function claimSession(
  db: SqlExecutor,
  sessionId: string,
): Promise<
  | { kind: 'go'; token: string }
  | { kind: 'cancelled' }
  | { kind: 'skipped' }
  | { kind: 'missing' }
  | { kind: 'failed'; code: string; message: string }
> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row) {
      return { kind: 'missing' };
    }
    if (row.status === 'cancelled') {
      await deleteQuestions(tx, sessionId);
      return { kind: 'cancelled' };
    }
    if (row.status === 'ready' || row.status === 'in_progress' || row.status === 'submitted') {
      return { kind: 'skipped' };
    }
    if (row.status === 'failed') {
      return {
        kind: 'failed',
        code: row.errorCode || ApiErrorCode.QUIZ_GENERATION_FAILED,
        message: row.errorMessage || '出题失败',
      };
    }
    if (row.status !== 'pending' && row.status !== 'generating') {
      return { kind: 'skipped' };
    }
    const token = randomUUID();
    await tx.query(
      `
        UPDATE quiz_sessions
        SET status = 'generating',
            run_token = $2,
            generated_count = 0,
            error_code = NULL,
            error_message = NULL,
            updated_at = now()
        WHERE id = $1
      `,
      [sessionId, token],
    );
    await deleteQuestions(tx, sessionId);
    return { kind: 'go', token };
  });
}

async function loadContext(db: SqlQueryable, sessionId: string): Promise<GenerationContext | null> {
  const result = await db.query(
    `
      SELECT
        s.user_id,
        s.pack_id,
        s.question_count,
        s.settings,
        c.id AS cert_id,
        c.status AS cert_status,
        c.total_score,
        c.extra_constraint,
        c.name AS cert_name,
        d.id AS domain_id,
        d.name AS domain_name
      FROM quiz_sessions s
      LEFT JOIN packs p ON p.id = s.pack_id
      LEFT JOIN certificates c ON c.id = p.cert_id
      LEFT JOIN domains d ON d.id = p.domain_id
      WHERE s.id = $1
    `,
    [sessionId],
  );
  const row = result.rows[0] as
    | {
        user_id: string;
        pack_id: string | null;
        question_count: number;
        settings: unknown;
        cert_id: string | null;
        cert_status: string | null;
        total_score: number | string | null;
        extra_constraint: string | null;
        cert_name: string | null;
        domain_id: string | null;
        domain_name: string | null;
      }
    | undefined;
  if (!row?.pack_id || !row.cert_id || !row.domain_id || !row.cert_name || !row.domain_name) {
    return null;
  }
  const settings = readSettings(row.settings);
  if (!settings) {
    return null;
  }
  const knowledge = await db.query(
    `
      SELECT kp.id, kp.name, kp.prompt_hint
      FROM pack_knowledge_points pkp
      JOIN knowledge_points kp ON kp.id = pkp.knowledge_point_id
      WHERE pkp.pack_id = $1
        AND kp.kind = 'knowledge_point'
        AND kp.status = 'online'
      ORDER BY pkp.position
    `,
    [row.pack_id],
  );
  return {
    userId: row.user_id,
    packId: row.pack_id,
    questionCount: Number(row.question_count),
    difficulty: settings.difficulty,
    types: settings.types,
    certId: row.cert_id,
    certStatus: row.cert_status ?? 'offline',
    totalScore: Number(row.total_score),
    extraConstraint: row.extra_constraint,
    certName: row.cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    knowledgePoints: knowledge.rows.map((item) => {
      const point = item as { id: string; name: string; prompt_hint: string };
      return { id: point.id, name: point.name, promptHint: point.prompt_hint };
    }),
  };
}

async function loadPrompts(
  db: SqlQueryable,
  certId: string,
  domainId: string,
): Promise<PromptCandidate[]> {
  const result = await db.query(
    `
      SELECT scope, scope_ref_id, templates, version, status
      FROM prompt_templates
      WHERE status = 'published'
        AND (
          (scope = 'certificate' AND scope_ref_id = $1)
          OR (scope = 'domain' AND scope_ref_id = $2)
          OR (scope = 'global' AND scope_ref_id IS NULL)
        )
    `,
    [certId, domainId],
  );
  return result.rows.map((item) => {
    const row = item as {
      scope: PromptCandidate['scope'];
      scope_ref_id: string | null;
      templates: PromptCandidate['templates'];
      version: number;
      status: string;
    };
    return {
      scope: row.scope,
      scopeRefId: row.scope_ref_id,
      templates: row.templates ?? {},
      version: Number(row.version),
      status: row.status,
    };
  });
}

async function loadWrongItems(db: SqlQueryable, userId: string, certId: string) {
  const result = await db.query(
    `
      SELECT id, kp_ids, question_snapshot
      FROM wrong_items
      WHERE user_id = $1 AND cert_id = $2 AND status = 'pending'
      ORDER BY wrong_count DESC, updated_at DESC, id
      LIMIT 200
    `,
    [userId, certId],
  );
  return result.rows.map((item) => {
    const row = item as { id: string; kp_ids: string[] | null; question_snapshot: unknown };
    return {
      id: row.id,
      kpIds: row.kp_ids ?? [],
      snapshot: row.question_snapshot,
    };
  });
}

async function insertQuestion(
  db: SqlExecutor,
  sessionId: string,
  token: string,
  ordinal: number,
  draft: PaperDraft,
  score: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row || row.status !== 'generating' || row.runToken !== token) {
      return false;
    }
    await tx.query(
      `
        INSERT INTO paper_questions (
          id, session_id, ordinal, type_code, stem, options, answer, analysis, kp_ids, source, score
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::uuid[], $10, $11)
      `,
      [
        randomUUID(),
        sessionId,
        ordinal,
        draft.type,
        draft.stem,
        JSON.stringify(draft.options),
        JSON.stringify(draft.answer),
        draft.analysis || null,
        draft.knowledgePointIds,
        draft.source,
        score,
      ],
    );
    await tx.query(
      `UPDATE quiz_sessions SET generated_count = $2, updated_at = now() WHERE id = $1`,
      [sessionId, ordinal],
    );
    return true;
  });
}

async function markReady(
  db: SqlExecutor,
  sessionId: string,
  token: string,
  total: number,
  totalScore: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row || row.status !== 'generating' || row.runToken !== token) {
      return false;
    }
    const count = await tx.query(
      `SELECT count(*)::int AS count FROM paper_questions WHERE session_id = $1`,
      [sessionId],
    );
    const written = Number((count.rows[0] as { count: number } | undefined)?.count ?? 0);
    if (written !== total) {
      return false;
    }
    await tx.query(
      `
        UPDATE quiz_sessions
        SET status = 'ready',
            generated_count = $2,
            run_token = NULL,
            error_code = NULL,
            error_message = NULL,
            pack_snapshot = pack_snapshot || jsonb_build_object('totalScore', $3::int),
            updated_at = now()
        WHERE id = $1
      `,
      [sessionId, total, Math.round(totalScore)],
    );
    return true;
  });
}

async function stopWithoutPaper(
  db: SqlExecutor,
  sessionId: string,
  token: string,
): Promise<GenerationOutcome> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row) {
      return { status: 'failed', code: ApiErrorCode.NOT_FOUND, message: '出题会话不存在' };
    }
    if (row.runToken && row.runToken !== token) {
      return { status: 'skipped' };
    }
    if (row.status === 'ready' || row.status === 'in_progress' || row.status === 'submitted') {
      return { status: 'skipped' };
    }
    await deleteQuestions(tx, sessionId);
    if (row.status === 'cancelled') {
      return { status: 'cancelled' };
    }
    const safeMessage = '出题未完成，已丢弃未完成的试卷';
    await tx.query(
      `
        UPDATE quiz_sessions
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            run_token = NULL,
            generated_count = 0,
            updated_at = now()
        WHERE id = $1
      `,
      [sessionId, ApiErrorCode.QUIZ_GENERATION_FAILED, safeMessage],
    );
    return { status: 'failed', code: ApiErrorCode.QUIZ_GENERATION_FAILED, message: safeMessage };
  });
}

async function failSession(
  db: SqlExecutor,
  sessionId: string,
  token: string,
  code: string,
  message: string,
): Promise<GenerationOutcome> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row) {
      return { status: 'failed', code: ApiErrorCode.NOT_FOUND, message: '出题会话不存在' };
    }
    if (row.status === 'cancelled') {
      await deleteQuestions(tx, sessionId);
      return { status: 'cancelled' };
    }
    if (row.runToken && row.runToken !== token) {
      return { status: 'skipped' };
    }
    if (row.status === 'ready' || row.status === 'in_progress' || row.status === 'submitted') {
      return { status: 'skipped' };
    }
    await deleteQuestions(tx, sessionId);
    const safeMessage = message.trim().slice(0, 400) || '出题失败';
    await tx.query(
      `
        UPDATE quiz_sessions
        SET status = 'failed',
            error_code = $2,
            error_message = $3,
            run_token = NULL,
            generated_count = 0,
            updated_at = now()
        WHERE id = $1
      `,
      [sessionId, code, safeMessage],
    );
    return { status: 'failed', code, message: safeMessage };
  });
}

async function lockSession(db: SqlQueryable, sessionId: string): Promise<SessionLock | null> {
  const result = await db.query(
    `
      SELECT status, run_token::text AS run_token, error_code, error_message
      FROM quiz_sessions
      WHERE id = $1
      FOR UPDATE
    `,
    [sessionId],
  );
  const row = result.rows[0] as
    | {
        status: string;
        run_token: string | null;
        error_code: string | null;
        error_message: string | null;
      }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    status: row.status,
    runToken: row.run_token,
    errorCode: row.error_code,
    errorMessage: row.error_message,
  };
}

async function deleteQuestions(db: SqlQueryable, sessionId: string): Promise<void> {
  await db.query(`DELETE FROM paper_questions WHERE session_id = $1`, [sessionId]);
}

function readSettings(
  value: unknown,
): { difficulty: QuizDifficulty; types: QuizTypeCode[] } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const settings = value as { difficulty?: unknown; types?: unknown };
  if (!isDifficulty(settings.difficulty) || !Array.isArray(settings.types)) {
    return null;
  }
  const types = settings.types.filter(isQuizType);
  if (types.length === 0 || types.length !== settings.types.length) {
    return null;
  }
  return { difficulty: settings.difficulty, types };
}

function mapGenerationError(error: unknown): { code: string; message: string } {
  if (error instanceof LlmCallError) {
    return { code: error.code, message: error.message };
  }
  return { code: ApiErrorCode.QUIZ_GENERATION_FAILED, message: '出题失败' };
}

function isDifficulty(value: unknown): value is QuizDifficulty {
  return typeof value === 'string' && (QUIZ_DIFFICULTIES as readonly string[]).includes(value);
}

function isQuizType(value: unknown): value is QuizTypeCode {
  return typeof value === 'string' && (QUIZ_TYPES as readonly string[]).includes(value);
}
