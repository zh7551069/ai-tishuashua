import { Inject, Injectable } from '@nestjs/common';
import type { CertificateSummary, DomainSummary, PublishStatus } from '@tishuashua/shared';
import type { Pool } from 'pg';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { KnowledgeRow, TextbookRow } from './catalog-tree';

interface DomainRow {
  id: string;
  code: string;
  name: string;
  status: string;
}

interface CertificateRow {
  id: string;
  domain_id: string;
  code: string;
  name: string;
  status: string;
  total_score: number;
  pass_score: number | null;
  enabled_question_type_codes: string[];
  extra_constraint: string | null;
}

interface CertificateHeaderRow {
  id: string;
  name: string;
  domain_id: string;
  status: string;
  domain_name: string;
  domain_status: string;
}

export interface CertificateHeader {
  certificateId: string;
  certificateName: string;
  domainId: string;
  domainName: string;
  status: PublishStatus;
  domainStatus: PublishStatus;
}

interface TextbookSqlRow {
  id: string;
  name: string;
}

interface KnowledgeSqlRow {
  id: string;
  textbook_id: string | null;
  parent_id: string | null;
  name: string;
  prompt_hint: string | null;
  source_ref: string | null;
  level: number;
}

@Injectable()
export class CatalogRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listOnlineDomains(): Promise<DomainSummary[]> {
    try {
      const result = await this.pool().query<DomainRow>(
        `
          SELECT id, code, name, status
          FROM domains
          WHERE status = 'online'
          ORDER BY sort_order, name
        `,
      );
      return result.rows.map(mapDomain);
    } catch (error) {
      rethrowDatabaseError('catalog', error);
    }
  }

  async findDomain(id: string): Promise<DomainSummary | null> {
    try {
      const result = await this.pool().query<DomainRow>(
        `SELECT id, code, name, status FROM domains WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? mapDomain(row) : null;
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      rethrowDatabaseError('catalog', error);
    }
  }

  async listOnlineCertificates(domainId: string): Promise<CertificateSummary[]> {
    try {
      const result = await this.pool().query<CertificateRow>(
        `
          SELECT
            c.id,
            c.domain_id,
            c.code,
            c.name,
            c.status,
            c.total_score,
            c.pass_score,
            c.enabled_question_type_codes,
            c.extra_constraint
          FROM certificates c
          JOIN domains d ON d.id = c.domain_id
          WHERE c.domain_id = $1
            AND c.status = 'online'
            AND d.status = 'online'
          ORDER BY c.sort_order, c.name
        `,
        [domainId],
      );
      return result.rows.map(mapCertificate);
    } catch (error) {
      rethrowDatabaseError('catalog', error);
    }
  }

  async findCertificateHeader(id: string): Promise<CertificateHeader | null> {
    try {
      const result = await this.pool().query<CertificateHeaderRow>(
        `
          SELECT
            c.id,
            c.name,
            c.domain_id,
            c.status,
            d.name AS domain_name,
            d.status AS domain_status
          FROM certificates c
          JOIN domains d ON d.id = c.domain_id
          WHERE c.id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        certificateId: row.id,
        certificateName: row.name,
        domainId: row.domain_id,
        domainName: row.domain_name,
        status: asStatus(row.status),
        domainStatus: asStatus(row.domain_status),
      };
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      rethrowDatabaseError('catalog', error);
    }
  }

  async listOnlineTextbooks(certificateId: string): Promise<TextbookRow[]> {
    try {
      const result = await this.pool().query<TextbookSqlRow>(
        `
          SELECT tb.id, tb.name
          FROM textbooks tb
          JOIN textbook_certificates tc ON tc.textbook_id = tb.id
          WHERE tc.certificate_id = $1
            AND tb.status = 'online'
          ORDER BY tb.sort_order, tb.name
        `,
        [certificateId],
      );
      return result.rows;
    } catch (error) {
      rethrowDatabaseError('catalog', error);
    }
  }

  async listOnlineKnowledgePoints(
    certificateId: string,
    textbookIds: readonly string[],
  ): Promise<KnowledgeRow[]> {
    try {
      const result = await this.pool().query<KnowledgeSqlRow>(
        `
          SELECT
            kp.id,
            kp.textbook_id,
            kp.parent_id,
            kp.name,
            kp.prompt_hint,
            kp.source_ref,
            kp.level
          FROM knowledge_points kp
          WHERE kp.kind = 'knowledge_point'
            AND kp.status = 'online'
            AND (
              kp.textbook_id = ANY($1::uuid[])
              OR (
                kp.textbook_id IS NULL
                AND EXISTS (
                  SELECT 1
                  FROM knowledge_point_certificates kpc
                  WHERE kpc.knowledge_point_id = kp.id
                    AND kpc.certificate_id = $2
                )
              )
            )
          ORDER BY kp.sort_order, kp.name
        `,
        [textbookIds, certificateId],
      );
      return result.rows.map((row) => ({
        id: row.id,
        textbookId: row.textbook_id,
        parentId: row.parent_id,
        name: row.name,
        promptHint: row.prompt_hint ?? '',
        sourceRef: row.source_ref,
        level: row.level,
      }));
    } catch (error) {
      rethrowDatabaseError('catalog', error);
    }
  }

  private pool(): Pool {
    return this.database.requirePool();
  }
}

function mapDomain(row: DomainRow): DomainSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: asStatus(row.status),
  };
}

function mapCertificate(row: CertificateRow): CertificateSummary {
  return {
    id: row.id,
    domainId: row.domain_id,
    code: row.code,
    name: row.name,
    status: asStatus(row.status),
    totalScore: row.total_score,
    passScore: row.pass_score,
    enabledQuestionTypeCodes: row.enabled_question_type_codes,
    extraConstraint: row.extra_constraint,
  };
}

function asStatus(value: string): PublishStatus {
  return value === 'online' ? 'online' : 'offline';
}
