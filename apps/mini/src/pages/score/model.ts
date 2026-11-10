import {
  QUIZ_DIFFICULTY_LABELS,
  type QuizMode,
  type QuizQuestionView,
  type QuizResultView,
  type QuizSessionView,
} from '@tishuashua/shared';
import { scoreBand } from '../../ui/score-band';

/** 练习默认环、高分、过线、低分，以及考试通过 / 未过线 / 未设及格线。 */
export type ResultTone =
  | 'practice-plain'
  | 'practice-high'
  | 'practice-pass'
  | 'practice-low'
  | 'exam-pass'
  | 'exam-fail'
  | 'exam-open';

export type BannerTheme = 'green' | 'blue' | 'orange' | 'red';

export interface BannerModel {
  theme: BannerTheme;
  mark: string;
  title: string;
  detail: string;
}

export interface HeroModel {
  /** 环的进度，0 到 1。练习用正确率，考试用得分率。 */
  rate: number;
  color: string;
  center: string;
  unit: string;
  kicker: string | null;
  headline: string | null;
  correctLine: string;
  foot: string;
  footTone: 'muted' | 'green' | 'red';
}

export interface DurationModel {
  elapsed: string;
  limit: string | null;
  unlimited: boolean;
  usedPercent: number | null;
  usedText: string | null;
}

export interface KnowledgeBar {
  id: string;
  name: string;
  correct: number;
  total: number;
  /** 0 到 1。 */
  rate: number;
  weak: boolean;
  color: string;
}

export interface CelebrateModel {
  kind: 'practice' | 'exam';
  badge: string;
  title: string;
  subtitle: string;
  kicker: string;
  value: string;
  unit: string;
  foot: string;
  context: string;
}

export function resultTone(input: {
  mode: QuizMode;
  passed: boolean | null;
  scoreRate: number;
  passScore: number | null;
}): ResultTone {
  const band = scoreBand({
    mode: input.mode,
    passed: input.passed,
    scoreRate: input.scoreRate,
  });
  if (input.mode === 'exam') {
    if (band === 'high') {
      return 'exam-pass';
    }
    if (band === 'fail') {
      return 'exam-fail';
    }
    return 'exam-open';
  }
  if (band === 'high') {
    return 'practice-high';
  }
  if (band === 'low') {
    return 'practice-low';
  }
  if (input.passed === true || input.passScore !== null) {
    return 'practice-pass';
  }
  return 'practice-plain';
}

export function celebrates(tone: ResultTone): boolean {
  return tone === 'practice-high' || tone === 'exam-pass';
}

/** 与 Bridge 环色一致：≥75% 绿，≥50% 橙，其余红。 */
export function ringColor(rate: number): string {
  if (rate >= 0.75) {
    return '#4D7C0F';
  }
  if (rate >= 0.5) {
    return '#D97706';
  }
  return '#C0563C';
}

export function knowledgeBars(questions: readonly QuizQuestionView[]): KnowledgeBar[] {
  const order: string[] = [];
  const rows = new Map<string, { name: string; correct: number; total: number }>();
  for (const question of questions) {
    const ids = question.kpIds ?? [];
    if (ids.length === 0 || !question.review) {
      continue;
    }
    const names = question.kpNames ?? [];
    const correct = question.review.outcome === 'correct';
    ids.forEach((id, index) => {
      const key = id.toLowerCase();
      const named = (names[index] ?? '').trim();
      const current = rows.get(key);
      if (!current) {
        order.push(key);
        rows.set(key, { name: named || '知识点', correct: correct ? 1 : 0, total: 1 });
        return;
      }
      if (named) {
        current.name = named;
      }
      current.total += 1;
      if (correct) {
        current.correct += 1;
      }
    });
  }
  return order.map((id) => {
    const row = rows.get(id)!;
    const rate = row.total === 0 ? 0 : row.correct / row.total;
    return {
      id,
      name: row.name,
      correct: row.correct,
      total: row.total,
      rate,
      weak: row.total > 0 && rate <= 0.5,
      color: barColor(rate),
    };
  });
}

export function bannerFor(
  tone: ResultTone,
  result: QuizResultView,
  weakCount: number,
): BannerModel | null {
  const rate = percent(result.accuracy);
  if (tone === 'practice-high') {
    return {
      theme: 'green',
      mark: '★',
      title: '发挥出色',
      detail: `正确率 ${rate}%，继续保持节奏`,
    };
  }
  if (tone === 'practice-pass') {
    return {
      theme: 'blue',
      mark: '✓',
      title: '已达及格线',
      detail: weakCount > 0 ? '整体过线，弱项还能再提一截' : '整体过线，继续保持节奏',
    };
  }
  if (tone === 'practice-low') {
    return {
      theme: 'orange',
      mark: '!',
      title: '别灰心，对症复练',
      detail: lowDetail(rate, weakCount),
    };
  }
  if (tone === 'exam-pass') {
    return {
      theme: 'green',
      mark: '★',
      title: '考试通过',
      detail:
        result.passScore === null
          ? `得分 ${showNum(result.earnedScore)}`
          : `得分 ${showNum(result.earnedScore)} · 及格线 ${showNum(result.passScore)}`,
    };
  }
  if (tone === 'exam-fail') {
    const earned = result.earnedScore;
    const line = result.passScore;
    const gap = line === null ? 0 : line - earned;
    return {
      theme: 'red',
      mark: '!',
      title: '未达及格线',
      detail:
        line === null
          ? `得分 ${showNum(earned)}`
          : gap > 0
            ? `得分 ${showNum(earned)} · 距及格还差 ${showNum(gap)} 分`
            : `得分 ${showNum(earned)} · 及格线 ${showNum(line)}`,
    };
  }
  return null;
}

export function heroFor(session: QuizSessionView, tone: ResultTone): HeroModel | null {
  const result = session.result;
  if (!result) {
    return null;
  }
  const correct = result.correctCount;
  const total = result.questionCount;
  const missed = Math.max(0, total - correct);
  const correctLine = `正确 ${correct} · 错误 ${missed}`;
  const practiceRate = clamp01(result.accuracy);
  if (session.mode === 'practice') {
    const rateText = `${percent(practiceRate)}%`;
    const shared = {
      rate: practiceRate,
      color: ringColor(practiceRate),
      center: rateText,
      unit: `${correct}/${total} 题`,
      correctLine,
      foot: `难度 ${QUIZ_DIFFICULTY_LABELS[session.settings.difficulty]} · 题量 ${total}`,
      footTone: 'muted' as const,
    };
    if (tone === 'practice-plain') {
      return { ...shared, kicker: null, headline: null };
    }
    return { ...shared, kicker: '正确率', headline: rateText };
  }
  const scoreRate = clamp01(result.scoreRate);
  const earned = showNum(result.earnedScore);
  return {
    rate: scoreRate,
    color: ringColor(scoreRate),
    center: earned,
    unit: '分',
    kicker: '卷面得分',
    headline: `${earned} 分`,
    correctLine,
    foot: examFoot(result),
    footTone: result.passed === true ? 'green' : result.passed === false ? 'red' : 'muted',
  };
}

export function durationFor(session: QuizSessionView, plain: boolean): DurationModel | null {
  const result = session.result;
  if (!result || !session.startedAt) {
    return null;
  }
  const start = Date.parse(session.startedAt);
  const end = Date.parse(result.submittedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return null;
  }
  const elapsedSeconds = Math.round((end - start) / 1000);
  const limitSeconds = paperLimitSeconds(session);
  if (limitSeconds === null || limitSeconds <= 0) {
    return {
      elapsed: formatClock(elapsedSeconds),
      limit: null,
      unlimited: true,
      usedPercent: null,
      usedText: null,
    };
  }
  const used = Math.min(100, Math.round((elapsedSeconds / limitSeconds) * 100));
  return {
    elapsed: formatClock(elapsedSeconds),
    limit: formatClock(limitSeconds),
    unlimited: false,
    usedPercent: used,
    usedText: plain ? `已用限时的 ${used}%` : `已用限时 ${used}%`,
  };
}

export function celebrateFor(
  session: QuizSessionView,
  tone: ResultTone,
  weakCount: number,
  knownPoints: boolean,
): CelebrateModel | null {
  const result = session.result;
  if (!result) {
    return null;
  }
  const cert = (session.context.certName || session.context.packName || '本次刷题').trim();
  if (tone === 'practice-high') {
    return {
      kind: 'practice',
      badge: '练习高分',
      title: '太棒了！',
      subtitle: '在职备考，这一场很出色',
      kicker: '本场正确率',
      value: String(percent(result.accuracy)),
      unit: '%',
      foot: `${result.correctCount} / ${result.questionCount} 题正确`,
      context: practiceContext(cert, weakCount, knownPoints),
    };
  }
  if (tone === 'exam-pass') {
    const line = result.passScore;
    return {
      kind: 'exam',
      badge: '考试通过',
      title: '恭喜通过！',
      subtitle: '在职备考，这一关拿下了',
      kicker: '卷面得分',
      value: showNum(result.earnedScore),
      unit: '分',
      foot:
        line === null
          ? `${showNum(result.earnedScore)} 分`
          : `及格线 ${showNum(line)} · 超线 ${showNum(result.earnedScore - line)}`,
      context: `${cert} · 考试模式`,
    };
  }
  return null;
}

export function modeBadge(tone: ResultTone, mode: QuizMode): { text: string; exam: boolean } {
  if (tone === 'practice-plain') {
    return { text: '练习', exam: false };
  }
  if (mode === 'exam') {
    return { text: '考试模式', exam: true };
  }
  return { text: '练习模式', exam: false };
}

export function packLine(certName: string, packName: string, pointCount: number | null): string {
  const name = certName.trim() || packName.trim() || '刷题包';
  if (pointCount === null) {
    return name;
  }
  return `${name} · ${pointCount} 知识点`;
}

export function wrongQuestions(questions: readonly QuizQuestionView[]): QuizQuestionView[] {
  return questions.filter((question) => question.review && question.review.outcome !== 'correct');
}

function barColor(rate: number): string {
  if (rate >= 0.75) {
    return '#4D7C0F';
  }
  if (rate > 0.4) {
    return '#D97706';
  }
  return '#C0563C';
}

function lowDetail(rate: number, weakCount: number): string {
  if (weakCount >= 2) {
    return `正确率 ${rate}%，先攻最弱两项`;
  }
  if (weakCount === 1) {
    return `正确率 ${rate}%，先攻最弱一项`;
  }
  return `正确率 ${rate}%，先把错题过一遍`;
}

function examFoot(result: QuizResultView): string {
  if (result.passScore === null || result.passed === null) {
    return '未设及格线';
  }
  return `及格线 ${showNum(result.passScore)} · ${result.passed ? '已通过' : '未通过'}`;
}

function practiceContext(cert: string, weakCount: number, knownPoints: boolean): string {
  if (!knownPoints) {
    return cert;
  }
  if (weakCount === 0) {
    return `${cert} · 无薄弱知识点`;
  }
  return `${cert} · ${weakCount} 个薄弱知识点`;
}

function paperLimitSeconds(session: QuizSessionView): number | null {
  const timer = session.settings.timer;
  if (!timer.enabled) {
    return null;
  }
  if (timer.kind === 'paper') {
    return timer.paperMinutes * 60;
  }
  const count = session.result?.questionCount ?? session.settings.count;
  return timer.perQuestionSeconds * count;
}

function percent(rate: number): number {
  return Math.round(clamp01(rate) * 100);
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

function showNum(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  if (Number.isInteger(value)) {
    return String(value);
  }
  return String(Math.round(value * 10) / 10);
}

function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
