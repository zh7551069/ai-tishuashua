import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_QUIZ_SESSION_DEFAULT_PAGE_SIZE,
  ADMIN_QUIZ_SESSION_MAX_PAGE,
  ADMIN_QUIZ_SESSION_MAX_PAGE_SIZE,
  parseAdminQuizSessionQuery,
} from './admin-quiz-sessions.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';

describe('admin quiz session query', () => {
  test('缺省是全部未交卷、全部模式、第 1 页、每页 20 条', () => {
    const parsed = parseAdminQuizSessionQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      status: 'all',
      mode: 'all',
      userId: null,
      page: 1,
      pageSize: ADMIN_QUIZ_SESSION_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写', () => {
    const parsed = parseAdminQuizSessionQuery({
      status: 'in_progress',
      mode: 'exam',
      userId: `  ${USER_ID.toUpperCase()}  `,
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.status, 'in_progress');
    assert.equal(parsed.query.mode, 'exam');
    assert.equal(parsed.query.userId, USER_ID);
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('已交卷和其他非法状态不能进这一页', () => {
    const submitted = parseAdminQuizSessionQuery({ status: 'submitted' });
    assert.equal(submitted.ok, false);
    if (!submitted.ok) {
      assert.equal(submitted.message, '已交卷不在出题会话里，请查看证书与成绩');
    }
    assert.equal(parseAdminQuizSessionQuery({ status: 'gone' }).ok, false);
    assert.equal(parseAdminQuizSessionQuery({ mode: 'submitted' }).ok, false);
    assert.equal(parseAdminQuizSessionQuery({ userId: 'not-a-uuid' }).ok, false);
    assert.equal(parseAdminQuizSessionQuery({ page: '0' }).ok, false);
    assert.equal(
      parseAdminQuizSessionQuery({ page: String(ADMIN_QUIZ_SESSION_MAX_PAGE + 1) }).ok,
      false,
    );
    assert.equal(
      parseAdminQuizSessionQuery({ pageSize: String(ADMIN_QUIZ_SESSION_MAX_PAGE_SIZE + 1) }).ok,
      false,
    );
    assert.equal(parseAdminQuizSessionQuery({ userId: [USER_ID, USER_ID] }).ok, false);
    assert.equal(parseAdminQuizSessionQuery([]).ok, false);
  });

  test('未交卷状态可以通过', () => {
    for (const status of ['pending', 'generating', 'ready', 'cancelled', 'failed'] as const) {
      const parsed = parseAdminQuizSessionQuery({ status });
      assert.equal(parsed.ok && parsed.query.status, status);
    }
  });
});
