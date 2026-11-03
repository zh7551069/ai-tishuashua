import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_CERTIFICATE_DEFAULT_PAGE_SIZE,
  ADMIN_CERTIFICATE_MAX_PAGE,
  ADMIN_CERTIFICATE_MAX_PAGE_SIZE,
  parseAdminCertificateQuery,
} from './admin-certificates.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CERT_ID = '22222222-2222-4222-8222-222222222222';

describe('admin certificate query', () => {
  test('缺省是全部模式、第 1 页、每页 20 条', () => {
    const parsed = parseAdminCertificateQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      mode: 'all',
      userId: null,
      certId: null,
      page: 1,
      pageSize: ADMIN_CERTIFICATE_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写', () => {
    const parsed = parseAdminCertificateQuery({
      mode: 'exam',
      userId: `  ${USER_ID.toUpperCase()}  `,
      certId: '   ',
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.mode, 'exam');
    assert.equal(parsed.query.userId, USER_ID);
    assert.equal(parsed.query.certId, null);
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('拒绝非法模式、UUID、页码和重复参数', () => {
    const badMode = parseAdminCertificateQuery({ mode: 'submitted' });
    assert.equal(badMode.ok, false);
    if (!badMode.ok) {
      assert.match(badMode.message, /模式/);
    }
    assert.equal(parseAdminCertificateQuery({ userId: 'not-a-uuid' }).ok, false);
    assert.equal(parseAdminCertificateQuery({ certId: CERT_ID.slice(0, 8) }).ok, false);
    assert.equal(parseAdminCertificateQuery({ page: '0' }).ok, false);
    assert.equal(
      parseAdminCertificateQuery({ page: String(ADMIN_CERTIFICATE_MAX_PAGE + 1) }).ok,
      false,
    );
    assert.equal(
      parseAdminCertificateQuery({ pageSize: String(ADMIN_CERTIFICATE_MAX_PAGE_SIZE + 1) }).ok,
      false,
    );
    assert.equal(parseAdminCertificateQuery({ page: '1.5' }).ok, false);
    assert.equal(parseAdminCertificateQuery({ userId: [USER_ID, USER_ID] }).ok, false);
    assert.equal(parseAdminCertificateQuery([]).ok, false);
  });

  test('练习、考试和 all 可以通过', () => {
    for (const mode of ['practice', 'exam', 'all']) {
      const parsed = parseAdminCertificateQuery({ mode, certId: CERT_ID });
      assert.equal(parsed.ok, true);
      if (parsed.ok) {
        assert.equal(parsed.query.mode, mode);
        assert.equal(parsed.query.certId, CERT_ID);
      }
    }
  });
});
