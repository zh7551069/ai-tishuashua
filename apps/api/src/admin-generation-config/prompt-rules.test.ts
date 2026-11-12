import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import {
  parseCertTypeConfigWrite,
  parsePromptCreate,
  parseQuestionTypeCreate,
  parseQuestionTypeUpdate,
  validatePromptPublish,
  type NormalizedPromptTemplates,
} from '@tishuashua/shared';

const base: NormalizedPromptTemplates = {
  system: '你是出题助手',
  user: '请为「{{certificateName}}」出 {{count}} 道题。',
  variant: null,
};

describe('TB-11 prompt and question type rules', () => {
  test('未知占位符不能发布，声明了但没用只告警', () => {
    const unknown = validatePromptPublish(
      { ...base, user: '出现 {{foo}}' },
      [],
    );
    assert.equal(unknown.ok, false);
    if (!unknown.ok) {
      assert.match(unknown.message, /\{\{foo\}\}/);
    }
    const unused = validatePromptPublish(base, ['certificateName', 'count', 'domainName']);
    assert.equal(unused.ok, true);
    if (unused.ok) {
      assert.match(unused.warnings[0] ?? '', /domainName/);
    }
  });

  test('没有 variant 时变异占位符不能发布', () => {
    const result = validatePromptPublish(
      { ...base, user: '原题干 {{originalStem}}' },
      [],
    );
    assert.equal(result.ok, false);
  });

  test('含 variant 时允许变异占位符', () => {
    const result = validatePromptPublish(
      {
        ...base,
        variant: { system: '变异', user: '原题干 {{originalStem}}' },
      },
      [],
    );
    assert.equal(result.ok, true);
  });

  test('题型 code 不一致和未登记渲染器在解析阶段拒绝', () => {
    const changed = parseQuestionTypeUpdate({ code: 'fill', name: '填空' });
    assert.equal(changed.ok, true);
    const enabled = parseQuestionTypeCreate({
      code: 'fill',
      name: '填空',
      optionStructure: { selection: 'text' },
      appRendererKey: 'fill',
      gradingRuleBrief: '暂不判分',
      enabled: true,
    });
    assert.equal(enabled.ok, false);
    const draft = parseQuestionTypeCreate({
      code: 'fill',
      name: '填空',
      optionStructure: { selection: 'text' },
      appRendererKey: 'fill',
      gradingRuleBrief: '暂不判分',
    });
    assert.equal(draft.ok, true);
    if (draft.ok) {
      assert.equal(draft.value.enabled, false);
    }
  });

  test('默认参数不接受证书启用子集', () => {
    const rejected = parseCertTypeConfigWrite({
      items: [],
      enabledQuestionTypeCodes: ['single'],
    });
    assert.equal(rejected.ok, false);
    const accepted = parseCertTypeConfigWrite([
      {
        questionTypeCode: 'single',
        defaultSelected: true,
        minCount: 1,
        maxCount: 4,
        defaultCountShare: 40,
        scorePerQuestion: 2,
      },
    ]);
    assert.equal(accepted.ok, true);
  });

  test('创建草稿要求 code 和 scope', () => {
    const missing = parsePromptCreate({ name: '模板', scope: 'global' });
    assert.equal(missing.ok, false);
    const created = parsePromptCreate({
      name: '模板',
      code: 'gen_demo',
      scope: 'global',
      systemPrompt: '系统',
      userPromptTemplate: '{{certificateName}}',
    });
    assert.equal(created.ok, true);
    if (created.ok) {
      assert.equal(created.value.scopeRefId, null);
    }
  });

  test('迁移接在 TB-12 之后，并回填两条种子', () => {
    const sql = readFileSync(
      join(__dirname, '../../migrations/017_admin_followup_tb11_prompts.sql'),
      'utf8',
    );
    assert.match(sql, /prompt_template_versions/);
    assert.match(sql, /cert_question_type_configs/);
    assert.match(sql, /gen_global_v1/);
    assert.match(sql, /gen_cert_teacher_secondary/);
    assert.match(sql, /ON DELETE RESTRICT/);
    assert.match(sql, /全对得分，少选得部分分/);
    assert.equal(sql.includes('enabled_question_type_codes'), false);
  });
});
