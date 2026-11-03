import {
  ADMIN_QUIZ_SESSION_UNREADABLE_PACK,
  QUIZ_COUNTS,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  QUIZ_TYPES,
  examDeadlineAt,
  type AdminQuizSessionError,
  type AdminQuizSessionProgress,
  type QuizDifficulty,
  type QuizMode,
  type QuizSettings,
  type QuizTimer,
  type QuizTypeCode,
} from '@tishuashua/shared';

export interface AdminQuizPackSnapshot {
  packName: string;
  domainName: string | null;
  certName: string | null;
}

/** 读不出合法设置时返回 null，不拿默认值顶上，也不保留未知字段。 */
export function readQuizSettings(value: unknown): QuizSettings | null {
  const body = asRecord(value);
  if (!body) {
    return null;
  }
  const count = body.count;
  const difficulty = body.difficulty;
  const mode = body.mode;
  const types = Array.isArray(body.types) ? body.types.filter(isQuizType) : [];
  if (!isCount(count) || !isDifficulty(difficulty) || !isMode(mode) || types.length === 0) {
    return null;
  }
  const timer = readTimer(body.timer);
  if (!timer) {
    return null;
  }
  return { count, difficulty, types, timer, mode };
}

export function readPackSnapshot(value: unknown): AdminQuizPackSnapshot {
  const body = asRecord(value);
  if (!body) {
    return {
      packName: ADMIN_QUIZ_SESSION_UNREADABLE_PACK,
      domainName: null,
      certName: null,
    };
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const domainName = typeof body.domainName === 'string' ? body.domainName.trim() : '';
  const certName = typeof body.certName === 'string' ? body.certName.trim() : '';
  return {
    packName: name || ADMIN_QUIZ_SESSION_UNREADABLE_PACK,
    domainName: domainName || null,
    certName: certName || null,
  };
}

export function readProgress(
  generated: number | string,
  total: number | string,
): AdminQuizSessionProgress {
  return {
    generated: nonNegativeInt(generated),
    total: nonNegativeInt(total),
  };
}

export function readSessionError(
  code: string | null,
  message: string | null,
): AdminQuizSessionError | null {
  const trimmed = code?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  const text = message?.trim() ?? '';
  return { code: trimmed, message: text || '出题失败' };
}

/** 只有考试且设置能读出来时才给截止时间。练习为 null。 */
export function readDeadline(
  startedAt: string | null,
  settings: QuizSettings | null,
): string | null {
  if (!startedAt || !settings) {
    return null;
  }
  const start = new Date(startedAt);
  if (!Number.isFinite(start.getTime())) {
    return null;
  }
  const deadline = examDeadlineAt({
    mode: settings.mode,
    timer: settings.timer,
    startedAt: start,
    questionCount: settings.count,
  });
  return deadline ? deadline.toISOString() : null;
}

function readTimer(value: unknown): QuizTimer | null {
  const body = asRecord(value);
  if (!body) {
    return null;
  }
  if (body.enabled === false) {
    return { enabled: false };
  }
  if (body.enabled !== true) {
    return null;
  }
  if (body.kind === 'paper' && positiveInt(body.paperMinutes)) {
    return { enabled: true, kind: 'paper', paperMinutes: body.paperMinutes };
  }
  if (body.kind === 'per_question' && positiveInt(body.perQuestionSeconds)) {
    return { enabled: true, kind: 'per_question', perQuestionSeconds: body.perQuestionSeconds };
  }
  return null;
}

function positiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function nonNegativeInt(value: number | string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.floor(parsed);
}

function isCount(value: unknown): value is QuizSettings['count'] {
  return typeof value === 'number' && (QUIZ_COUNTS as readonly number[]).includes(value);
}

function isDifficulty(value: unknown): value is QuizDifficulty {
  return typeof value === 'string' && (QUIZ_DIFFICULTIES as readonly string[]).includes(value);
}

function isMode(value: unknown): value is QuizMode {
  return typeof value === 'string' && (QUIZ_MODES as readonly string[]).includes(value);
}

function isQuizType(value: unknown): value is QuizTypeCode {
  return typeof value === 'string' && (QUIZ_TYPES as readonly string[]).includes(value);
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
