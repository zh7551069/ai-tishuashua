import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readCertificateLatestScore } from './certificate-query';

describe('certificate latest score', () => {
  test('读已落库的得分、总分和及格，不要求整份成绩摘要', () => {
    const score = readCertificateLatestScore({
      sessionId: '11111111-1111-4111-8111-111111111111',
      submittedAt: '2026-11-01T08:30:00.000Z',
      snapshot: { earnedScore: 80, totalScore: 120, passed: true, reason: 'manual' },
    });
    assert.deepEqual(score, {
      sessionId: '11111111-1111-4111-8111-111111111111',
      earnedScore: 80,
      totalScore: 120,
      passed: true,
      submittedAt: '2026-11-01T08:30:00.000Z',
    });
  });

  test('没有数字分数、会话或时间时不编造成绩', () => {
    assert.equal(
      readCertificateLatestScore({
        sessionId: '11111111-1111-4111-8111-111111111111',
        submittedAt: '2026-11-01T08:30:00.000Z',
        snapshot: { reason: 'manual' },
      }),
      null,
    );
    assert.equal(
      readCertificateLatestScore({
        sessionId: null,
        submittedAt: '2026-11-01T08:30:00.000Z',
        snapshot: { earnedScore: 1, totalScore: 2, passed: false },
      }),
      null,
    );
    assert.equal(
      readCertificateLatestScore({
        sessionId: '11111111-1111-4111-8111-111111111111',
        submittedAt: 'not-a-date',
        snapshot: { earnedScore: 1, totalScore: 2 },
      }),
      null,
    );
  });

  test('及格标记不是布尔值时分数仍在，passed 为空', () => {
    const score = readCertificateLatestScore({
      sessionId: 'session',
      submittedAt: new Date('2026-11-02T00:00:00.000Z'),
      snapshot: { earnedScore: '40', totalScore: 100, passed: 'yes' },
    });
    assert.equal(score?.earnedScore, 40);
    assert.equal(score?.totalScore, 100);
    assert.equal(score?.passed, null);
  });
});
