import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  QUIZ_TYPES,
  parseCreateQuizSessionRequest,
  readProcessLlmEnv,
  resolveLlmMode,
  type QuizAnswerResult,
  type QuizSessionView,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import { ApiException } from '../common/api.exception';
import { QuizQueueService } from './quiz-queue.service';
import { toQuizScoreList } from './quiz-score-list';
import { QuizRepository } from './quiz.repository';

@Injectable()
export class QuizService {
  constructor(
    @Inject(QuizRepository) private readonly quizzes: QuizRepository,
    @Inject(QuizQueueService) private readonly queue: QuizQueueService,
  ) {}

  async create(
    userId: string,
    input: {
      packId: string;
      count: number;
      difficulty: string;
      types?: readonly string[];
      timer: {
        enabled: boolean;
        kind?: string;
        paperMinutes?: number;
        perQuestionSeconds?: number;
      };
      mode: string;
      source?: string;
      intent?: string;
      knowledgePointIds?: readonly string[];
      wrongItemId?: string;
    },
  ): Promise<QuizSessionView> {
    const decision = resolveLlmMode(readProcessLlmEnv());
    if (decision.mode === 'missing') {
      throw new ApiException(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.LLM_NOT_CONFIGURED,
        decision.message,
      );
    }
    const parsed = parseCreateQuizSessionRequest(input);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }

    const sessionId = await this.quizzes.transaction(async (client) => {
      const pack = await this.quizzes.loadPack(userId, input.packId, client);
      if (!pack) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '刷题包不存在');
      }
      if (pack.unavailable) {
        throw unavailable();
      }
      const allowed = new Set(pack.enabledQuestionTypeCodes);
      let types = parsed.request.settings.types;
      if (parsed.request.source === 'variant' && parsed.request.typesOmitted) {
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
      if (parsed.request.source === 'variant') {
        const itemId = parsed.request.wrongItemId;
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
      } else if (parsed.request.knowledgePointIds) {
        const requested = parsed.request.knowledgePointIds;
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
      await this.quizzes.insertSession(client, {
        id,
        userId,
        pack,
        settings: { ...parsed.request.settings, types },
        source: parsed.request.source,
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

  async get(userId: string, sessionId: string): Promise<QuizSessionView> {
    await this.quizzes.expireDueExams(userId);
    return this.requireSession(userId, sessionId);
  }

  async listScores(userId: string) {
    await this.quizzes.expireDueExams(userId);
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
    await this.quizzes.expireDueExams(userId);
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
    await this.quizzes.expireDueExams(userId);
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
    return this.requireSession(userId, sessionId);
  }

  async saveAnswer(
    userId: string,
    sessionId: string,
    questionId: string,
    selected: string[],
  ): Promise<QuizAnswerResult> {
    await this.quizzes.expireDueExams(userId);
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

function unavailable(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ApiErrorCode.PACK_UNAVAILABLE,
    '关联证书已下架，不能出题',
  );
}
