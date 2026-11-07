import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { type LlmProvider } from './constants';
import { ApiErrorCode } from './errors';
import { LlmCallError, requestAiQuestions } from './quiz-llm';
import { questionContentKey } from './question-content-key';
import {
  BUILTIN_QUIZ_PROMPT,
  BUILTIN_QUIZ_VARIANT_PROMPT,
  buildPromptVariables,
  buildVariantPromptVariables,
  isFreeUser,
  mockAiQuestions,
  mockVariantQuestion,
  normalizeQuestionScores,
  parseAiQuestions,
  pickPublishedPrompt,
  pickPublishedVariantPrompt,
  preferVariantTypes,
  renderPrompt,
  sealVariantPrompt,
  selectBankQuestions,
  takeWrongCarry,
  type BankCandidate,
  type PaperDraft,
  type PromptCandidate,
} from './quiz-engine';
import {
  BANK_INGEST_SOURCES,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  QUIZ_SESSION_SOURCES,
  QUIZ_TYPES,
  VARIANT_QUIZ_COUNT,
  type BankIngestSource,
  type QuizDifficulty,
  type QuizMode,
  type QuizOption,
  type QuizSessionSource,
  type QuizTypeCode,
} from './quiz';
import { commitEntitlement, releaseEntitlement } from './entitlement';
import { readFreeUserBankFirst, type SettingsCache } from './system-settings';

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

export interface GenerationStats {
  wrongCarried: number;
  bankDrawn: number;
  aiGenerated: number;
}

export type GenerationOutcome =
  | { status: 'ready'; stats: GenerationStats }
  | { status: 'cancelled'; stats?: GenerationStats }
  | { status: 'skipped' }
  | { status: 'failed'; code: string; message: string; stats?: GenerationStats };

/**
 * 测试可以替身 isFreeUser，用来锁住「会员即使开关开也不抽库」。
 * 不传时读 memberships。不传 getFreeUserBankFirst 时直读 system_settings，不走缓存。
 */
export interface GenerationDeps {
  getFreeUserBankFirst?: () => Promise<boolean>;
  isFreeUser?: (user: { id: string }) => boolean | Promise<boolean>;
  settingsCache?: SettingsCache | null;
}

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
  mode: QuizMode;
  source: QuizSessionSource;
  wrongItemId: string | null;
  /**
   * null：普通出题，使用整包上架知识点。
   * 数组：会话覆盖。空数组也不得回退整包。
   */
  knowledgePointOverride: string[] | null;
  enabledTypes: QuizTypeCode[];
  certId: string;
  certStatus: string;
  totalScore: number;
  extraConstraint: string | null;
  certName: string;
  domainId: string;
  domainName: string;
  knowledgePoints: { id: string; name: string; promptHint: string; textbookId: string | null }[];
}

interface BankWriteContext {
  userId: string;
  domainId: string;
  certId: string;
  difficulty: QuizDifficulty;
  textbookByKp: ReadonlyMap<string, string | null>;
}

/**
 * 成卷只在全部题目写入且状态仍是本次 run 时变为 ready。
 * 取消或失败会删掉已写入的 PaperQuestion，不留半卷。
 * 已经写入的 question_bank 保留。
 */
export async function runQuizGeneration(
  db: SqlExecutor,
  sessionId: string,
  options: GenerationOptions,
  deps?: GenerationDeps,
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

  let stats = emptyStats();
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
    if (context.source === 'wrongSet') {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.QUIZ_GENERATION_FAILED,
        '错题再练暂未开放',
      );
    }
    if (context.knowledgePoints.length === 0) {
      return await failSession(
        db,
        sessionId,
        claim.token,
        ApiErrorCode.QUIZ_GENERATION_FAILED,
        context.knowledgePointOverride ? '没有可用的知识点，无法出题' : '刷题包没有可用知识点',
      );
    }

    const built = await buildDrafts(db, sessionId, context, options, deps);
    const drafts = built.drafts;
    stats = built.stats;
    const bankWrite = bankWriteContext(context);
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
      const inserted = await insertQuestion(
        db,
        sessionId,
        claim.token,
        index + 1,
        draft,
        score,
        bankWrite,
      );
      if (!inserted) {
        return withStats(await stopWithoutPaper(db, sessionId, claim.token), stats);
      }
    }

    const ready = await markReady(
      db,
      sessionId,
      claim.token,
      drafts.length,
      context.totalScore,
      stats,
    );
    if (!ready) {
      return withStats(await stopWithoutPaper(db, sessionId, claim.token), stats);
    }
    return { status: 'ready', stats };
  } catch (error) {
    const mapped = mapGenerationError(error);
    return withStats(
      await failSession(db, sessionId, claim.token, mapped.code, mapped.message),
      stats,
    );
  }
}

async function buildDrafts(
  db: SqlExecutor,
  sessionId: string,
  context: GenerationContext,
  options: Exclude<GenerationOptions, { mode: 'unconfigured' }>,
  deps: GenerationDeps | undefined,
): Promise<{ drafts: PaperDraft[]; stats: GenerationStats }> {
  if (context.source === 'variant') {
    if (context.mode !== 'practice' || context.questionCount !== VARIANT_QUIZ_COUNT) {
      throw new Error('题型变异只能练习且只有 1 题');
    }
    return {
      drafts: [await requestVariantQuestion(db, sessionId, context, options)],
      stats: { wrongCarried: 0, bankDrawn: 0, aiGenerated: 1 },
    };
  }
  const wrongItems = await loadWrongItems(db, context.userId, context.certId);
  const carry = takeWrongCarry(
    wrongItems,
    context.questionCount,
    context.knowledgePoints.map((item) => item.id),
    context.types,
  );
  const need = context.questionCount - carry.length;
  if (need < 0) {
    throw new Error('错题配额超过题量');
  }
  const freeFirst = await resolveFreeUserBankFirst(db, context.userId, deps);
  const bank = freeFirst && need > 0 ? await drawFromBank(db, sessionId, context, need, carry) : [];
  const aiNeed = need - bank.length;
  const aiQuestions =
    aiNeed === 0 ? [] : await requestOriginalQuestions(db, sessionId, context, options, aiNeed);
  const drafts: PaperDraft[] = [
    ...carry,
    ...bank,
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
  return {
    drafts,
    stats: {
      wrongCarried: carry.length,
      bankDrawn: bank.length,
      aiGenerated: aiQuestions.length,
    },
  };
}

async function resolveFreeUserBankFirst(
  db: SqlExecutor,
  userId: string,
  deps: GenerationDeps | undefined,
): Promise<boolean> {
  const enabled = deps?.getFreeUserBankFirst
    ? await deps.getFreeUserBankFirst()
    : await readFreeUserBankFirst(db, deps?.settingsCache ?? null);
  const probe = deps?.isFreeUser ?? ((user: { id: string }) => isFreeUser(user, db));
  const free = await probe({ id: userId });
  return enabled && free;
}

async function drawFromBank(
  db: SqlQueryable,
  sessionId: string,
  context: GenerationContext,
  need: number,
  carry: readonly PaperDraft[],
): Promise<PaperDraft[]> {
  const seen = await loadSeenContentKeys(db, context.userId);
  const usedContentKeys = new Set(
    carry.map((draft) =>
      questionContentKey({
        type: draft.type,
        stem: draft.stem,
        options: draft.options,
        answer: draft.answer,
      }),
    ),
  );
  const usedStems = new Set(carry.map((draft) => draft.stem.trim()));
  const sessionKpIds = context.knowledgePoints.map((item) => item.id);
  const loaded = await db.query(
    `
      SELECT id, kp_ids, type_code, stem, options, answer, analysis, difficulty, content_key
      FROM question_bank
      WHERE certificate_id = $1
        AND status = 'online'
        AND type_code = ANY($2::text[])
        AND kp_ids && $3::uuid[]
    `,
    [context.certId, context.types, sessionKpIds],
  );
  const candidates: BankCandidate[] = [];
  for (const item of loaded.rows) {
    const row = item as {
      id: string;
      kp_ids: string[] | null;
      type_code: string;
      stem: string;
      options: unknown;
      answer: unknown;
      analysis: string | null;
      difficulty: string | null;
      content_key: unknown;
    };
    const parsed = parseStoredQuestion(row.type_code, row.stem, row.options, row.answer);
    const contentKey = contentKeyText(row.content_key);
    if (!parsed || !contentKey) {
      continue;
    }
    candidates.push({
      id: row.id,
      kpIds: row.kp_ids ?? [],
      type: parsed.type,
      stem: parsed.stem,
      options: parsed.options,
      answer: parsed.answer,
      analysis: typeof row.analysis === 'string' ? row.analysis : '',
      difficulty: isDifficulty(row.difficulty) ? row.difficulty : null,
      contentKey,
    });
  }
  return selectBankQuestions({
    need,
    sessionId,
    difficulty: context.difficulty,
    types: context.types,
    sessionKpIds,
    seenContentKeys: seen,
    usedContentKeys,
    usedStems,
    candidates,
  }).map((row) => ({
    type: row.type,
    stem: row.stem,
    options: row.options,
    answer: row.answer,
    analysis: row.analysis,
    score: 1,
    knowledgePointIds: row.kpIds.map((id) => id.toLowerCase()),
    source: 'bank' as const,
    bankQuestionId: row.id,
  }));
}

/** 近 30 天已交卷，并上该用户最近 3 场已交卷。窗口内的题干指纹不再抽。 */
async function loadSeenContentKeys(db: SqlQueryable, userId: string): Promise<Set<string>> {
  const result = await db.query(
    `
      SELECT pq.type_code, pq.stem, pq.options, pq.answer
      FROM paper_questions pq
      JOIN quiz_sessions s ON s.id = pq.session_id
      WHERE s.user_id = $1
        AND s.status = 'submitted'
        AND s.submitted_at IS NOT NULL
        AND (
          s.submitted_at >= now() - interval '30 days'
          OR s.id IN (
            SELECT id
            FROM quiz_sessions
            WHERE user_id = $1
              AND status = 'submitted'
              AND submitted_at IS NOT NULL
            ORDER BY submitted_at DESC, id DESC
            LIMIT 3
          )
        )
    `,
    [userId],
  );
  const seen = new Set<string>();
  for (const item of result.rows) {
    const row = item as {
      type_code: string;
      stem: string;
      options: unknown;
      answer: unknown;
    };
    const parsed = parseStoredQuestion(row.type_code, row.stem, row.options, row.answer);
    if (!parsed) {
      continue;
    }
    seen.add(
      questionContentKey({
        type: parsed.type,
        stem: parsed.stem,
        options: parsed.options,
        answer: parsed.answer,
      }),
    );
  }
  return seen;
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

/**
 * 题型变异。输入只有错题快照（不含标准答案）和知识点名称。
 * VARIANT_PATH_START
 * 不读课件、不读向量、不带 wrong_carry。
 */
async function requestVariantQuestion(
  db: SqlExecutor,
  sessionId: string,
  context: GenerationContext,
  options: Exclude<GenerationOptions, { mode: 'unconfigured' }>,
): Promise<PaperDraft> {
  const wrong = await loadVariantSource(db, context.userId, context.wrongItemId);
  if (!wrong) {
    throw new Error('错题不存在，不能变异');
  }
  const allowed = preferVariantTypes(
    intersectTypes(context.types, context.enabledTypes),
    wrong.type,
  );
  if (allowed.length === 0) {
    throw new Error('没有可用题型');
  }
  const prompts = await loadPrompts(db, context.certId, context.domainId);
  const template = sealVariantPrompt(
    pickPublishedVariantPrompt(prompts, {
      certificateId: context.certId,
      domainId: context.domainId,
    }) ?? BUILTIN_QUIZ_VARIANT_PROMPT,
  );
  const rendered = renderPrompt(
    template,
    buildVariantPromptVariables({
      domainName: context.domainName,
      certificateName: context.certName,
      totalScore: context.totalScore,
      difficulty: context.difficulty,
      types: allowed,
      count: VARIANT_QUIZ_COUNT,
      knowledgePoints: context.knowledgePoints,
      extraConstraint: context.extraConstraint,
      originalType: wrong.type ? wrong.type : '未知',
      originalStem: wrong.stem,
      originalOptions: wrong.optionsText,
    }),
  );
  const raw =
    options.mode === 'mock'
      ? {
          questions: [
            mockVariantQuestion({
              sessionId,
              originalStem: wrong.stem,
              originalType: wrong.type,
              types: allowed,
              difficulty: context.difficulty,
              knowledgePoints: context.knowledgePoints,
            }),
          ],
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
    count: VARIANT_QUIZ_COUNT,
    types: allowed,
    knowledgePointIds: context.knowledgePoints.map((item) => item.id),
  });
  if (!parsed.ok) {
    throw new LlmCallError(ApiErrorCode.LLM_INVALID_OUTPUT, parsed.message);
  }
  const question = parsed.questions[0];
  if (!question || question.stem.trim() === wrong.stem.trim()) {
    throw new LlmCallError(ApiErrorCode.LLM_INVALID_OUTPUT, '题干不得与原题相同');
  }
  return {
    type: question.type,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    analysis: question.analysis,
    score: question.score,
    knowledgePointIds: question.knowledgePointId ? [question.knowledgePointId] : [],
    source: 'ai_variant',
  };
}
// VARIANT_PATH_END

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
        s.mode,
        s.source,
        s.wrong_item_id,
        s.knowledge_point_ids,
        c.id AS cert_id,
        c.status AS cert_status,
        c.total_score,
        c.extra_constraint,
        c.enabled_question_type_codes,
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
        mode: string | null;
        source: string | null;
        wrong_item_id: string | null;
        knowledge_point_ids: string[] | null;
        cert_id: string | null;
        cert_status: string | null;
        total_score: number | string | null;
        extra_constraint: string | null;
        enabled_question_type_codes: string[] | null;
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
  const source = readStoredSource(row.source);
  const mode = readStoredMode(row.mode);
  if (!mode) {
    return null;
  }
  // retrain_similar / variant 即使列为 null，也用空覆盖集，禁止回退整包。
  const knowledgePointOverride =
    source === 'retrain_similar' || source === 'variant'
      ? (normalizeIdList(row.knowledge_point_ids) ?? [])
      : source === 'normal'
        ? normalizeIdList(row.knowledge_point_ids)
        : [];
  const knowledge = await db.query(
    `
      SELECT kp.id, kp.name, kp.prompt_hint, kp.textbook_id
      FROM pack_knowledge_points pkp
      JOIN knowledge_points kp ON kp.id = pkp.knowledge_point_id
      WHERE pkp.pack_id = $1
        AND kp.kind = 'knowledge_point'
        AND kp.status = 'online'
        AND ($2::uuid[] IS NULL OR kp.id = ANY($2::uuid[]))
      ORDER BY pkp.position
    `,
    [row.pack_id, knowledgePointOverride],
  );
  return {
    userId: row.user_id,
    packId: row.pack_id,
    questionCount: Number(row.question_count),
    difficulty: settings.difficulty,
    types: settings.types,
    mode,
    source,
    wrongItemId: row.wrong_item_id,
    knowledgePointOverride,
    enabledTypes: (row.enabled_question_type_codes ?? []).filter(isQuizType),
    certId: row.cert_id,
    certStatus: row.cert_status ?? 'offline',
    totalScore: Number(row.total_score),
    extraConstraint: row.extra_constraint,
    certName: row.cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    knowledgePoints: knowledge.rows.map((item) => {
      const point = item as {
        id: string;
        name: string;
        prompt_hint: string;
        textbook_id: string | null;
      };
      return {
        id: point.id,
        name: point.name,
        promptHint: point.prompt_hint,
        textbookId: point.textbook_id ? point.textbook_id.toLowerCase() : null,
      };
    }),
  };
}

/**
 * 变异输入只取错题快照的题型、题干和选项。不选取 answer / analysis。
 * 不连接课件或向量表。
 */
async function loadVariantSource(
  db: SqlQueryable,
  userId: string,
  wrongItemId: string | null,
): Promise<{ type: QuizTypeCode | null; stem: string; optionsText: string } | null> {
  if (!wrongItemId) {
    return null;
  }
  const result = await db.query(
    `
      SELECT question_snapshot
      FROM wrong_items
      WHERE id = $1 AND user_id = $2
    `,
    [wrongItemId, userId],
  );
  const row = result.rows[0] as { question_snapshot: unknown } | undefined;
  if (!row) {
    return null;
  }
  return readVariantSnapshot(row.question_snapshot);
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
  bankWrite: BankWriteContext,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const row = await lockSession(tx, sessionId);
    if (!row || row.status !== 'generating' || row.runToken !== token) {
      return false;
    }
    const bankQuestionId = await resolveBankQuestionId(tx, sessionId, draft, bankWrite);
    await tx.query(
      `
        INSERT INTO paper_questions (
          id, session_id, ordinal, type_code, stem, options, answer, analysis, kp_ids, source, score,
          bank_question_id
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::uuid[], $10, $11, $12)
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
        bankQuestionId,
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
  stats: GenerationStats,
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
            generation_stats = $4::jsonb,
            updated_at = now()
        WHERE id = $1
      `,
      [sessionId, total, Math.round(totalScore), JSON.stringify(stats)],
    );
    await commitEntitlement(tx, sessionId);
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
    await releaseEntitlement(tx, sessionId);
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
    await releaseEntitlement(tx, sessionId);
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

/** 只删本会话试卷。不删 question_bank。 */
async function deleteQuestions(db: SqlQueryable, sessionId: string): Promise<void> {
  await db.query(`DELETE FROM paper_questions WHERE session_id = $1`, [sessionId]);
}

async function resolveBankQuestionId(
  db: SqlQueryable,
  sessionId: string,
  draft: PaperDraft,
  bankWrite: BankWriteContext,
): Promise<string | null> {
  if (draft.source === 'bank') {
    if (!draft.bankQuestionId) {
      throw new Error('题库题缺少引用');
    }
    return draft.bankQuestionId;
  }
  if (draft.source === 'ai' || draft.source === 'ai_variant') {
    return persistQuestionBank(db, sessionId, draft, bankWrite, draft.source);
  }
  const existing = await lookupBankId(db, bankWrite.certId, contentKeyOf(draft));
  if (existing && draft.wrongItemId && isUuid(draft.wrongItemId)) {
    await db.query(
      `
        UPDATE wrong_items
        SET bank_question_id = $2
        WHERE id = $1 AND user_id = $3 AND bank_question_id IS NULL
      `,
      [draft.wrongItemId, existing, bankWrite.userId],
    );
  }
  return existing;
}

async function persistQuestionBank(
  db: SqlQueryable,
  sessionId: string,
  draft: PaperDraft,
  bankWrite: BankWriteContext,
  source: BankIngestSource,
): Promise<string> {
  const kpId = draft.knowledgePointIds[0]?.toLowerCase();
  if (!kpId) {
    throw new Error('题目缺少知识点');
  }
  if (!(BANK_INGEST_SOURCES as readonly string[]).includes(source)) {
    throw new Error('题库来源不正确');
  }
  const contentKey = contentKeyOf(draft);
  const inserted = await db.query(
    `
      INSERT INTO question_bank (
        id, domain_id, certificate_id, textbook_id, kp_ids, type_code, stem,
        options, answer, analysis, difficulty, source, content_key,
        origin_session_id, origin_user_id, status
      )
      VALUES (
        $1, $2, $3, $4, $5::uuid[], $6, $7,
        $8::jsonb, $9::jsonb, $10, $11, $12, $13,
        $14, $15, 'online'
      )
      ON CONFLICT (certificate_id, content_key) DO NOTHING
      RETURNING id
    `,
    [
      randomUUID(),
      bankWrite.domainId,
      bankWrite.certId,
      bankWrite.textbookByKp.get(kpId) ?? null,
      draft.knowledgePointIds,
      draft.type,
      draft.stem,
      JSON.stringify(draft.options),
      JSON.stringify(draft.answer),
      draft.analysis || null,
      bankWrite.difficulty,
      source,
      contentKey,
      sessionId,
      bankWrite.userId,
    ],
  );
  const created = inserted.rows[0] as { id: string } | undefined;
  if (created?.id) {
    return created.id;
  }
  const existing = await lookupBankId(db, bankWrite.certId, contentKey);
  if (!existing) {
    throw new Error('题库写入失败');
  }
  return existing;
}

async function lookupBankId(
  db: SqlQueryable,
  certId: string,
  contentKey: Buffer,
): Promise<string | null> {
  const result = await db.query(
    `
      SELECT id
      FROM question_bank
      WHERE certificate_id = $1 AND content_key = $2
      LIMIT 1
    `,
    [certId, contentKey],
  );
  const row = result.rows[0] as { id: string } | undefined;
  return row?.id ?? null;
}

function bankWriteContext(context: GenerationContext): BankWriteContext {
  return {
    userId: context.userId,
    domainId: context.domainId,
    certId: context.certId,
    difficulty: context.difficulty,
    textbookByKp: new Map(
      context.knowledgePoints.map((item) => [item.id.toLowerCase(), item.textbookId]),
    ),
  };
}

function contentKeyOf(draft: PaperDraft): Buffer {
  return Buffer.from(
    questionContentKey({
      type: draft.type,
      stem: draft.stem,
      options: draft.options,
      answer: draft.answer,
    }),
    'utf8',
  );
}

function contentKeyText(value: unknown): string | null {
  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString('utf8');
  }
  if (typeof value === 'string' && value.startsWith('\\x')) {
    return Buffer.from(value.slice(2), 'hex').toString('utf8');
  }
  if (typeof value === 'string') {
    return value;
  }
  return null;
}

function parseStoredQuestion(
  type: string,
  stem: string,
  options: unknown,
  answer: unknown,
): { type: QuizTypeCode; stem: string; options: QuizOption[]; answer: string[] } | null {
  if (!isQuizType(type) || typeof stem !== 'string' || stem.trim().length === 0) {
    return null;
  }
  if (!Array.isArray(options)) {
    return null;
  }
  const parsedOptions: QuizOption[] = [];
  for (const item of options) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
    if (!id || !text) {
      return null;
    }
    parsedOptions.push({ id, text });
  }
  if (!Array.isArray(answer) || parsedOptions.length === 0) {
    return null;
  }
  const parsedAnswer = answer.filter((item): item is string => typeof item === 'string');
  if (parsedAnswer.length !== answer.length || parsedAnswer.length === 0) {
    return null;
  }
  return { type, stem, options: parsedOptions, answer: parsedAnswer };
}

function withStats(outcome: GenerationOutcome, stats: GenerationStats): GenerationOutcome {
  if (outcome.status === 'skipped') {
    return outcome;
  }
  return { ...outcome, stats };
}

function emptyStats(): GenerationStats {
  return { wrongCarried: 0, bankDrawn: 0, aiGenerated: 0 };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

function intersectTypes(
  requested: readonly QuizTypeCode[],
  enabled: readonly QuizTypeCode[],
): QuizTypeCode[] {
  if (enabled.length === 0) {
    return [...requested];
  }
  const open = new Set(enabled);
  return requested.filter((type) => open.has(type));
}

function readStoredSource(value: string | null): QuizSessionSource {
  return typeof value === 'string' && (QUIZ_SESSION_SOURCES as readonly string[]).includes(value)
    ? (value as QuizSessionSource)
    : 'normal';
}

function readStoredMode(value: string | null): QuizMode | null {
  return typeof value === 'string' && (QUIZ_MODES as readonly string[]).includes(value)
    ? (value as QuizMode)
    : null;
}

function normalizeIdList(value: string[] | null): string[] | null {
  if (!value) {
    return null;
  }
  return value.map((id) => id.toLowerCase());
}

function readVariantSnapshot(value: unknown): {
  type: QuizTypeCode | null;
  stem: string;
  optionsText: string;
} {
  if (!value || typeof value !== 'object') {
    return { type: null, stem: '', optionsText: '（无）' };
  }
  const body = value as { type?: unknown; stem?: unknown; options?: unknown };
  const type = isQuizType(body.type) ? body.type : null;
  const stem = typeof body.stem === 'string' ? body.stem.trim() : '';
  return { type, stem, optionsText: formatOptions(body.options) };
}

function formatOptions(value: unknown): string {
  if (!Array.isArray(value) || value.length === 0) {
    return '（无）';
  }
  const lines: string[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const option = item as Partial<QuizOption>;
    if (typeof option.id !== 'string' || typeof option.text !== 'string') {
      continue;
    }
    lines.push(`${option.id}. ${option.text}`);
  }
  return lines.length > 0 ? lines.join('\n') : '（无）';
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
