import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { examDeadlineAt, gradeSelection, summarizeGrades } from '@tishuashua/shared';

describe('quiz grading', () => {
  test('单选和判断全对得分，答错或不答不得分', () => {
    assert.deepEqual(
      gradeSelection({ type: 'single', answer: ['A'], selected: ['A'], score: 10 }),
      { earnedScore: 10, outcome: 'correct' },
    );
    assert.deepEqual(
      gradeSelection({ type: 'single', answer: ['A'], selected: ['B'], score: 10 }),
      { earnedScore: 0, outcome: 'wrong' },
    );
    assert.deepEqual(gradeSelection({ type: 'judge', answer: ['T'], selected: ['T'], score: 3 }), {
      earnedScore: 3,
      outcome: 'correct',
    });
    assert.deepEqual(gradeSelection({ type: 'judge', answer: ['T'], selected: [], score: 3 }), {
      earnedScore: 0,
      outcome: 'unanswered',
    });
    assert.deepEqual(
      gradeSelection({ type: 'single', answer: ['B', 'A'], selected: ['A', 'B'], score: 4 }),
      { earnedScore: 4, outcome: 'correct' },
    );
  });

  test('多选少选得一半分，错选不得分', () => {
    assert.deepEqual(
      gradeSelection({ type: 'multi', answer: ['A', 'B'], selected: ['B', 'A'], score: 10 }),
      { earnedScore: 10, outcome: 'correct' },
    );
    assert.deepEqual(
      gradeSelection({ type: 'multi', answer: ['A', 'B', 'C'], selected: ['A'], score: 10 }),
      { earnedScore: 5, outcome: 'partial' },
    );
    assert.deepEqual(
      gradeSelection({ type: 'multi', answer: ['A', 'B'], selected: ['A'], score: 1 }),
      { earnedScore: 0, outcome: 'partial' },
    );
    assert.deepEqual(
      gradeSelection({ type: 'multi', answer: ['A', 'B'], selected: ['A', 'C'], score: 10 }),
      { earnedScore: 0, outcome: 'wrong' },
    );
    assert.deepEqual(
      gradeSelection({ type: 'multi', answer: ['A', 'B'], selected: [], score: 10 }),
      { earnedScore: 0, outcome: 'unanswered' },
    );
  });

  test('汇总正确率、得分率和及格线', () => {
    const summary = summarizeGrades(
      [
        { score: 10, earnedScore: 10, outcome: 'correct' },
        { score: 10, earnedScore: 5, outcome: 'partial' },
        { score: 10, earnedScore: 0, outcome: 'wrong' },
        { score: 10, earnedScore: 0, outcome: 'unanswered' },
      ],
      20,
    );
    assert.equal(summary.earnedScore, 15);
    assert.equal(summary.totalScore, 40);
    assert.equal(summary.correctCount, 1);
    assert.equal(summary.accuracy, 0.25);
    assert.equal(summary.scoreRate, 0.375);
    assert.equal(summary.passed, false);
    assert.equal(summary.passScore, 20);
    assert.equal(summarizeGrades([], null).passed, null);
  });

  test('只有考试模式计算截止时间', () => {
    const startedAt = new Date('2026-11-01T00:00:00.000Z');
    assert.equal(
      examDeadlineAt({
        mode: 'practice',
        timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
        startedAt,
        questionCount: 10,
      }),
      null,
    );
    assert.equal(
      examDeadlineAt({
        mode: 'exam',
        timer: { enabled: false },
        startedAt,
        questionCount: 10,
      }),
      null,
    );
    assert.equal(
      examDeadlineAt({
        mode: 'exam',
        timer: { enabled: true, kind: 'paper', paperMinutes: 30 },
        startedAt,
        questionCount: 10,
      })?.toISOString(),
      '2026-11-01T00:30:00.000Z',
    );
    assert.equal(
      examDeadlineAt({
        mode: 'exam',
        timer: { enabled: true, kind: 'per_question', perQuestionSeconds: 60 },
        startedAt,
        questionCount: 10,
      })?.toISOString(),
      '2026-11-01T00:10:00.000Z',
    );
    assert.equal(
      examDeadlineAt({
        mode: 'exam',
        timer: { enabled: true, kind: 'per_question', perQuestionSeconds: 60 },
        startedAt,
        questionCount: 0,
      }),
      null,
    );
  });
});
