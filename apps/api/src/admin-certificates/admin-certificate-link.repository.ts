import { Inject, Injectable } from '@nestjs/common';
import type {
  AdminCertificateLinkDetail,
  AdminCertificateLinkSummary,
  PublishStatus,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { readCertificateLatestScore } from '../certificate/certificate-query';
import { DatabaseService } from '../db/database.service';
import type { AdminCertificateLinkQuery } from './admin-certificates.query';

interface LinkRow {
  user_id: string;
  user_nick: string | null;
  cert_id: string;
  code: string;
  name: string;
  status: string;
  total_score: number | string;
  pass_score: number | string | null;
  enabled_question_type_codes: string[] | null;
  extra_constraint: string | null;
  domain_id: string;
  domain_name: string;
  domain_sort: number | string;
  cert_sort: number | string;
  pack_count: number | string;
  active_pack_id: string | null;
  submitted_count: number | string;
  pending_wrong_count: number | string;
  upload_count: number | string;
  latest_session_id: string | null;
  latest_submitted_at: Date | string | null;
  pass_snapshot: unknown;
  pack_touched_at: Date | string | null;
  wrong_touched_at: Date | string | null;
  upload_touched_at: Date | string | null;
  submitted_touched_at: Date | string | null;
  touched_at: Date | string | null;
}

/**
 * 关联来源和小程序证书查询相同：本人的刷题包、错题、挂了证书的课件，
 * 以及能对上现存证书的已交卷会话。会话先认 pack_snapshot.certId，再认还在的刷题包。
 * SQL 按用户展开，不改 certificate.repository，避免动到 GET /api/certificates。
 */
const LINK_CTE = `
  WITH pack_stats AS (
    SELECT
      user_id,
      cert_id,
      COUNT(*)::int AS pack_count,
      MAX(updated_at) AS touched_at,
      (ARRAY_AGG(id) FILTER (WHERE active))[1] AS active_pack_id
    FROM packs
    GROUP BY user_id, cert_id
  ),
  wrong_stats AS (
    SELECT
      user_id,
      cert_id,
      CAST(COUNT(*) FILTER (WHERE status = 'pending') AS int) AS pending_wrong_count,
      MAX(updated_at) AS touched_at
    FROM wrong_items
    GROUP BY user_id, cert_id
  ),
  upload_stats AS (
    SELECT
      user_id,
      certificate_id AS cert_id,
      COUNT(*)::int AS upload_count,
      MAX(updated_at) AS touched_at
    FROM user_uploads
    WHERE certificate_id IS NOT NULL
    GROUP BY user_id, certificate_id
  ),
  session_links AS (
    SELECT
      s.user_id,
      s.id,
      s.submitted_at,
      s.pass_snapshot,
      COALESCE(snap.id, pack_cert.id) AS cert_id
    FROM quiz_sessions s
    LEFT JOIN certificates snap
      ON snap.id::text = NULLIF(s.pack_snapshot->>'certId', '')
    LEFT JOIN packs p
      ON p.id = s.pack_id AND p.user_id = s.user_id
    LEFT JOIN certificates pack_cert
      ON pack_cert.id = p.cert_id
    WHERE s.status = 'submitted'
  ),
  session_stats AS (
    SELECT
      user_id,
      cert_id,
      COUNT(*)::int AS submitted_count,
      MAX(submitted_at) AS touched_at
    FROM session_links
    WHERE cert_id IS NOT NULL
    GROUP BY user_id, cert_id
  ),
  latest_sessions AS (
    SELECT DISTINCT ON (user_id, cert_id)
      user_id,
      cert_id,
      id AS latest_session_id,
      submitted_at AS latest_submitted_at,
      pass_snapshot
    FROM session_links
    WHERE cert_id IS NOT NULL
    ORDER BY user_id, cert_id, submitted_at DESC NULLS LAST, id DESC
  ),
  related AS (
    SELECT user_id, cert_id FROM pack_stats
    UNION
    SELECT user_id, cert_id FROM wrong_stats
    UNION
    SELECT user_id, cert_id FROM upload_stats
    UNION
    SELECT user_id, cert_id FROM session_stats
  ),
  links AS (
    SELECT
      u.id AS user_id,
      u.nick AS user_nick,
      c.id AS cert_id,
      c.code,
      c.name,
      c.status,
      c.total_score,
      c.pass_score,
      c.enabled_question_type_codes,
      c.extra_constraint,
      d.id AS domain_id,
      d.name AS domain_name,
      d.sort_order AS domain_sort,
      c.sort_order AS cert_sort,
      COALESCE(ps.pack_count, 0) AS pack_count,
      ps.active_pack_id,
      COALESCE(ss.submitted_count, 0) AS submitted_count,
      COALESCE(ws.pending_wrong_count, 0) AS pending_wrong_count,
      COALESCE(us.upload_count, 0) AS upload_count,
      ls.latest_session_id,
      ls.latest_submitted_at,
      ls.pass_snapshot,
      ps.touched_at AS pack_touched_at,
      ws.touched_at AS wrong_touched_at,
      us.touched_at AS upload_touched_at,
      ss.touched_at AS submitted_touched_at,
      GREATEST(ps.touched_at, ws.touched_at, us.touched_at, ss.touched_at) AS touched_at
    FROM related r
    JOIN users u ON u.id = r.user_id
    JOIN certificates c ON c.id = r.cert_id
    JOIN domains d ON d.id = c.domain_id
    LEFT JOIN pack_stats ps ON ps.user_id = r.user_id AND ps.cert_id = r.cert_id
    LEFT JOIN wrong_stats ws ON ws.user_id = r.user_id AND ws.cert_id = r.cert_id
    LEFT JOIN upload_stats us ON us.user_id = r.user_id AND us.cert_id = r.cert_id
    LEFT JOIN session_stats ss ON ss.user_id = r.user_id AND ss.cert_id = r.cert_id
    LEFT JOIN latest_sessions ls ON ls.user_id = r.user_id AND ls.cert_id = r.cert_id
  )
`;

const FILTER_SQL = `
  ($1::uuid IS NULL OR user_id = $1::uuid)
  AND ($2::uuid IS NULL OR cert_id = $2::uuid)
  AND ($3::uuid IS NULL OR domain_id = $3::uuid)
  AND ($4::timestamptz IS NULL OR touched_at >= $4::timestamptz)
  AND ($5::timestamptz IS NULL OR touched_at <= $5::timestamptz)
`;

@Injectable()
export class AdminCertificateLinkRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminCertificateLinkQuery,
  ): Promise<{ items: AdminCertificateLinkSummary[]; total: number }> {
    const filters = [
      query.userId,
      query.certId,
      query.domainId,
      query.touchedFrom,
      query.touchedTo,
    ];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `${LINK_CTE} SELECT COUNT(*)::int AS total FROM links WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<LinkRow>(
        `
          ${LINK_CTE}
          SELECT * FROM links
          WHERE ${FILTER_SQL}
          ORDER BY touched_at DESC NULLS LAST, domain_sort, cert_sort, name, user_id
          LIMIT $6 OFFSET $7
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-certificate-link', error);
    }
  }

  async find(userId: string, certId: string): Promise<AdminCertificateLinkDetail | null> {
    try {
      const result = await this.database
        .requirePool()
        .query<LinkRow>(`${LINK_CTE} SELECT * FROM links WHERE user_id = $1 AND cert_id = $2`, [
          userId,
          certId,
        ]);
      const row = result.rows[0];
      return row ? toDetail(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-certificate-link', error);
    }
  }
}

function toSummary(row: LinkRow): AdminCertificateLinkSummary {
  const status = asStatus(row.status);
  return {
    userId: row.user_id,
    userNick: row.user_nick?.trim() ? row.user_nick.trim() : null,
    id: row.cert_id,
    code: row.code,
    name: row.name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    status,
    unavailable: status !== 'online',
    totalScore: Number(row.total_score),
    passScore: row.pass_score === null ? null : Number(row.pass_score),
    enabledQuestionTypeCodes: row.enabled_question_type_codes ?? [],
    extraConstraint: row.extra_constraint,
    packCount: Number(row.pack_count) || 0,
    activePackId: row.active_pack_id,
    submittedCount: Number(row.submitted_count) || 0,
    pendingWrongCount: Number(row.pending_wrong_count) || 0,
    uploadCount: Number(row.upload_count) || 0,
    latestScore: readCertificateLatestScore({
      sessionId: row.latest_session_id,
      submittedAt: row.latest_submitted_at,
      snapshot: row.pass_snapshot,
    }),
    touchedAt: toIso(row.touched_at),
  };
}

function toDetail(row: LinkRow): AdminCertificateLinkDetail {
  return {
    ...toSummary(row),
    packTouchedAt: toIso(row.pack_touched_at),
    wrongTouchedAt: toIso(row.wrong_touched_at),
    uploadTouchedAt: toIso(row.upload_touched_at),
    submittedTouchedAt: toIso(row.submitted_touched_at),
  };
}

function asStatus(value: string): PublishStatus {
  return value === 'online' ? 'online' : 'offline';
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
