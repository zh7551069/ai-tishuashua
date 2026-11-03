import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ADMIN_CERTIFICATES_DEFAULT_PAGE_SIZE,
  ADMIN_CERTIFICATES_MAX_PAGE,
  ADMIN_CERTIFICATES_MAX_PAGE_SIZE,
  parseAdminCertificateLinkQuery,
  parseAdminScoreQuery,
} from './admin-certificates.query';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CERT_ID = '22222222-2222-4222-8222-222222222222';
const DOMAIN_ID = '33333333-3333-4333-8333-333333333333';

describe('admin certificate link query', () => {
  test('缺省是第 1 页、每页 20 条，不按用户、证书、领域或时间筛选', () => {
    const parsed = parseAdminCertificateLinkQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.deepEqual(parsed.query, {
      userId: null,
      certId: null,
      domainId: null,
      touchedFrom: null,
      touchedTo: null,
      page: 1,
      pageSize: ADMIN_CERTIFICATES_DEFAULT_PAGE_SIZE,
    });
  });

  test('空白筛选项视为不筛选，UUID 转成小写，时间收成 ISO', () => {
    const parsed = parseAdminCertificateLinkQuery({
      userId: `  ${USER_ID.toUpperCase()}  `,
      certId: '   ',
      domainId: DOMAIN_ID,
      touchedFrom: '2026-11-03T00:00:00.000Z',
      touchedTo: '2026-11-03T02:00:00.000Z',
      page: '2',
      pageSize: '50',
    });
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.userId, USER_ID);
    assert.equal(parsed.query.certId, null);
    assert.equal(parsed.query.domainId, DOMAIN_ID);
    assert.equal(parsed.query.touchedFrom, '2026-11-03T00:00:00.000Z');
    assert.equal(parsed.query.touchedTo, '2026-11-03T02:00:00.000Z');
    assert.equal(parsed.query.page, 2);
    assert.equal(parsed.query.pageSize, 50);
  });

  test('拒绝非法 UUID、时间、页码和重复参数', () => {
    assert.equal(parseAdminCertificateLinkQuery({ userId: 'not-a-uuid' }).ok, false);
    assert.equal(parseAdminCertificateLinkQuery({ certId: CERT_ID.slice(0, 8) }).ok, false);
    assert.equal(parseAdminCertificateLinkQuery({ domainId: 'domain' }).ok, false);
    assert.equal(parseAdminCertificateLinkQuery({ touchedFrom: '昨天' }).ok, false);
    assert.equal(
      parseAdminCertificateLinkQuery({
        touchedFrom: '2026-11-03T03:00:00.000Z',
        touchedTo: '2026-11-03T01:00:00.000Z',
      }).ok,
      false,
    );
    assert.equal(parseAdminCertificateLinkQuery({ page: '0' }).ok, false);
    assert.equal(
      parseAdminCertificateLinkQuery({ page: String(ADMIN_CERTIFICATES_MAX_PAGE + 1) }).ok,
      false,
    );
    assert.equal(
      parseAdminCertificateLinkQuery({ pageSize: String(ADMIN_CERTIFICATES_MAX_PAGE_SIZE + 1) }).ok,
      false,
    );
    assert.equal(parseAdminCertificateLinkQuery({ page: '1.5' }).ok, false);
    assert.equal(parseAdminCertificateLinkQuery({ userId: [USER_ID, USER_ID] }).ok, false);
    assert.equal(parseAdminCertificateLinkQuery([]).ok, false);
  });
});

describe('admin score query', () => {
  test('缺省是全部模式和第 1 页', () => {
    const parsed = parseAdminScoreQuery({});
    assert.equal(parsed.ok, true);
    if (!parsed.ok) {
      return;
    }
    assert.equal(parsed.query.mode, 'all');
    assert.equal(parseAdminScoreQuery({ mode: '  ' }).ok, true);
    assert.equal(parsed.query.submittedFrom, null);
    assert.equal(parsed.query.submittedTo, null);
    assert.equal(parsed.query.page, 1);
    assert.equal(parsed.query.pageSize, ADMIN_CERTIFICATES_DEFAULT_PAGE_SIZE);
  });

  test('练习、考试和相同起止时间可以通过', () => {
    const exam = parseAdminScoreQuery({
      mode: 'exam',
      userId: USER_ID,
      certId: CERT_ID,
      domainId: DOMAIN_ID,
      submittedFrom: '2026-11-03T01:00:00.000Z',
      submittedTo: '2026-11-03T01:00:00.000Z',
    });
    const practice = parseAdminScoreQuery({ mode: 'practice' });
    assert.equal(exam.ok, true);
    if (exam.ok) {
      assert.equal(exam.query.mode, 'exam');
      assert.equal(exam.query.userId, USER_ID);
      assert.equal(exam.query.submittedFrom, exam.query.submittedTo);
    }
    assert.equal(practice.ok && practice.query.mode, 'practice');
  });

  test('拒绝非法模式、时间和颠倒的区间', () => {
    assert.equal(parseAdminScoreQuery({ mode: 'quiz' }).ok, false);
    assert.equal(parseAdminScoreQuery({ submittedFrom: 'not-a-time' }).ok, false);
    assert.equal(
      parseAdminScoreQuery({
        submittedFrom: '2026-11-04T00:00:00.000Z',
        submittedTo: '2026-11-03T00:00:00.000Z',
      }).ok,
      false,
    );
    assert.equal(parseAdminScoreQuery({ domainId: [DOMAIN_ID] }).ok, false);
  });
});
