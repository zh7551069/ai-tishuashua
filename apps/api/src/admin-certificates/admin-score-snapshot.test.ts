import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readAdminStoredScore, readPackSnapshot } from './admin-score-snapshot';

const stored = {
  earnedScore: 80,
  totalScore: 100,
  correctCount: 8,
  wrongCount: 1,
  unansweredCount: 1,
  partialCount: 0,
  questionCount: 10,
  accuracy: 0.8,
  scoreRate: 0.8,
  passed: true,
  passScore: 60,
  reason: 'manual',
};

describe('admin stored score', () => {
  test('完整快照可以还原，passed 不是布尔时记为 null', () => {
    const score = readAdminStoredScore({ ...stored, passed: 'yes' });
    assert.equal(score?.earnedScore, 80);
    assert.equal(score?.passed, null);
    assert.equal(score?.passScore, 60);
    assert.equal(score?.reason, 'manual');
  });

  test('数字字符串可以还原，没有及格线时 passScore 为 null', () => {
    const score = readAdminStoredScore({
      ...stored,
      earnedScore: '80',
      passScore: null,
      reason: 'timeout',
    });
    assert.equal(score?.earnedScore, 80);
    assert.equal(score?.passScore, null);
    assert.equal(score?.reason, 'timeout');
  });

  test('缺少交卷原因或分数字段时读不出，不重新判分', () => {
    assert.equal(readAdminStoredScore({ ...stored, reason: 'late' }), null);
    assert.equal(readAdminStoredScore({ reason: 'manual' }), null);
    assert.equal(readAdminStoredScore({ ...stored, accuracy: 'nope' }), null);
    assert.equal(readAdminStoredScore(null), null);
    assert.equal(readAdminStoredScore([]), null);
  });
});

describe('admin pack snapshot names', () => {
  test('只取快照里的证书名和刷题包名', () => {
    assert.deepEqual(readPackSnapshot({ certName: '成绩甲', name: '甲包' }), {
      certName: '成绩甲',
      packName: '甲包',
    });
    assert.deepEqual(readPackSnapshot({}), { certName: '', packName: '' });
    assert.deepEqual(readPackSnapshot(null), { certName: '', packName: '' });
  });
});
