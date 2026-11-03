import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_WRONG_BOOK_DEFAULT_PAGE_SIZE,
  ADMIN_WRONG_BOOK_MAX_PAGE,
  ADMIN_WRONG_BOOK_MAX_PAGE_SIZE,
  parseAdminWrongBookQuery,
} from './admin-wrong-book.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CERT_ID = '22222222-2222-4222-8222-222222222222';

describe('admin wrong book query', () => {
  test('缺省是全部状态、第 1 页、每页 20 条', () => {
    const parsed = parseAdminWrongBookQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      status: 'all',
      userId: null,
      certId: null,
      page: 1,
      pageSize: ADMIN_WRONG_BOOK_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写', () => {
    const parsed = parseAdminWrongBookQuery({
      status: 'pending',
      userId: `  ${USER_ID.toUpperCase()}  `,
      certId: '   ',
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.status, 'pending');
    assert.equal(parsed.query.userId, USER_ID);
    assert.equal(parsed.query.certId, null);
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('拒绝非法状态、UUID、页码和重复参数', () => {
    assert.equal(parseAdminWrongBookQuery({ status: 'gone' }).ok, false);
    assert.equal(parseAdminWrongBookQuery({ userId: 'not-a-uuid' }).ok, false);
    assert.equal(parseAdminWrongBookQuery({ certId: CERT_ID.slice(0, 8) }).ok, false);
    assert.equal(parseAdminWrongBookQuery({ page: '0' }).ok, false);
    assert.equal(
      parseAdminWrongBookQuery({ page: String(ADMIN_WRONG_BOOK_MAX_PAGE + 1) }).ok,
      false,
    );
    assert.equal(
      parseAdminWrongBookQuery({ pageSize: String(ADMIN_WRONG_BOOK_MAX_PAGE_SIZE + 1) }).ok,
      false,
    );
    assert.equal(parseAdminWrongBookQuery({ page: '1.5' }).ok, false);
    assert.equal(parseAdminWrongBookQuery({ userId: [USER_ID, USER_ID] }).ok, false);
    assert.equal(parseAdminWrongBookQuery([]).ok, false);
  });

  test('cleared 与 all 可以通过', () => {
    const cleared = parseAdminWrongBookQuery({ status: 'cleared', certId: CERT_ID });
    const all = parseAdminWrongBookQuery({ status: 'all' });
    assert.equal(cleared.ok && cleared.query.status, 'cleared');
    assert.equal(cleared.ok && cleared.query.certId, CERT_ID);
    assert.equal(all.ok && all.query.status, 'all');
  });
});
