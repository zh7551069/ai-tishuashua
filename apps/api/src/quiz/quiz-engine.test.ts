import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ApiErrorCode,
  BUILTIN_QUIZ_PROMPT,
  WRONG_QUESTION_RATIO_MAX,
  buildPromptVariables,
  mockAiQuestions,
  normalizeQuestionScores,
  normalizeQuizRequest,
  normalizeSelection,
  parseAiQuestions,
  pickPublishedPrompt,
  renderPrompt,
  resolveLlmMode,
  takeWrongCarry,
  wrongCarryQuota,
  type PromptCandidate,
} from '@tishuashua/shared';

describe('quiz generation rules', () => {
  test('错题入卷不超过 floor(count × 50%)', () => {
    assert.equal(wrongCarryQuota(10), Math.floor(10 * WRONG_QUESTION_RATIO_MAX));
    assert.equal(wrongCarryQuota(20), 10);
    assert.equal(wrongCarryQuota(50), 25);
    assert.equal(wrongCarryQuota(0), 0);
    assert.throws(() => wrongCarryQuota(1.5), /题量不正确/);

    const pack = ['kp-1'];
    const items = Array.from({ length: 8 }, (_item, index) => wrongItem(index, ['kp-1']));
    const carried = takeWrongCarry(items, 10, pack, ['single', 'multi', 'judge']);
    assert.equal(carried.length, 5);
    assert.equal(
      carried.every((item) => item.source === 'wrong_carry'),
      true,
    );

    assert.equal(takeWrongCarry([], 10, pack, ['single']).length, 0);
    assert.equal(takeWrongCarry(items, 20, pack, ['single']).length, 8);
    assert.equal(
      takeWrongCarry([wrongItem(0, ['other-kp']), ...items], 10, pack, ['single']).length,
      5,
    );
    assert.equal(
      takeWrongCarry(
        [
          {
            id: 'bad',
            kpIds: ['kp-1'],
            snapshot: { type: 'single', stem: '', options: [], answer: [] },
          },
        ],
        10,
        pack,
        ['single'],
      ).length,
      0,
    );
    assert.equal(takeWrongCarry(items, 10, pack, ['judge']).length, 0);
  });

  test('分值按证书总分归一化', () => {
    assert.deepEqual(normalizeQuestionScores([2, 2, 2], 6), [2, 2, 2]);
    assert.deepEqual(normalizeQuestionScores([1, 1, 1], 10), [4, 3, 3]);
    assert.deepEqual(normalizeQuestionScores([5, 5], 120), [60, 60]);
    assert.deepEqual(normalizeQuestionScores([0, 0, 0], 10), [4, 3, 3]);
    const mixed = normalizeQuestionScores([9, 9, 9, 9, 9, 1, 1, 1, 1, 1], 100);
    assert.equal(
      mixed.reduce((sum, score) => sum + score, 0),
      100,
    );
    assert.notDeepEqual(mixed, [9, 9, 9, 9, 9, 1, 1, 1, 1, 1]);
    assert.throws(() => normalizeQuestionScores([1], 0), /证书总分不正确/);
  });

  test('已发布 Prompt 按证书、领域、全局取值，否则用内置模板', () => {
    const prompts: PromptCandidate[] = [
      prompt('global', null, 'published', 1, '全局'),
      prompt('domain', 'domain-1', 'published', 2, '领域'),
      prompt('domain', 'domain-1', 'draft', 9, '草稿'),
      prompt('certificate', 'cert-1', 'published', 1, '证书'),
      prompt('certificate', 'cert-1', 'published', 3, '证书新版'),
      prompt('certificate', 'cert-1', 'published', 4, ''),
    ];
    const picked = pickPublishedPrompt(prompts, { certificateId: 'cert-1', domainId: 'domain-1' });
    assert.equal(picked?.user, '证书新版');
    const domainOnly = pickPublishedPrompt(
      prompts.filter((item) => item.scope !== 'certificate'),
      { certificateId: 'cert-1', domainId: 'domain-1' },
    );
    assert.equal(domainOnly?.user, '领域');
    const globalOnly = pickPublishedPrompt(
      [prompt('global', null, 'published', 1, '全局'), prompt('global', null, 'draft', 5, '忽略')],
      { certificateId: 'cert-1', domainId: 'domain-1' },
    );
    assert.equal(globalOnly?.user, '全局');
    assert.equal(pickPublishedPrompt([], { certificateId: 'cert-1', domainId: 'domain-1' }), null);

    const rendered = renderPrompt(
      BUILTIN_QUIZ_PROMPT,
      buildPromptVariables({
        domainName: '教师资格',
        certificateName: '中学教师资格',
        totalScore: 120,
        difficulty: 'medium',
        types: ['single', 'judge'],
        count: 4,
        knowledgePoints: [{ id: 'kp-1', name: '职业理念', promptHint: '教育观' }],
        extraConstraint: '不要摘抄法条',
      }),
    );
    assert.match(rendered.user, /中学教师资格/);
    assert.match(rendered.user, /职业理念/);
    assert.match(rendered.user, /教育观/);
    assert.match(rendered.user, /不要摘抄法条/);
    assert.match(rendered.user, /中等/);
    assert.match(rendered.system, /原创/);
  });

  test('mock 题目通过 schema，坏输出会被拒绝', () => {
    const questions = mockAiQuestions({
      count: 4,
      types: ['single', 'multi', 'judge'],
      difficulty: 'hard',
      knowledgePoints: [{ id: 'kp-1', name: '法律法规', promptHint: '教育法' }],
      sessionId: '11111111-1111-4111-8111-111111111111',
    });
    const parsed = parseAiQuestions(
      { questions },
      { count: 4, types: ['single', 'multi', 'judge'], knowledgePointIds: ['kp-1'] },
    );
    assert.equal(parsed.ok, true);
    if (parsed.ok) {
      assert.deepEqual(
        parsed.questions.map((item) => item.type),
        ['single', 'multi', 'judge', 'single'],
      );
    }
    assert.equal(
      parseAiQuestions({ questions: [] }, { count: 2, types: ['single'], knowledgePointIds: [] })
        .ok,
      false,
    );
    assert.equal(
      parseAiQuestions(
        {
          questions: [
            {
              type: 'single',
              stem: '题',
              options: [
                { id: 'A', text: '甲' },
                { id: 'B', text: '乙' },
              ],
              answer: ['A', 'B'],
              score: 1,
            },
          ],
        },
        { count: 1, types: ['single'], knowledgePointIds: [] },
      ).ok,
      false,
    );
  });

  test('计时默认值与选择校验', () => {
    const paper = normalizeQuizRequest({
      count: 20,
      difficulty: 'medium',
      types: ['single'],
      timer: { enabled: true },
      mode: 'practice',
    });
    assert.equal(paper.ok, true);
    if (paper.ok) {
      assert.deepEqual(paper.settings.timer, { enabled: true, kind: 'paper', paperMinutes: 30 });
    }
    const perQuestion = normalizeQuizRequest({
      count: 10,
      difficulty: 'easy',
      types: ['judge'],
      timer: { enabled: true, kind: 'per_question' },
      mode: 'exam',
    });
    assert.equal(perQuestion.ok, true);
    if (perQuestion.ok && perQuestion.settings.timer.enabled) {
      assert.equal(perQuestion.settings.timer.kind, 'per_question');
      if (perQuestion.settings.timer.kind === 'per_question') {
        assert.equal(perQuestion.settings.timer.perQuestionSeconds, 60);
      }
    }
    assert.equal(
      normalizeQuizRequest({
        count: 10,
        difficulty: 'medium',
        types: [],
        timer: { enabled: false },
        mode: 'practice',
      }).ok,
      false,
    );
    assert.deepEqual(normalizeSelection('single', ['A', 'B'], ['A']), {
      ok: true,
      selected: ['A'],
    });
    assert.equal(normalizeSelection('single', ['A', 'B'], ['A', 'B']).ok, false);
    assert.equal(normalizeSelection('multi', ['A', 'B', 'C'], ['Z']).ok, false);
  });

  test('缺 LLM Key 必须显式打开 mock', () => {
    assert.equal(
      resolveLlmMode({ llmMock: false, llmApiKey: '', llmProvider: 'deepseek' }).mode,
      'missing',
    );
    assert.equal(
      resolveLlmMode({ llmMock: false, llmApiKey: 'sk-test', llmProvider: 'other' }).mode,
      'missing',
    );
    assert.deepEqual(resolveLlmMode({ llmMock: true, llmApiKey: '', llmProvider: '' }), {
      mode: 'mock',
    });
    assert.deepEqual(
      resolveLlmMode({ llmMock: false, llmApiKey: 'sk-test', llmProvider: 'tongyi' }),
      { mode: 'live', provider: 'tongyi' },
    );
    const missing = resolveLlmMode({ llmMock: false, llmApiKey: '', llmProvider: '' });
    assert.equal(missing.mode, 'missing');
    if (missing.mode === 'missing') {
      assert.match(missing.message, /LLM_MOCK/);
    }
    assert.equal(ApiErrorCode.LLM_NOT_CONFIGURED, 'LLM_NOT_CONFIGURED');
    assert.equal(ApiErrorCode.LLM_INVALID_OUTPUT, 'LLM_INVALID_OUTPUT');
    assert.equal(ApiErrorCode.LLM_UNAVAILABLE, 'LLM_UNAVAILABLE');
  });
});

function wrongItem(index: number, kpIds: string[]) {
  return {
    id: `wrong-${index}`,
    kpIds,
    snapshot: {
      type: 'single',
      stem: `错题${index}`,
      options: [
        { id: 'A', text: '对' },
        { id: 'B', text: '错' },
      ],
      answer: ['A'],
      analysis: '解析',
      score: 9,
    },
  };
}

function prompt(
  scope: PromptCandidate['scope'],
  scopeRefId: string | null,
  status: string,
  version: number,
  user: string,
): PromptCandidate {
  return {
    scope,
    scopeRefId,
    status,
    version,
    templates: user ? { system: '系统', user } : { system: '   ', user: '' },
  };
}
