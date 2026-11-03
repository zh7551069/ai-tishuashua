import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  normalizeQuizRequest,
  readProcessLlmEnv,
  resolveLlmMode,
  type QuizAnswerResult,
  type QuizSessionView,
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
      types: readonly string[];
      timer: {
        enabled: boolean;
        kind?: string;
        paperMinutes?: number;
        perQuestionSeconds?: number;
      };
      mode: string;
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
    const normalized = normalizeQuizRequest(input);
    if (!normalized.ok) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        normalized.message,
      );
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
      if (normalized.settings.types.some((type) => !allowed.has(type))) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '题型不在该证书范围内',
        );
      }
      const id = randomUUID();
      await this.quizzes.insertSession(client, {
        id,
        userId,
        pack,
        settings: normalized.settings,
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

function unavailable(): ApiException {
  return new ApiException(
    HttpStatus.CONFLICT,
    ApiErrorCode.PACK_UNAVAILABLE,
    '关联证书已下架，不能出题',
  );
}
