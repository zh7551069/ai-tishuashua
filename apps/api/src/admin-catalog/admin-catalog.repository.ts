import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type AdminCertificate,
  type AdminDomain,
  type AdminTextbookSummary,
  type CatalogNodeKind,
  type PublishStatus,
} from '@tishuashua/shared';
import type { Pool, PoolClient } from 'pg';
import { ApiException } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminKnowledgeRow } from './admin-catalog-tree';

type Queryable = Pool | PoolClient;

interface DomainSql {
  id: string;
  code: string;
  name: string;
  status: string;
  sort_order: number;
}

interface CertificateSql {
  id: string;
  domain_id: string;
  code: string;
  name: string;
  status: string;
  total_score: number;
  pass_score: number | null;
  enabled_question_type_codes: string[];
  extra_constraint: string | null;
  sort_order: number;
}

interface CertificateHeaderSql {
  id: string;
  name: string;
  status: string;
  domain_id: string;
  domain_name: string;
  domain_status: string;
}

interface TextbookSql {
  id: string;
  code: string;
  name: string;
  status: string;
  sort_order: number;
  certificate_ids: string[] | null;
}

interface KnowledgeSql {
  id: string;
  textbook_id: string | null;
  parent_id: string | null;
  code: string;
  name: string;
  kind: string;
  prompt_hint: string | null;
  source_ref: string | null;
  level: number;
  status: string;
  sort_order: number;
  owner_user_id: string | null;
}

export interface CertificateHeader {
  certificateId: string;
  certificateName: string;
  certificateStatus: PublishStatus;
  domainId: string;
  domainName: string;
  domainStatus: PublishStatus;
}

export interface OfficialKnowledge extends AdminKnowledgeRow {
  ownerUserId: string | null;
}

export interface CertificateUsage {
  packs: number;
  wrongItems: number;
  uploads: number;
}

export interface TextbookUsage {
  packPoints: number;
  userPoints: number;
}

interface DomainWrite {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: number;
}

interface CertificateWrite {
  id: string;
  domainId: string;
  code: string;
  name: string;
  status: PublishStatus;
  totalScore: number;
  passScore: number | null;
  enabledQuestionTypeCodes: string[];
  extraConstraint: string | null;
  sortOrder: number;
}

interface TextbookWrite {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: number;
}

interface KnowledgeWrite {
  id: string;
  textbookId: string | null;
  parentId: string | null;
  code: string;
  name: string;
  kind: CatalogNodeKind;
  promptHint: string | null;
  sourceRef: string | null;
  level: number;
  status: PublishStatus;
  sortOrder: number;
}

@Injectable()
export class AdminCatalogRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async audit(
    client: PoolClient,
    input: { actor: string; action: string; target: string; before: unknown; after: unknown },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO admin_audit_logs (actor, action, target, before, after)
        VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
      `,
      [
        input.actor,
        input.action,
        input.target,
        JSON.stringify(input.before ?? null),
        JSON.stringify(input.after ?? null),
      ],
    );
  }

  async write<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (error instanceof ApiException) {
        throw error;
      }
      if (isPgCode(error, '23505')) {
        throw new ApiException(HttpStatus.CONFLICT, ApiErrorCode.VALIDATION_ERROR, '编码已存在');
      }
      if (isPgCode(error, '23514')) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '字段不符合目录约束',
        );
      }
      if (isPgCode(error, '23503')) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ApiErrorCode.CATALOG_IN_USE,
          '操作与现有目录数据冲突',
        );
      }
      rethrowDatabaseError('admin-catalog', error);
    } finally {
      client.release();
    }
  }

  async listDomains(): Promise<AdminDomain[]> {
    return this.read(async () => {
      const result = await this.pool().query<DomainSql>(
        `
          SELECT id, code, name, status, sort_order
          FROM domains
          ORDER BY sort_order, name
        `,
      );
      return result.rows.map(mapDomain);
    });
  }

  async findDomain(id: string, db: Queryable = this.pool()): Promise<AdminDomain | null> {
    return this.read(async () => {
      const result = await db.query<DomainSql>(
        `SELECT id, code, name, status, sort_order FROM domains WHERE id = $1`,
        [id],
      );
      const row = result.rows[0];
      return row ? mapDomain(row) : null;
    });
  }

  async insertDomain(client: PoolClient, input: DomainWrite): Promise<AdminDomain> {
    const result = await client.query<DomainSql>(
      `
        INSERT INTO domains (id, code, name, status, sort_order)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, code, name, status, sort_order
      `,
      [input.id, input.code, input.name, input.status, input.sortOrder],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ApiErrorCode.INTERNAL,
        '领域没有写上',
      );
    }
    return mapDomain(row);
  }

  async updateDomain(
    client: PoolClient,
    id: string,
    patch: Partial<Omit<DomainWrite, 'id'>>,
  ): Promise<AdminDomain | null> {
    const fields = domainFields(patch);
    if (fields.length === 0) {
      return this.findDomain(id, client);
    }
    const values = fields.map((field) => field.value);
    values.push(id);
    const result = await client.query<DomainSql>(
      `
        UPDATE domains
        SET ${assign(fields)}, updated_at = now()
        WHERE id = $${values.length}
        RETURNING id, code, name, status, sort_order
      `,
      values,
    );
    const row = result.rows[0];
    return row ? mapDomain(row) : null;
  }

  async countCertificates(client: PoolClient, domainId: string): Promise<number> {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count FROM certificates WHERE domain_id = $1`,
      [domainId],
    );
    return result.rows[0]?.count ?? 0;
  }

  async deleteDomain(client: PoolClient, id: string): Promise<void> {
    await client.query(`DELETE FROM domains WHERE id = $1`, [id]);
  }

  async listCertificates(domainId: string): Promise<AdminCertificate[]> {
    return this.read(async () => {
      const result = await this.pool().query<CertificateSql>(
        `
          ${CERTIFICATE_SELECT}
          WHERE domain_id = $1
          ORDER BY sort_order, name
        `,
        [domainId],
      );
      return result.rows.map(mapCertificate);
    });
  }

  async findCertificate(id: string, db: Queryable = this.pool()): Promise<AdminCertificate | null> {
    return this.read(async () => {
      const result = await db.query<CertificateSql>(`${CERTIFICATE_SELECT} WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapCertificate(row) : null;
    });
  }

  async findCertificateHeader(
    id: string,
    db: Queryable = this.pool(),
  ): Promise<CertificateHeader | null> {
    return this.read(async () => {
      const result = await db.query<CertificateHeaderSql>(
        `
          SELECT c.id, c.name, c.status, c.domain_id, d.name AS domain_name, d.status AS domain_status
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
        certificateStatus: asStatus(row.status),
        domainId: row.domain_id,
        domainName: row.domain_name,
        domainStatus: asStatus(row.domain_status),
      };
    });
  }

  async insertCertificate(client: PoolClient, input: CertificateWrite): Promise<AdminCertificate> {
    const result = await client.query<CertificateSql>(
      `
        INSERT INTO certificates (
          id, domain_id, code, name, status, total_score, pass_score,
          enabled_question_type_codes, extra_constraint, sort_order
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10)
        RETURNING ${CERTIFICATE_COLUMNS}
      `,
      [
        input.id,
        input.domainId,
        input.code,
        input.name,
        input.status,
        input.totalScore,
        input.passScore,
        input.enabledQuestionTypeCodes,
        input.extraConstraint,
        input.sortOrder,
      ],
    );
    const row = result.rows[0];
    if (!row) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ApiErrorCode.INTERNAL,
        '证书没有写上',
      );
    }
    return mapCertificate(row);
  }

  async updateCertificate(
    client: PoolClient,
    id: string,
    patch: Partial<Omit<CertificateWrite, 'id' | 'domainId'>>,
  ): Promise<AdminCertificate | null> {
    const fields = certificateFields(patch);
    if (fields.length === 0) {
      return this.findCertificate(id, client);
    }
    const values = fields.map((field) => field.value);
    values.push(id);
    const result = await client.query<CertificateSql>(
      `
        UPDATE certificates
        SET ${assign(fields)}, updated_at = now()
        WHERE id = $${values.length}
        RETURNING ${CERTIFICATE_COLUMNS}
      `,
      values,
    );
    const row = result.rows[0];
    return row ? mapCertificate(row) : null;
  }

  async certificateUsage(client: PoolClient, id: string): Promise<CertificateUsage> {
    const result = await client.query<{ packs: number; wrong_items: number; uploads: number }>(
      `
        SELECT
          (SELECT COUNT(*)::int FROM packs WHERE cert_id = $1) AS packs,
          (SELECT COUNT(*)::int FROM wrong_items WHERE cert_id = $1) AS wrong_items,
          (SELECT COUNT(*)::int FROM user_uploads WHERE certificate_id = $1) AS uploads
      `,
      [id],
    );
    const row = result.rows[0];
    return {
      packs: row?.packs ?? 0,
      wrongItems: row?.wrong_items ?? 0,
      uploads: row?.uploads ?? 0,
    };
  }

  async deleteCertificate(client: PoolClient, id: string): Promise<void> {
    await client.query(
      `
        DELETE FROM knowledge_points kp
        WHERE kp.owner_user_id IS NULL
          AND kp.textbook_id IS NULL
          AND EXISTS (
            SELECT 1 FROM knowledge_point_certificates kpc
            WHERE kpc.knowledge_point_id = kp.id AND kpc.certificate_id = $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_point_certificates kpc
            WHERE kpc.knowledge_point_id = kp.id AND kpc.certificate_id <> $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM pack_knowledge_points pkp WHERE pkp.knowledge_point_id = kp.id
          )
      `,
      [id],
    );
    await client.query(
      `
        DELETE FROM textbooks tb
        WHERE tb.owner_user_id IS NULL
          AND EXISTS (
            SELECT 1 FROM textbook_certificates tc
            WHERE tc.textbook_id = tb.id AND tc.certificate_id = $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM textbook_certificates tc
            WHERE tc.textbook_id = tb.id AND tc.certificate_id <> $1
          )
          AND NOT EXISTS (
            SELECT 1 FROM knowledge_points kp
            WHERE kp.textbook_id = tb.id AND kp.owner_user_id IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1
            FROM knowledge_points kp
            JOIN pack_knowledge_points pkp ON pkp.knowledge_point_id = kp.id
            WHERE kp.textbook_id = tb.id
          )
      `,
      [id],
    );
    await client.query(`DELETE FROM certificates WHERE id = $1`, [id]);
  }

  async listEnabledQuestionTypes(db: Queryable = this.pool()): Promise<string[]> {
    return this.read(async () => {
      const result = await db.query<{ code: string }>(
        `SELECT code FROM question_types WHERE enabled = true ORDER BY sort_order, code`,
      );
      return result.rows.map((row) => row.code);
    });
  }

  async listLinkedTextbooks(certificateId: string): Promise<AdminTextbookSummary[]> {
    return this.read(async () => {
      const result = await this.pool().query<TextbookSql>(
        `
          ${TEXTBOOK_SELECT}
          JOIN textbook_certificates mine
            ON mine.textbook_id = tb.id AND mine.certificate_id = $1
          WHERE tb.owner_user_id IS NULL
          ORDER BY tb.sort_order, tb.name
        `,
        [certificateId],
      );
      return result.rows.map(mapTextbook);
    });
  }

  async listLinkableTextbooks(certificateId: string): Promise<AdminTextbookSummary[]> {
    return this.read(async () => {
      const result = await this.pool().query<TextbookSql>(
        `
          ${TEXTBOOK_SELECT}
          WHERE tb.owner_user_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM textbook_certificates mine
              WHERE mine.textbook_id = tb.id AND mine.certificate_id = $1
            )
          ORDER BY tb.sort_order, tb.name
        `,
        [certificateId],
      );
      return result.rows.map(mapTextbook);
    });
  }

  async listTextbookNodes(textbookIds: readonly string[]): Promise<AdminKnowledgeRow[]> {
    if (textbookIds.length === 0) {
      return [];
    }
    return this.read(async () => {
      const result = await this.pool().query<KnowledgeSql>(
        `
          ${KNOWLEDGE_SELECT}
          WHERE owner_user_id IS NULL AND textbook_id = ANY($1::uuid[])
          ORDER BY sort_order, name
        `,
        [textbookIds],
      );
      return result.rows.map(mapKnowledgeRow);
    });
  }

  async listIndependent(certificateId: string): Promise<AdminKnowledgeRow[]> {
    return this.read(async () => {
      const result = await this.pool().query<KnowledgeSql>(
        `
          ${KNOWLEDGE_SELECT}
          WHERE owner_user_id IS NULL
            AND textbook_id IS NULL
            AND EXISTS (
              SELECT 1 FROM knowledge_point_certificates kpc
              WHERE kpc.knowledge_point_id = knowledge_points.id
                AND kpc.certificate_id = $1
            )
          ORDER BY sort_order, name
        `,
        [certificateId],
      );
      return result.rows.map(mapKnowledgeRow);
    });
  }

  async findTextbook(
    id: string,
    db: Queryable = this.pool(),
  ): Promise<(AdminTextbookSummary & { ownerUserId: string | null }) | null> {
    return this.read(async () => {
      const result = await db.query<TextbookSql & { owner_user_id: string | null }>(
        `
          SELECT
            tb.id,
            tb.code,
            tb.name,
            tb.status,
            tb.sort_order,
            tb.owner_user_id,
            COALESCE(
              (
                SELECT array_agg(tc.certificate_id ORDER BY tc.certificate_id)
                FROM textbook_certificates tc
                WHERE tc.textbook_id = tb.id
              ),
              '{}'
            ) AS certificate_ids
          FROM textbooks tb
          WHERE tb.id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return { ...mapTextbook(row), ownerUserId: row.owner_user_id };
    });
  }

  async insertTextbook(client: PoolClient, input: TextbookWrite): Promise<void> {
    await client.query(
      `
        INSERT INTO textbooks (id, code, name, status, sort_order, owner_user_id)
        VALUES ($1, $2, $3, $4, $5, NULL)
      `,
      [input.id, input.code, input.name, input.status, input.sortOrder],
    );
  }

  async linkTextbook(client: PoolClient, textbookId: string, certificateId: string): Promise<void> {
    await client.query(
      `
        INSERT INTO textbook_certificates (textbook_id, certificate_id)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING
      `,
      [textbookId, certificateId],
    );
  }

  async unlinkTextbook(
    client: PoolClient,
    textbookId: string,
    certificateId: string,
  ): Promise<boolean> {
    const result = await client.query(
      `
        DELETE FROM textbook_certificates
        WHERE textbook_id = $1 AND certificate_id = $2
      `,
      [textbookId, certificateId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateTextbook(
    client: PoolClient,
    id: string,
    patch: Partial<Omit<TextbookWrite, 'id'>>,
  ): Promise<void> {
    const fields = textbookFields(patch);
    if (fields.length === 0) {
      return;
    }
    const values = fields.map((field) => field.value);
    values.push(id);
    await client.query(
      `
        UPDATE textbooks
        SET ${assign(fields)}, updated_at = now()
        WHERE id = $${values.length} AND owner_user_id IS NULL
      `,
      values,
    );
  }

  async textbookUsage(client: PoolClient, id: string): Promise<TextbookUsage> {
    const result = await client.query<{ pack_points: number; user_points: number }>(
      `
        SELECT
          (
            SELECT COUNT(*)::int
            FROM knowledge_points kp
            JOIN pack_knowledge_points pkp ON pkp.knowledge_point_id = kp.id
            WHERE kp.textbook_id = $1
          ) AS pack_points,
          (
            SELECT COUNT(*)::int
            FROM knowledge_points kp
            WHERE kp.textbook_id = $1 AND kp.owner_user_id IS NOT NULL
          ) AS user_points
      `,
      [id],
    );
    const row = result.rows[0];
    return { packPoints: row?.pack_points ?? 0, userPoints: row?.user_points ?? 0 };
  }

  async deleteTextbook(client: PoolClient, id: string): Promise<void> {
    await client.query(`DELETE FROM textbooks WHERE id = $1 AND owner_user_id IS NULL`, [id]);
  }

  async findKnowledge(id: string, db: Queryable = this.pool()): Promise<OfficialKnowledge | null> {
    return this.read(async () => {
      const result = await db.query<KnowledgeSql>(`${KNOWLEDGE_SELECT} WHERE id = $1`, [id]);
      const row = result.rows[0];
      return row ? mapOfficialKnowledge(row) : null;
    });
  }

  async insertKnowledge(client: PoolClient, input: KnowledgeWrite): Promise<void> {
    await client.query(
      `
        INSERT INTO knowledge_points (
          id, textbook_id, parent_id, code, name, kind, prompt_hint, source_ref,
          level, status, sort_order, owner_user_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NULL)
      `,
      [
        input.id,
        input.textbookId,
        input.parentId,
        input.code,
        input.name,
        input.kind,
        input.promptHint,
        input.sourceRef,
        input.level,
        input.status,
        input.sortOrder,
      ],
    );
  }

  async linkKnowledge(
    client: PoolClient,
    knowledgePointId: string,
    certificateId: string,
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO knowledge_point_certificates (knowledge_point_id, certificate_id)
        VALUES ($1, $2)
      `,
      [knowledgePointId, certificateId],
    );
  }

  async updateKnowledge(
    client: PoolClient,
    id: string,
    patch: {
      code: string;
      name: string;
      kind: CatalogNodeKind;
      promptHint: string | null;
      sourceRef: string | null;
      status: PublishStatus;
      sortOrder: number;
      parentId: string | null;
    },
  ): Promise<void> {
    await client.query(
      `
        UPDATE knowledge_points
        SET code = $2,
            name = $3,
            kind = $4,
            prompt_hint = $5,
            source_ref = $6,
            status = $7,
            sort_order = $8,
            parent_id = $9,
            updated_at = now()
        WHERE id = $1 AND owner_user_id IS NULL
      `,
      [
        id,
        patch.code,
        patch.name,
        patch.kind,
        patch.promptHint,
        patch.sourceRef,
        patch.status,
        patch.sortOrder,
        patch.parentId,
      ],
    );
  }

  async isInSubtree(client: PoolClient, rootId: string, candidateId: string): Promise<boolean> {
    const result = await client.query(
      `
        WITH RECURSIVE subtree AS (
          SELECT id, ARRAY[id] AS path FROM knowledge_points WHERE id = $1
          UNION ALL
          SELECT kp.id, subtree.path || kp.id
          FROM knowledge_points kp
          JOIN subtree ON kp.parent_id = subtree.id
          WHERE NOT kp.id = ANY(subtree.path)
        )
        SELECT 1 FROM subtree WHERE id = $2 LIMIT 1
      `,
      [rootId, candidateId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async subtreeLevelBounds(
    client: PoolClient,
    rootId: string,
  ): Promise<{ min: number; max: number }> {
    const result = await client.query<{ min_level: number; max_level: number }>(
      `
        WITH RECURSIVE subtree AS (
          SELECT id, level, ARRAY[id] AS path FROM knowledge_points WHERE id = $1
          UNION ALL
          SELECT kp.id, kp.level, subtree.path || kp.id
          FROM knowledge_points kp
          JOIN subtree ON kp.parent_id = subtree.id
          WHERE NOT kp.id = ANY(subtree.path)
        )
        SELECT MIN(level)::int AS min_level, MAX(level)::int AS max_level FROM subtree
      `,
      [rootId],
    );
    return {
      min: result.rows[0]?.min_level ?? 1,
      max: result.rows[0]?.max_level ?? 1,
    };
  }

  async shiftLevels(client: PoolClient, rootId: string, delta: number): Promise<void> {
    if (delta === 0) {
      return;
    }
    await client.query(
      `
        WITH RECURSIVE subtree AS (
          SELECT id, ARRAY[id] AS path FROM knowledge_points WHERE id = $1
          UNION ALL
          SELECT kp.id, subtree.path || kp.id
          FROM knowledge_points kp
          JOIN subtree ON kp.parent_id = subtree.id
          WHERE NOT kp.id = ANY(subtree.path)
        )
        UPDATE knowledge_points
        SET level = level + $2, updated_at = now()
        WHERE id IN (SELECT id FROM subtree)
      `,
      [rootId, delta],
    );
  }

  async subtreeUsage(
    client: PoolClient,
    rootId: string,
  ): Promise<{ packPoints: number; userPoints: number }> {
    const result = await client.query<{ pack_points: number; user_points: number }>(
      `
        WITH RECURSIVE subtree AS (
          SELECT id, owner_user_id, ARRAY[id] AS path FROM knowledge_points WHERE id = $1
          UNION ALL
          SELECT kp.id, kp.owner_user_id, subtree.path || kp.id
          FROM knowledge_points kp
          JOIN subtree ON kp.parent_id = subtree.id
          WHERE NOT kp.id = ANY(subtree.path)
        )
        SELECT
          (
            SELECT COUNT(*)::int
            FROM pack_knowledge_points pkp
            WHERE pkp.knowledge_point_id IN (SELECT id FROM subtree)
          ) AS pack_points,
          (
            SELECT COUNT(*)::int FROM subtree WHERE owner_user_id IS NOT NULL
          ) AS user_points
      `,
      [rootId],
    );
    const row = result.rows[0];
    return { packPoints: row?.pack_points ?? 0, userPoints: row?.user_points ?? 0 };
  }

  async deleteKnowledgeSubtree(client: PoolClient, rootId: string): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const result = await client.query(
        `
          WITH RECURSIVE subtree AS (
            SELECT id, ARRAY[id] AS path
            FROM knowledge_points
            WHERE id = $1 AND owner_user_id IS NULL
            UNION ALL
            SELECT kp.id, subtree.path || kp.id
            FROM knowledge_points kp
            JOIN subtree ON kp.parent_id = subtree.id
            WHERE kp.owner_user_id IS NULL AND NOT kp.id = ANY(subtree.path)
          )
          DELETE FROM knowledge_points kp
          WHERE kp.id IN (SELECT id FROM subtree)
            AND NOT EXISTS (
              SELECT 1 FROM knowledge_points child WHERE child.parent_id = kp.id
            )
        `,
        [rootId],
      );
      if ((result.rowCount ?? 0) === 0) {
        break;
      }
    }
    const left = await client.query(`SELECT 1 FROM knowledge_points WHERE id = $1`, [rootId]);
    if ((left.rowCount ?? 0) > 0) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        ApiErrorCode.CATALOG_IN_USE,
        '知识点或子节点仍被引用，不能删除。可以改为下架。',
      );
    }
  }

  private async read<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof ApiException) {
        throw error;
      }
      if (isPgCode(error, '22P02')) {
        return null as T;
      }
      rethrowDatabaseError('admin-catalog', error);
    }
  }

  private pool(): Pool {
    return this.database.requirePool();
  }
}

const CERTIFICATE_COLUMNS = `
  id, domain_id, code, name, status, total_score, pass_score,
  enabled_question_type_codes, extra_constraint, sort_order
`;

const CERTIFICATE_SELECT = `SELECT ${CERTIFICATE_COLUMNS} FROM certificates`;

const TEXTBOOK_SELECT = `
  SELECT
    tb.id,
    tb.code,
    tb.name,
    tb.status,
    tb.sort_order,
    COALESCE(
      (
        SELECT array_agg(tc.certificate_id ORDER BY tc.certificate_id)
        FROM textbook_certificates tc
        WHERE tc.textbook_id = tb.id
      ),
      '{}'
    ) AS certificate_ids
  FROM textbooks tb
`;

const KNOWLEDGE_SELECT = `
  SELECT
    id, textbook_id, parent_id, code, name, kind, prompt_hint, source_ref,
    level, status, sort_order, owner_user_id
  FROM knowledge_points
`;

interface SqlField {
  column: string;
  value: unknown;
  cast?: string;
}

function assign(fields: readonly SqlField[]): string {
  return fields
    .map((field, index) => {
      const cast = field.cast ? `::${field.cast}` : '';
      return `${field.column} = $${index + 1}${cast}`;
    })
    .join(', ');
}

function domainFields(patch: Partial<Omit<DomainWrite, 'id'>>): SqlField[] {
  const fields: SqlField[] = [];
  if (patch.code !== undefined) {
    fields.push({ column: 'code', value: patch.code });
  }
  if (patch.name !== undefined) {
    fields.push({ column: 'name', value: patch.name });
  }
  if (patch.status !== undefined) {
    fields.push({ column: 'status', value: patch.status });
  }
  if (patch.sortOrder !== undefined) {
    fields.push({ column: 'sort_order', value: patch.sortOrder });
  }
  return fields;
}

function certificateFields(patch: Partial<Omit<CertificateWrite, 'id' | 'domainId'>>): SqlField[] {
  const fields: SqlField[] = [];
  if (patch.code !== undefined) {
    fields.push({ column: 'code', value: patch.code });
  }
  if (patch.name !== undefined) {
    fields.push({ column: 'name', value: patch.name });
  }
  if (patch.status !== undefined) {
    fields.push({ column: 'status', value: patch.status });
  }
  if (patch.totalScore !== undefined) {
    fields.push({ column: 'total_score', value: patch.totalScore });
  }
  if (patch.passScore !== undefined) {
    fields.push({ column: 'pass_score', value: patch.passScore });
  }
  if (patch.enabledQuestionTypeCodes !== undefined) {
    fields.push({
      column: 'enabled_question_type_codes',
      value: patch.enabledQuestionTypeCodes,
      cast: 'text[]',
    });
  }
  if (patch.extraConstraint !== undefined) {
    fields.push({ column: 'extra_constraint', value: patch.extraConstraint });
  }
  if (patch.sortOrder !== undefined) {
    fields.push({ column: 'sort_order', value: patch.sortOrder });
  }
  return fields;
}

function textbookFields(patch: Partial<Omit<TextbookWrite, 'id'>>): SqlField[] {
  const fields: SqlField[] = [];
  if (patch.code !== undefined) {
    fields.push({ column: 'code', value: patch.code });
  }
  if (patch.name !== undefined) {
    fields.push({ column: 'name', value: patch.name });
  }
  if (patch.status !== undefined) {
    fields.push({ column: 'status', value: patch.status });
  }
  if (patch.sortOrder !== undefined) {
    fields.push({ column: 'sort_order', value: patch.sortOrder });
  }
  return fields;
}

function mapDomain(row: DomainSql): AdminDomain {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: asStatus(row.status),
    sortOrder: row.sort_order,
  };
}

function mapCertificate(row: CertificateSql): AdminCertificate {
  return {
    id: row.id,
    domainId: row.domain_id,
    code: row.code,
    name: row.name,
    status: asStatus(row.status),
    totalScore: Number(row.total_score),
    passScore: row.pass_score === null ? null : Number(row.pass_score),
    enabledQuestionTypeCodes: row.enabled_question_type_codes ?? [],
    extraConstraint: row.extra_constraint,
    sortOrder: row.sort_order,
  };
}

function mapTextbook(row: TextbookSql): AdminTextbookSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: asStatus(row.status),
    sortOrder: row.sort_order,
    certificateIds: row.certificate_ids ?? [],
  };
}

function mapKnowledgeRow(row: KnowledgeSql): AdminKnowledgeRow {
  return {
    id: row.id,
    textbookId: row.textbook_id,
    parentId: row.parent_id,
    code: row.code,
    name: row.name,
    kind: asKind(row.kind),
    promptHint: row.prompt_hint,
    sourceRef: row.source_ref,
    level: row.level,
    status: asStatus(row.status),
    sortOrder: row.sort_order,
  };
}

function mapOfficialKnowledge(row: KnowledgeSql): OfficialKnowledge {
  return { ...mapKnowledgeRow(row), ownerUserId: row.owner_user_id };
}

function asStatus(value: string): PublishStatus {
  return value === 'online' ? 'online' : 'offline';
}

function asKind(value: string): CatalogNodeKind {
  return value === 'group' ? 'group' : 'knowledge_point';
}
