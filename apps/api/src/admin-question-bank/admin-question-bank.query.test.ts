import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ADMIN_QUESTION_BANK_SUMMARY_MAX, summarizeQuestionBankStem } from '@tishuashua/shared';
import {
  ADMIN_QUESTION_BANK_DEFAULT_PAGE_SIZE,
  parseAdminQuestionBankQuery,
} from './admin-question-bank.query';

const DOMAIN_ID = '11111111-1111-4111-8111-111111111111';
const CERT_ID = '22222222-2222-4222-8222-222222222222';
const KP_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_KP = '44444444-4444-4444-8444-444444444444';

describe('admin question bank query', () => {
  test('缺省是近 30 天、第 1 页、每页 20 条', () => {
    const parsed = parseAdminQuestionBankQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      domainId: null,
      certificateId: null,
      knowledgePointId: null,
      range: '30d',
      page: 1,
      pageSize: ADMIN_QUESTION_BANK_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写，kpId 可作为别名', () => {
    const parsed = parseAdminQuestionBankQuery({
      domainId: `  ${DOMAIN_ID.toUpperCase()}  `,
      certificateId: '   ',
      kpId: KP_ID.toUpperCase(),
      range: 'all',
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.domainId, DOMAIN_ID);
    assert.equal(parsed.query.certificateId, null);
    assert.equal(parsed.query.knowledgePointId, KP_ID);
    assert.equal(parsed.query.range, 'all');
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('knowledgePointId 与 kpId 相同可以，不同则拒绝', () => {
    const same = parseAdminQuestionBankQuery({ knowledgePointId: KP_ID, kpId: KP_ID });
    assert.equal(same.ok, true);
    if (same.ok) {
      assert.equal(same.query.knowledgePointId, KP_ID);
    }
    const different = parseAdminQuestionBankQuery({
      knowledgePointId: KP_ID,
      kpId: OTHER_KP,
    });
    assert.equal(different.ok, false);
  });

  test('非法时间范围、UUID 和页大小返回说明', () => {
    assert.equal(parseAdminQuestionBankQuery({ range: 'forever' }).ok, false);
    assert.equal(parseAdminQuestionBankQuery({ domainId: 'abc' }).ok, false);
    assert.equal(parseAdminQuestionBankQuery({ certificateId: CERT_ID.slice(0, 8) }).ok, false);
    assert.equal(parseAdminQuestionBankQuery({ pageSize: '0' }).ok, false);
    assert.equal(parseAdminQuestionBankQuery({ pageSize: '101' }).ok, false);
    assert.equal(parseAdminQuestionBankQuery({ page: '1.5' }).ok, false);
  });

  test('摘要按字数截断，空白题干有固定说明', () => {
    assert.equal(summarizeQuestionBankStem('  正当防卫  '), '正当防卫');
    assert.equal(summarizeQuestionBankStem(' \n '), '题目内容无法读取');
    const long = '建'.repeat(ADMIN_QUESTION_BANK_SUMMARY_MAX + 3);
    const summary = summarizeQuestionBankStem(long);
    assert.equal(Array.from(summary).length, ADMIN_QUESTION_BANK_SUMMARY_MAX + 1);
    assert.equal(summary.endsWith('…'), true);
  });
});
