import {
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_TYPE_LABELS,
  QUIZ_TYPES,
  type QuizDifficulty,
  type QuizTypeCode,
} from '@tishuashua/shared';

export interface QuizSettingsFooterInput {
  types: readonly QuizTypeCode[];
  count: number;
  difficulty: QuizDifficulty;
  timerOn: boolean;
  timerKind: 'paper' | 'per_question';
  paperMinutes: number;
  perQuestionSeconds: number;
}

/** 底栏摘要。未选题型只出提示；每题限时按秒，不把秒值写成分钟。 */
export function quizSettingsFooterLine(input: QuizSettingsFooterInput): {
  kind: 'alert' | 'summary';
  text: string;
} {
  if (input.types.length === 0) {
    return { kind: 'alert', text: '请先选择题型' };
  }
  const typeText = QUIZ_TYPES.filter((code) => input.types.includes(code))
    .map((code) => QUIZ_TYPE_LABELS[code])
    .join('、');
  const timerText = !input.timerOn
    ? '不限时'
    : input.timerKind === 'paper'
      ? `整卷倒计时 ${input.paperMinutes} 分钟`
      : `每题限时 ${input.perQuestionSeconds} 秒`;
  return {
    kind: 'summary',
    text: `${input.count} 题 · ${QUIZ_DIFFICULTY_LABELS[input.difficulty]} · ${typeText} · ${timerText}`,
  };
}
