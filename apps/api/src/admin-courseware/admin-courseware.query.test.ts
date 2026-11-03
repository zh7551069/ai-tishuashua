import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_COURSEWARE_DEFAULT_PAGE_SIZE,
  ADMIN_COURSEWARE_MAX_PAGE,
  ADMIN_COURSEWARE_MAX_PAGE_SIZE,
  parseAdminCoursewareQuery,
} from './admin-courseware.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CERT_ID = '22222222-2222-4222-8222-222222222222';

describe('admin courseware query', () => {
  test('缺省是全部状态、第 1 页、每页 20 条', () => {
    const parsed = parseAdminCoursewareQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      status: 'all',
      userId: null,
      certId: null,
      page: 1,
      pageSize: ADMIN_COURSEWARE_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写', () => {
    const parsed = parseAdminCoursewareQuery({
      status: 'running',
      userId: `  ${USER_ID.toUpperCase()}  `,
      certId: '   ',
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.status, 'running');
    assert.equal(parsed.query.userId, USER_ID);
    assert.equal(parsed.query.certId, null);
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('拒绝非法状态、UUID、页码和重复参数', () => {
    const badStatus = parseAdminCoursewareQuery({ status: 'gone' });
    assert.equal(badStatus.ok, false);
    if (!badStatus.ok) {
      assert.match(badStatus.message, /状态/);
    }
    assert.equal(parseAdminCoursewareQuery({ userId: 'not-a-uuid' }).ok, false);
    assert.equal(parseAdminCoursewareQuery({ certId: CERT_ID.slice(0, 8) }).ok, false);
    assert.equal(parseAdminCoursewareQuery({ page: '0' }).ok, false);
    assert.equal(
      parseAdminCoursewareQuery({ page: String(ADMIN_COURSEWARE_MAX_PAGE + 1) }).ok,
      false,
    );
    assert.equal(
      parseAdminCoursewareQuery({ pageSize: String(ADMIN_COURSEWARE_MAX_PAGE_SIZE + 1) }).ok,
      false,
    );
    assert.equal(parseAdminCoursewareQuery({ page: '1.5' }).ok, false);
    assert.equal(parseAdminCoursewareQuery({ userId: [USER_ID, USER_ID] }).ok, false);
    assert.equal(parseAdminCoursewareQuery([]).ok, false);
  });

  test('提炼状态和 all 可以通过', () => {
    for (const status of ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'all']) {
      const parsed = parseAdminCoursewareQuery({ status, certId: CERT_ID });
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.query.status, status);
        assert.equal(parsed.query.certId, CERT_ID);
      }
    }
  });
});
