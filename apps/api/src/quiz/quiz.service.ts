import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  QUIZ_DIFFICULTIES,
  QUIZ_TYPES,
  parseCreateQuizSessionRequest,
  readProcessLlmEnv,
  resolveLlmMode,
  type QuizAnswerResult,
  type QuizDifficulty,
  type QuizSessionView,
  type QuizSettings,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { holdSessionEntitlement } from '@tishuashua/shared/entitlement';
import { randomUUID } from 'node:crypto';
import { ApiException, logServerError } from '../common/api.exception';
import { DailyPlanService } from '../daily-plan/daily-plan.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { GrowthService } from '../growth/growth.service';
import { QuizQueueService } from './quiz-queue.service';
import { toQuizScoreList } from './quiz-score-list';
import { QuizRepository, type WrongCarryQuestion } from './quiz.repository';

@Injectable()
export class QuizService {
  constructor(
    @Inject(QuizRepository) private readonly quizzes: QuizRepository,
    @Inject(QuizQueueService) private readonly queue: QuizQueueService,
    @Inject(EntitlementService) private readonly entitlement: EntitlementService,
    @Inject(GrowthService) private readonly growth: GrowthService,
    @Inject(DailyPlanService) private readonly dailyPlan: DailyPlanService,
  ) {}

  async create(
    userId: string,
    input: {
      packId?: string | null;
      count?: number;
      difficulty?: string;
      types?: readonly string[];
      timer?: {
        enabled: boolean;
        kind?: string;
        paperMinutes?: number;
        perQuestionSeconds?: number;
      } | null;
      mode?: string;
      source?: string;
      intent?: string;
      knowledgePointIds?: readonly string[];
      wrongItemId?: string;
      sourceSessionId?: string;
      questionIds?: readonly string[];
    },
  ): Promise<QuizSessionView> {
    const mentionsWrongSet = input.source === 'wrongSet' || input.intent === 'wrongSet';
    if (!mentionsWrongSet) {
      const decision = resolveLlmMode(readProcessLlmEnv());
      if (decision.mode === 'missing') {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ApiErrorCode.LLM_NOT_CONFIGURED,
          decision.message,
        );
      }
    }
    const parsed = parseCreateQuizSessionRequest(input);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    const accepted = parsed.request;
    if (accepted.source === 'wrongSet') {
      const sourceSessionId = accepted.sourceSessionId;
      if (!sourceSessionId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '请指定来源场次',
        );
      }
      return this.createWrongSet(userId, {
        sourceSessionId,
        packId: input.packId ?? null,
      });
    }
    const source = accepted.source;
    const packId = input.packId;
    if (!packId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        'packId 必须是 UUID',
      );
    }

    const sessionId = await this.quizzes.transaction(async (client) => {
      const pack = await this.quizzes.loadPack(userId, packId, client);
      if (!pack) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '刷题包不存在');
      }
      if (pack.unavailable) {
        throw unavailable();
      }
      const allowed = new Set(pack.enabledQuestionTypeCodes);
      let types = accepted.settings.types;
      if (source === 'variant' && accepted.typesOmitted) {
        types = pack.enabledQuestionTypeCodes.filter(isQuizTypeCode);
        if (types.length === 0) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '该证书没有可用题型',
          );
        }
      } else if (types.some((type) => !allowed.has(type))) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '题型不在该证书范围内',
        );
      }

      let knowledgePointIds: string[] | null = null;
      let wrongItemId: string | null = null;
      if (source === 'variant') {
        const itemId = accepted.wrongItemId;
        if (!itemId) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '请指定要变异的错题',
          );
        }
        const item = await this.quizzes.findOwnedWrongItem(client, userId, itemId);
        if (!item) {
          throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '错题不存在');
        }
        if (item.certId.toLowerCase() !== pack.certId.toLowerCase()) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '刷题包与错题不属同一证书',
          );
        }
        const usable = new Set(
          await this.quizzes.usablePackKnowledgePointIds(client, pack.id, item.kpIds),
        );
        const ordered: string[] = [];
        for (const id of item.kpIds) {
          const key = id.toLowerCase();
          if (usable.has(key) && !ordered.includes(key)) {
            ordered.push(key);
          }
        }
        if (ordered.length === 0) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '没有可用的知识点，无法题型变异',
          );
        }
        knowledgePointIds = ordered;
        wrongItemId = item.id;
      } else if (accepted.knowledgePointIds) {
        const requested = accepted.knowledgePointIds;
        const usable = new Set(
          await this.quizzes.usablePackKnowledgePointIds(client, pack.id, requested),
        );
        if (requested.some((id) => !usable.has(id.toLowerCase()))) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '没有可用的知识点，无法复练同类',
          );
        }
        knowledgePointIds = requested;
      }

      const id = randomUUID();
      try {
        await holdSessionEntitlement(client, userId, source, id);
      } catch (error) {
        this.entitlement.rethrow(error);
      }
      await this.quizzes.insertSession(client, {
        id,
        userId,
        pack,
        settings: { ...accepted.settings, types },
        source,
        knowledgePointIds,
        wrongItemId,
      });
      return id;
    });

    try {
      await this.queue.enqueue({ userId, sessionId });
    } catch (error) {
      await this.quizzes.deletePending(userId, sessionId).catch(() => undefined);
      throw error;
    }
    return this.requireSession(userId, sessionId);
  }

  private async createWrongSet(
    userId: string,
    input: { sourceSessionId: string; packId: string | null },
  ): Promise<QuizSessionView> {
    const sessionId = await this.quizzes.transaction(async (client) => {
      const source = await this.quizzes.findWrongSetSource(client, userId, input.sourceSessionId);
      if (!source) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '来源场次不存在');
      }
      if (source.status !== 'submitted') {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '来源场次尚未交卷，不能再练',
        );
      }
      if (input.packId) {
        const sourcePackId = source.packId?.toLowerCase() ?? null;
        if (input.packId.toLowerCase() !== sourcePackId) {
          throw new ApiException(
            HttpStatus.BAD_REQUEST,
            ApiErrorCode.VALIDATION_ERROR,
            '刷题包与来源场次不一致',
          );
        }
      }
      const questions = await this.quizzes.listWrongCarry(client, source.id);
      if (questions.length === 0) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '没有可再练的错题',
        );
      }
      if (questions.length > 50) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, '题量不正确');
      }
      const id = randomUUID();
      try {
        const held = await holdSessionEntitlement(client, userId, 'wrongSet', id);
        if (held !== 'skipped') {
          throw new ApiException(
            HttpStatus.INTERNAL_SERVER_ERROR,
            ApiErrorCode.VALIDATION_ERROR,
            '错题再练不应扣场',
          );
        }
      } catch (error) {
        this.entitlement.rethrow(error);
      }
      await this.quizzes.insertWrongSetSession(client, {
        id,
        userId,
        packId: source.packId,
        packSnapshot: source.packSnapshot,
        settings: wrongSetSettings(source.settings, questions),
        sourceSessionId: source.id,
        questions,
      });
      return id;
    });
    return this.requireSession(userId, sessionId);
  }

  async get(userId: string, sessionId: string): Promise<QuizSessionView> {
    await this.touchExams(userId);
    return this.requireSession(userId, sessionId);
  }

  async listScores(userId: string) {
    await this.touchExams(userId);
    const page = await this.quizzes.listScores(userId);
    return toQuizScoreList(page.items, page.total);
  }

  async cancel(userId: string, sessionId: string): Promise<QuizSessionView> {
    const result = await this.quizzes.cancel(userId, sessionId);
    if (result === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    if (result === 'conflict') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ApiErrorCode.VALIDATION_ERROR,
        '当前状态不能取消',
      );
    }
    return this.requireSession(userId, sessionId);
  }

  async start(userId: string, sessionId: string): Promise<QuizSessionView> {
    await this.touchExams(userId);
    const result = await this.quizzes.start(userId, sessionId);
    if (result === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    if (result === 'conflict') {
      throw new ApiException(HttpStatus.CONFLICT, ApiErrorCode.VALIDATION_ERROR, '试卷还不能作答');
    }
    return this.requireSession(userId, sessionId);
  }

  async submit(
    userId: string,
    sessionId: string,
    reason: 'manual' | 'timeout',
  ): Promise<QuizSessionView> {
    await this.touchExams(userId);
    const before = await this.quizzes.countSubmitted(userId);
    const result = await this.quizzes.submit(userId, sessionId, reason);
    if (result === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    if (result === 'conflict') {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ApiErrorCode.VALIDATION_ERROR,
        '当前状态不能交卷',
      );
    }
    if (result === 'fresh') {
      await this.maybeFirstSubmit(userId, before);
    }
    if (result === 'fresh' || result === 'already') {
      await this.dailyPlan.recordAfterSubmit(userId, sessionId);
    }
    return this.requireSession(userId, sessionId);
  }

  async saveAnswer(
    userId: string,
    sessionId: string,
    questionId: string,
    selected: string[],
  ): Promise<QuizAnswerResult> {
    await this.touchExams(userId);
    const result = await this.quizzes.saveAnswer(userId, sessionId, questionId, selected);
    if (result.kind === 'missing') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    if (result.kind === 'question') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '题目不存在');
    }
    if (result.kind === 'conflict') {
      throw new ApiException(HttpStatus.CONFLICT, ApiErrorCode.VALIDATION_ERROR, result.message);
    }
    if (result.kind === 'invalid') {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, result.message);
    }
    return { questionId, selected: result.selected };
  }

  /** 到点收卷若形成生涯第一份成绩，补发首刷奖。失败不改变交卷结果。 */
  private async touchExams(userId: string): Promise<void> {
    const before = await this.quizzes.countSubmitted(userId);
    await this.quizzes.expireDueExams(userId);
    await this.maybeFirstSubmit(userId, before);
  }

  private async maybeFirstSubmit(userId: string, before: number): Promise<void> {
    if (before !== 0) {
      return;
    }
    try {
      const after = await this.quizzes.countSubmitted(userId);
      if (after >= 1) {
        await this.growth.onFirstSubmit(userId);
      }
    } catch (error) {
      logServerError('growth', error);
    }
  }

  private async requireSession(userId: string, sessionId: string): Promise<QuizSessionView> {
    const session = await this.quizzes.findSession(userId, sessionId);
    if (!session) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '出题会话不存在');
    }
    return session;
  }
}

function isQuizTypeCode(value: string): value is QuizTypeCode {
  return (QUIZ_TYPES as readonly string[]).includes(value);
}

function wrongSetSettings(raw: unknown, questions: readonly WrongCarryQuestion[]): QuizSettings {
  const types: QuizTypeCode[] = [];
  for (const question of questions) {
    if (!types.includes(question.type)) {
      types.push(question.type);
    }
  }
  return {
    count: questions.length,
    difficulty: readDifficulty(raw),
    types,
    timer: { enabled: false },
    mode: 'practice',
  };
}

function readDifficulty(raw: unknown): QuizDifficulty {
  if (!raw || typeof raw !== 'object' || !('difficulty' in raw)) {
    return 'medium';
  }
  const value = raw.difficulty;
  return typeof value === 'string' && (QUIZ_DIFFICULTIES as readonly string[]).includes(value)
    ? (value as QuizDifficulty)
    : 'medium';
}

function unavailable(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ApiErrorCode.PACK_UNAVAILABLE,
    '关联证书已下架，不能出题',
  );
}
