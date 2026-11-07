import assert from 'node:assert/strict';
import test from 'node:test';
import type { QuizMode, QuizScoreSummary } from '@tishuashua/shared';
import { buildInsight, countRecords, filterRecords, formatRecordWhen, recordCard } from './records';

const NOW = new Date('2026-11-01T16:00:00+08:00');

test('Bridge 样例：综合评分 71，强弱项和四条知识点', () => {
  const insight = buildInsight(bridgeItems(), NOW);
  assert.ok(insight);
  assert.equal(insight.scope, '近 7 天 · FDE / 机器学习基础');
  assert.equal(insight.score, 71);
  assert.equal(insight.headline, '整体中上，弱项可突击');
  assert.equal(insight.strong, '✓  模型评估、业务需求分析扎实');
  assert.equal(insight.weak, '!  学习范式、页面生成与交付偏弱');
  assert.deepEqual(
    insight.bars.map((bar) => [bar.name, bar.percent, bar.tone]),
    [
      ['模型评估', 90, 'good'],
      ['业务需求分析', 80, 'good'],
      ['学习范式', 58, 'weak'],
      ['页面生成与交付', 55, 'weak'],
    ],
  );
});

test('筛选数字和列表一致，练习帧只留练习', () => {
  const items = bridgeItems();
  assert.deepEqual(countRecords(items), { all: 6, practice: 4, exam: 2 });
  const practice = filterRecords(items, 'practice');
  assert.equal(practice.length, 4);
  assert.ok(practice.every((item) => item.mode === 'practice'));
  assert.equal(filterRecords(items, 'exam').length, 2);
  assert.equal(filterRecords(items, 'all').length, 6);
});

test('练习卡用正确率，考试卡用得分，时间不编时长', () => {
  const items = bridgeItems();
  const practice = recordCard(items[0]!, NOW);
  assert.equal(practice.title, 'FDE · 业务需求分析');
  assert.equal(practice.badge, '练习');
  assert.equal(practice.score, '80%');
  assert.equal(practice.tone, 'good');
  assert.equal(practice.meta, '今天 14:32 · 8/10');
  const exam = recordCard(items[1]!, NOW);
  assert.equal(exam.badge, '考试');
  assert.equal(exam.score, '72分');
  assert.equal(exam.tone, 'good');
  assert.equal(exam.meta, '今天 09:15 · 36/50');
  const low = recordCard(items[3]!, NOW);
  assert.equal(low.score, '58分');
  assert.equal(low.tone, 'weak');
  assert.equal(formatRecordWhen(items[2]!.submittedAt, NOW), '昨天 21:08');
  assert.equal(formatRecordWhen(items[5]!.submittedAt, NOW), '10月25日 19:22');
});

test('七天外的记录仍出点评，范围改成全部记录', () => {
  const old = score({
    id: 'old',
    submittedAt: '2026-09-01T10:00:00+08:00',
    certName: 'FDE',
    packName: '旧包',
    scoreRate: 0.4,
    accuracy: 0.4,
    earnedScore: 4,
    totalScore: 10,
    correctCount: 4,
    questionCount: 10,
  });
  const insight = buildInsight([old], NOW);
  assert.ok(insight);
  assert.equal(insight.scope, '全部记录 · FDE');
  assert.equal(insight.score, 40);
  assert.equal(insight.headline, '整体偏弱，优先补弱项');
  assert.equal(insight.strong, null);
  assert.equal(insight.weak, '!  旧包偏弱');
});

test('近 7 天有记录时，更早的成绩不进综合评分', () => {
  const recent = score({
    id: 'new',
    submittedAt: '2026-11-01T10:00:00+08:00',
    scoreRate: 0.9,
    accuracy: 0.9,
    earnedScore: 9,
    totalScore: 10,
    correctCount: 9,
    questionCount: 10,
    certName: 'FDE',
    packName: '新包',
  });
  const old = score({
    id: 'old',
    submittedAt: '2026-09-01T10:00:00+08:00',
    scoreRate: 0.1,
    accuracy: 0.1,
    earnedScore: 1,
    totalScore: 10,
    correctCount: 1,
    questionCount: 10,
    certName: '旧证',
    packName: '旧包',
  });
  const insight = buildInsight([recent, old], NOW);
  assert.ok(insight);
  assert.equal(insight.score, 90);
  assert.equal(insight.scope, '近 7 天 · FDE');
  assert.equal(insight.bars.length, 1);
  assert.equal(insight.bars[0]?.name, '新包');
});

test('没有成绩时不出点评', () => {
  assert.equal(buildInsight([], NOW), null);
});

function bridgeItems(): QuizScoreSummary[] {
  return [
    score({
      id: 'p1',
      mode: 'practice',
      submittedAt: '2026-11-01T14:32:00+08:00',
      certName: 'FDE',
      packName: '业务需求分析',
      accuracy: 0.8,
      scoreRate: 0.8,
      earnedScore: 8,
      totalScore: 10,
      correctCount: 8,
      questionCount: 10,
    }),
    score({
      id: 'e1',
      mode: 'exam',
      submittedAt: '2026-11-01T09:15:00+08:00',
      certName: 'FDE',
      packName: '部署与运维',
      accuracy: 36 / 50,
      scoreRate: 0.72,
      earnedScore: 72,
      totalScore: 100,
      correctCount: 36,
      questionCount: 50,
    }),
    score({
      id: 'p2',
      mode: 'practice',
      submittedAt: '2026-10-31T21:08:00+08:00',
      certName: '机器学习基础',
      packName: '模型评估',
      accuracy: 0.9,
      scoreRate: 0.9,
      earnedScore: 9,
      totalScore: 10,
      correctCount: 9,
      questionCount: 10,
    }),
    score({
      id: 'e2',
      mode: 'exam',
      submittedAt: '2026-10-28T20:40:00+08:00',
      certName: '机器学习基础',
      packName: '学习范式',
      accuracy: 23 / 40,
      scoreRate: 0.58,
      earnedScore: 58,
      totalScore: 100,
      correctCount: 23,
      questionCount: 40,
    }),
    score({
      id: 'p3',
      mode: 'practice',
      submittedAt: '2026-10-27T12:05:00+08:00',
      certName: 'FDE',
      packName: 'AI工具链',
      accuracy: 0.7,
      scoreRate: 0.7,
      earnedScore: 14,
      totalScore: 20,
      correctCount: 14,
      questionCount: 20,
    }),
    score({
      id: 'p4',
      mode: 'practice',
      submittedAt: '2026-10-25T19:22:00+08:00',
      certName: 'FDE',
      packName: '页面生成与交付',
      accuracy: 0.55,
      scoreRate: 0.55,
      earnedScore: 11,
      totalScore: 20,
      correctCount: 11,
      questionCount: 20,
    }),
  ];
}

function score(partial: Partial<QuizScoreSummary> & { id: string }): QuizScoreSummary {
  return {
    mode: 'practice' satisfies QuizMode,
    source: 'normal',
    certName: '',
    packName: '',
    earnedScore: 0,
    totalScore: 0,
    accuracy: 0,
    scoreRate: 0,
    correctCount: 0,
    questionCount: 0,
    passed: null,
    passScore: null,
    reason: 'manual',
    submittedAt: NOW.toISOString(),
    ...partial,
  };
}
