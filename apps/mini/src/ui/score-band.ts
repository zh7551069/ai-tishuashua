import type { QuizMode } from '@tishuashua/shared';

export type ScoreBand = 'high' | 'pass' | 'low' | 'fail' | 'neutral';

export function scoreBand(input: {
  mode: QuizMode;
  passed: boolean | null;
  scoreRate: number;
}): ScoreBand {
  if (input.mode === 'exam') {
    if (input.passed === true) {
      return 'high';
    }
    if (input.passed === false) {
      return 'fail';
    }
    return 'neutral';
  }
  if (input.scoreRate >= 0.8) {
    return 'high';
  }
  if (input.passed === false || input.scoreRate < 0.6) {
    return 'low';
  }
  return 'pass';
}

export function bandHeadline(band: ScoreBand, mode: QuizMode): string {
  if (mode === 'exam') {
    if (band === 'high') {
      return '考试通过';
    }
    if (band === 'fail') {
      return '考试未通过';
    }
    return '未设及格线';
  }
  if (band === 'high') {
    return '练习高分';
  }
  if (band === 'low') {
    return '这次偏低';
  }
  return '练习及格';
}
