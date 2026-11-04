import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ApiErrorCode,
  BUILTIN_QUIZ_PROMPT,
  BUILTIN_QUIZ_VARIANT_PROMPT,
  WRONG_QUESTION_RATIO_MAX,
  buildPromptVariables,
  buildVariantPromptVariables,
  mockAiQuestions,
  mockVariantQuestion,
  normalizeQuestionScores,
  normalizeQuizRequest,
  normalizeSelection,
  parseAiQuestions,
  parseCreateQuizSessionRequest,
  pickPublishedPrompt,
  pickPublishedVariantPrompt,
  preferVariantTypes,
  renderPrompt,
  resolveLlmMode,
  sealVariantPrompt,
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

  test('创建会话校验：wrongSet 拒绝，变异题量与模式钉死，intent 冲突 400', () => {
    const base = {
      count: 10,
      difficulty: 'medium',
      types: ['single', 'multi'],
      timer: { enabled: false },
      mode: 'practice',
    };
    const wrongSet = parseCreateQuizSessionRequest({ ...base, source: 'wrongSet' });
    assert.equal(wrongSet.ok, false);
    if (!wrongSet.ok) {
      assert.match(wrongSet.message, /暂未开放/);
    }
    const variantCount = parseCreateQuizSessionRequest({
      ...base,
      source: 'variant',
      count: 10,
      wrongItemId: KP,
    });
    assert.equal(variantCount.ok, false);
    if (!variantCount.ok) {
      assert.match(variantCount.message, /只能出 1 道题/);
    }
    const variantExam = parseCreateQuizSessionRequest({
      ...base,
      source: 'variant',
      count: 1,
      mode: 'exam',
      wrongItemId: KP,
    });
    assert.equal(variantExam.ok, false);
    if (!variantExam.ok) {
      assert.match(variantExam.message, /仅支持练习/);
    }
    const missingWrong = parseCreateQuizSessionRequest({
      ...base,
      source: 'variant',
      count: 1,
    });
    assert.equal(missingWrong.ok, false);
    const normalWithWrong = parseCreateQuizSessionRequest({ ...base, wrongItemId: KP });
    assert.equal(normalWithWrong.ok, false);
    if (!normalWithWrong.ok) {
      assert.equal(normalWithWrong.message, 'wrongItemId 仅用于 variant');
    }
    const conflict = parseCreateQuizSessionRequest({
      ...base,
      source: 'normal',
      intent: 'retrain_similar',
    });
    assert.equal(conflict.ok, false);
    if (!conflict.ok) {
      assert.equal(conflict.message, 'source 与 intent 不一致');
    }
    const emptyRetrain = parseCreateQuizSessionRequest({
      ...base,
      source: 'retrain_similar',
      knowledgePointIds: [],
    });
    assert.equal(emptyRetrain.ok, false);
    if (!emptyRetrain.ok) {
      assert.match(emptyRetrain.message, /没有可用的知识点/);
    }
    const retrain = parseCreateQuizSessionRequest({
      ...base,
      intent: 'retrain_similar',
      mode: 'exam',
      knowledgePointIds: [KP, KP],
    });
    assert.equal(retrain.ok, true);
    if (retrain.ok) {
      assert.equal(retrain.request.source, 'retrain_similar');
      assert.deepEqual(retrain.request.knowledgePointIds, [KP]);
      assert.equal(retrain.request.settings.mode, 'exam');
      assert.equal(retrain.request.wrongItemId, null);
    }
    const variant = parseCreateQuizSessionRequest({
      ...base,
      source: 'variant',
      count: 1,
      wrongItemId: KP,
      knowledgePointIds: [KP],
    });
    assert.equal(variant.ok, true);
    if (variant.ok) {
      assert.equal(variant.request.settings.count, 1);
      assert.equal(variant.request.knowledgePointIds, null);
      assert.equal(variant.request.typesOmitted, false);
      assert.equal(variant.request.wrongItemId, KP);
    }
    const omittedTypes = parseCreateQuizSessionRequest({
      count: 1,
      difficulty: 'medium',
      timer: { enabled: false },
      mode: 'practice',
      source: 'variant',
      wrongItemId: KP,
    });
    assert.equal(omittedTypes.ok, true);
    if (omittedTypes.ok) {
      assert.equal(omittedTypes.request.typesOmitted, true);
      assert.deepEqual(omittedTypes.request.settings.types, []);
    }
  });

  test('变异题型优先异于原题，Prompt 证书覆盖优先，且用户提示不含标准答案', () => {
    assert.deepEqual(preferVariantTypes(['single', 'multi', 'judge'], 'single'), [
      'multi',
      'judge',
      'single',
    ]);
    assert.deepEqual(preferVariantTypes(['single'], 'single'), ['single']);
    const mocked = mockVariantQuestion({
      sessionId: '11111111-1111-4111-8111-111111111111',
      originalStem: '原题干',
      originalType: 'single',
      types: ['single', 'multi'],
      difficulty: 'medium',
      knowledgePoints: [{ id: KP, name: '职业理念', promptHint: '教育观' }],
    });
    assert.equal(mocked.type, 'multi');
    assert.notEqual(mocked.stem, '原题干');
    assert.match(mocked.stem, /11111111/);
    const parsed = parseAiQuestions(
      { questions: [mocked] },
      { count: 1, types: ['single', 'multi'], knowledgePointIds: [KP] },
    );
    assert.equal(parsed.ok, true);

    const prompts: PromptCandidate[] = [
      prompt('global', null, 'published', 1, '全局普通'),
      {
        scope: 'global',
        scopeRefId: null,
        status: 'published',
        version: 2,
        templates: { variant: { system: '全局变异', user: '全局变异用户' } },
      },
      {
        scope: 'certificate',
        scopeRefId: 'cert-1',
        status: 'published',
        version: 1,
        templates: {
          system: '普通证书',
          user: '普通证书用户',
          variant: { system: '证书变异', user: '证书变异用户 {{originalStem}}' },
        },
      },
    ];
    const picked = pickPublishedVariantPrompt(prompts, {
      certificateId: 'cert-1',
      domainId: 'domain-1',
    });
    assert.equal(picked?.user, '证书变异用户 {{originalStem}}');
    const globalOnly = pickPublishedVariantPrompt(
      prompts.filter((item) => item.scope !== 'certificate'),
      { certificateId: 'cert-1', domainId: 'domain-1' },
    );
    assert.equal(globalOnly?.system, '全局变异');
    assert.equal(
      pickPublishedVariantPrompt([prompt('certificate', 'cert-1', 'published', 1, '没有变异键')], {
        certificateId: 'cert-1',
        domainId: 'domain-1',
      }),
      null,
    );

    const sealed = sealVariantPrompt({ system: '证书变异', user: '只改写' });
    assert.match(sealed.system, /不得检索或引用教材全文/);
    assert.match(sealed.system, /题干不得与原题干相同/);
    assert.equal(
      sealVariantPrompt(BUILTIN_QUIZ_VARIANT_PROMPT).system,
      BUILTIN_QUIZ_VARIANT_PROMPT.system,
    );

    const rendered = renderPrompt(
      BUILTIN_QUIZ_VARIANT_PROMPT,
      buildVariantPromptVariables({
        domainName: '教师资格',
        certificateName: '中学教师资格',
        totalScore: 100,
        difficulty: 'medium',
        types: ['multi', 'single'],
        count: 1,
        knowledgePoints: [{ id: KP, name: '职业理念', promptHint: '教育观' }],
        extraConstraint: null,
        originalType: '单选',
        originalStem: '原题干正文',
        originalOptions: 'A. 甲\nB. 乙',
      }),
    );
    assert.match(rendered.user, /原题干正文/);
    assert.match(rendered.user, /职业理念/);
    assert.equal(rendered.user.includes('VARIANT_ANALYSIS_SENTINEL'), false);
    assert.match(rendered.system, /不得检索或引用教材全文/);
    assert.equal(
      'answer' in
        buildVariantPromptVariables({
          domainName: '领域',
          certificateName: '证书',
          totalScore: 100,
          difficulty: 'easy',
          types: ['judge'],
          count: 1,
          knowledgePoints: [],
          extraConstraint: null,
          originalType: '判断',
          originalStem: '题',
          originalOptions: 'T. 正确',
        }),
      false,
    );

    const source = readFileSync(
      join(__dirname, '../../../../packages/shared/src/quiz-run.ts'),
      'utf8',
    );
    const variantCall = source.slice(
      source.indexOf('VARIANT_PATH_START'),
      source.indexOf('VARIANT_PATH_END'),
    );
    const loader = [
      source.slice(
        source.indexOf('async function loadVariantSource'),
        source.indexOf('async function loadPrompts'),
      ),
      source.slice(
        source.indexOf('function readVariantSnapshot'),
        source.indexOf('function formatOptions'),
      ),
    ].join('\n');
    assert.ok(variantCall.length > 0 && loader.length > 0);
    assert.equal(/embedding|user_uploads|courseware|vector/i.test(variantCall), false);
    assert.equal(/embedding|user_uploads|courseware|vector/i.test(loader), false);
    assert.match(loader, /FROM wrong_items/);
    assert.equal(loader.includes('answer'), false);
    assert.match(source, /禁止回退整包/);
  });
});

const KP = '11111111-1111-4111-8111-111111111111';

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
