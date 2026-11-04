import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  QUIZ_SCORE_LIST_LIMIT,
  QUIZ_SCORE_LIST_TRUNCATED_HINT,
  type QuizScoreSummary,
} from '@tishuashua/shared';
import { toQuizScoreList } from './quiz-score-list';

describe('成绩列表截断', () => {
  test('不超过 50 条时没有更多，页面也不提示截断', () => {
    assert.equal(QUIZ_SCORE_LIST_LIMIT, 50);
    assert.equal(QUIZ_SCORE_LIST_TRUNCATED_HINT, '只显示最近 50 条');

    const within = toQuizScoreList([score('a'), score('b')], 2);
    assert.equal(within.limit, 50);
    assert.equal(within.total, 2);
    assert.equal(within.hasMore, false);
    assert.deepEqual(
      within.items.map((item) => item.id),
      ['a', 'b'],
    );

    const exact = toQuizScoreList(
      Array.from({ length: 50 }, (_, index) => score(String(index))),
      50,
    );
    assert.equal(exact.items.length, 50);
    assert.equal(exact.total, 50);
    assert.equal(exact.hasMore, false);
  });

  test('超过 50 条时标明还有更早的记录，即使这一页因坏快照少了几条', () => {
    const page = toQuizScoreList(
      Array.from({ length: 49 }, (_, index) => score(`kept-${index}`)),
      51,
    );
    assert.equal(page.items.length, 49);
    assert.equal(page.total, 51);
    assert.equal(page.limit, 50);
    assert.equal(page.hasMore, true);
    assert.equal(page.hasMore ? QUIZ_SCORE_LIST_TRUNCATED_HINT : '', '只显示最近 50 条');
  });
});

function score(id: string): QuizScoreSummary {
  return {
    id,
    mode: 'practice',
    source: 'normal',
    certName: '证书',
    packName: '刷题包',
    earnedScore: 80,
    totalScore: 100,
    accuracy: 0.8,
    scoreRate: 0.8,
    correctCount: 8,
    questionCount: 10,
    passed: true,
    passScore: 60,
    reason: 'manual',
    submittedAt: '2026-01-01T00:00:00.000Z',
  };
}
