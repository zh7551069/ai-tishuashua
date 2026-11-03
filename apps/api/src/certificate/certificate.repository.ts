import { Inject, Injectable } from '@nestjs/common';
import type { CertificateQueryItem, CertificateQueryList, PublishStatus } from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import { readCertificateLatestScore } from './certificate-query';

interface CertificateQueryRow {
  id: string;
  code: string;
  name: string;
  status: string;
  total_score: number;
  pass_score: number | null;
  enabled_question_type_codes: string[] | null;
  extra_constraint: string | null;
  domain_id: string;
  domain_name: string;
  pack_count: number;
  active_pack_id: string | null;
  submitted_count: number;
  pending_wrong_count: number;
  upload_count: number;
  latest_session_id: string | null;
  latest_submitted_at: Date | string | null;
  pass_snapshot: unknown;
}

@Injectable()
export class CertificateRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /**
   * 只返回这个用户已经关联过的证书。
   * 关联来自本人的刷题包、错题、课件，以及能对上证书的已交卷会话。
   * 后管删除证书时认前三类引用；会话快照是删包之后仍能对上证书的记录。
   */
  async listForUser(userId: string): Promise<CertificateQueryList> {
    try {
      const result = await this.database.requirePool().query<CertificateQueryRow>(
        `
          WITH pack_stats AS (
            SELECT
              cert_id,
              COUNT(*)::int AS pack_count,
              MAX(updated_at) AS touched_at,
              (ARRAY_AGG(id) FILTER (WHERE active))[1] AS active_pack_id
            FROM packs
            WHERE user_id = $1
            GROUP BY cert_id
          ),
          wrong_stats AS (
            SELECT
              cert_id,
              CAST(COUNT(*) FILTER (WHERE status = 'pending') AS int) AS pending_wrong_count,
              MAX(updated_at) AS touched_at
            FROM wrong_items
            WHERE user_id = $1
            GROUP BY cert_id
          ),
          upload_stats AS (
            SELECT
              certificate_id AS cert_id,
              COUNT(*)::int AS upload_count,
              MAX(updated_at) AS touched_at
            FROM user_uploads
            WHERE user_id = $1 AND certificate_id IS NOT NULL
            GROUP BY certificate_id
          ),
          session_links AS (
            SELECT
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
            WHERE s.user_id = $1
              AND s.status = 'submitted'
          ),
          session_stats AS (
            SELECT
              cert_id,
              COUNT(*)::int AS submitted_count,
              MAX(submitted_at) AS touched_at
            FROM session_links
            WHERE cert_id IS NOT NULL
            GROUP BY cert_id
          ),
          latest_sessions AS (
            SELECT DISTINCT ON (cert_id)
              cert_id,
              id AS latest_session_id,
              submitted_at AS latest_submitted_at,
              pass_snapshot
            FROM session_links
            WHERE cert_id IS NOT NULL
            ORDER BY cert_id, submitted_at DESC NULLS LAST, id DESC
          ),
          related AS (
            SELECT cert_id FROM pack_stats
            UNION
            SELECT cert_id FROM wrong_stats
            UNION
            SELECT cert_id FROM upload_stats
            UNION
            SELECT cert_id FROM session_stats
          )
          SELECT
            c.id,
            c.code,
            c.name,
            c.status,
            c.total_score,
            c.pass_score,
            c.enabled_question_type_codes,
            c.extra_constraint,
            d.id AS domain_id,
            d.name AS domain_name,
            COALESCE(ps.pack_count, 0) AS pack_count,
            ps.active_pack_id,
            COALESCE(ss.submitted_count, 0) AS submitted_count,
            COALESCE(ws.pending_wrong_count, 0) AS pending_wrong_count,
            COALESCE(us.upload_count, 0) AS upload_count,
            ls.latest_session_id,
            ls.latest_submitted_at,
            ls.pass_snapshot
          FROM related r
          JOIN certificates c ON c.id = r.cert_id
          JOIN domains d ON d.id = c.domain_id
          LEFT JOIN pack_stats ps ON ps.cert_id = c.id
          LEFT JOIN wrong_stats ws ON ws.cert_id = c.id
          LEFT JOIN upload_stats us ON us.cert_id = c.id
          LEFT JOIN session_stats ss ON ss.cert_id = c.id
          LEFT JOIN latest_sessions ls ON ls.cert_id = c.id
          ORDER BY
            (
              SELECT MAX(ts)
              FROM (
                VALUES (ps.touched_at), (ws.touched_at), (us.touched_at), (ss.touched_at)
              ) AS times(ts)
            ) DESC NULLS LAST,
            d.sort_order,
            c.sort_order,
            c.name
        `,
        [userId],
      );
      return { items: result.rows.map(mapRow) };
    } catch (error) {
      rethrowDatabaseError('certificate', error);
    }
  }
}

function mapRow(row: CertificateQueryRow): CertificateQueryItem {
  const status = asStatus(row.status);
  return {
    id: row.id,
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
    packCount: Number(row.pack_count),
    activePackId: row.active_pack_id,
    submittedCount: Number(row.submitted_count),
    pendingWrongCount: Number(row.pending_wrong_count),
    uploadCount: Number(row.upload_count),
    latestScore: readCertificateLatestScore({
      sessionId: row.latest_session_id,
      submittedAt: row.latest_submitted_at,
      snapshot: row.pass_snapshot,
    }),
  };
}

function asStatus(value: string): PublishStatus {
  return value === 'online' ? 'online' : 'offline';
}
