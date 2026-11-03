import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_USER_DEFAULT_PAGE_SIZE,
  ADMIN_USER_MAX_PAGE,
  ADMIN_USER_MAX_PAGE_SIZE,
  parseAdminUserQuery,
} from './admin-users.query';

describe('admin user query', () => {
  test('缺省是全部状态、第 1 页、每页 20 条', () => {
    const parsed = parseAdminUserQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      status: 'all',
      page: 1,
      pageSize: ADMIN_USER_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白状态视为不筛选', () => {
    const parsed = parseAdminUserQuery({ status: '   ', page: '2', pageSize: '50' });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.status, 'all');
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('拒绝非法状态、页码和重复参数', () => {
    assert.equal(parseAdminUserQuery({ status: 'deleted' }).ok, false);
    assert.equal(parseAdminUserQuery({ page: '0' }).ok, false);
    assert.equal(parseAdminUserQuery({ page: String(ADMIN_USER_MAX_PAGE + 1) }).ok, false);
    assert.equal(parseAdminUserQuery({ pageSize: String(ADMIN_USER_MAX_PAGE_SIZE + 1) }).ok, false);
    assert.equal(parseAdminUserQuery({ page: '1.5' }).ok, false);
    assert.equal(parseAdminUserQuery({ status: ['active', 'banned'] }).ok, false);
    assert.equal(parseAdminUserQuery([]).ok, false);
  });

  test('active 与 banned 可以通过', () => {
    const active = parseAdminUserQuery({ status: 'active' });
    const banned = parseAdminUserQuery({ status: 'banned' });
    assert.equal(active.ok && active.query.status, 'active');
    assert.equal(banned.ok && banned.query.status, 'banned');
  });
});
