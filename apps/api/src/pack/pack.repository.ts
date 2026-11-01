import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type PackKnowledgePoint, type PackView } from '@tishuashua/shared';
import type { Pool, PoolClient } from 'pg';
import { ApiException } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

export interface DomainRecord {
  id: string;
  name: string;
  status: string;
}

export interface CertificateRecord {
  id: string;
  domainId: string;
  name: string;
  status: string;
}

type Queryable = Pool | PoolClient;

interface PackRow {
  id: string;
  user_id: string;
  domain_id: string;
  cert_id: string;
  name: string;
  active: boolean;
  domain_name: string;
  cert_name: string;
  unavailable: boolean;
  knowledge_points: unknown;
}

const PACK_SELECT = `
  SELECT
    p.id,
    p.user_id,
    p.domain_id,
    p.cert_id,
    p.name,
    p.active,
    d.name AS domain_name,
    c.name AS cert_name,
    (c.status IS DISTINCT FROM 'online') AS unavailable,
    COALESCE(
      jsonb_agg(
        jsonb_build_object('id', kp.id, 'name', kp.name)
        ORDER BY pkp.position
      ) FILTER (WHERE kp.id IS NOT NULL),
      '[]'::jsonb
    ) AS knowledge_points
  FROM packs p
  JOIN domains d ON d.id = p.domain_id
  JOIN certificates c ON c.id = p.cert_id
  LEFT JOIN pack_knowledge_points pkp ON pkp.pack_id = p.id
  LEFT JOIN knowledge_points kp ON kp.id = pkp.knowledge_point_id
`;

@Injectable()
export class PackRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.database.requirePool().connect();
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
        throw new ApiException(
          HttpStatus.CONFLICT,
          ApiErrorCode.VALIDATION_ERROR,
          '操作冲突，请重试',
        );
      }
      rethrowDatabaseError('packs', error);
    } finally {
      client.release();
    }
  }

  async list(userId: string): Promise<PackView[]> {
    try {
      const result = await this.database.requirePool().query<PackRow>(
        `
          ${PACK_SELECT}
          WHERE p.user_id = $1
          GROUP BY p.id, d.name, c.name, c.status
          ORDER BY p.active DESC, p.updated_at DESC
        `,
        [userId],
      );
      return result.rows.map(mapPack);
    } catch (error) {
      rethrowDatabaseError('packs', error);
    }
  }

  async findById(
    userId: string,
    packId: string,
    db: Queryable = this.database.requirePool(),
  ): Promise<PackView | null> {
    try {
      const result = await db.query<PackRow>(
        `
          ${PACK_SELECT}
          WHERE p.user_id = $1 AND p.id = $2
          GROUP BY p.id, d.name, c.name, c.status
        `,
        [userId, packId],
      );
      const row = result.rows[0];
      return row ? mapPack(row) : null;
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      rethrowDatabaseError('packs', error);
    }
  }

  async lockUser(client: PoolClient, userId: string): Promise<void> {
    const result = await client.query(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, [userId]);
    if (result.rowCount === 0) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.UNAUTHORIZED,
        '登录已失效，请重新登录',
      );
    }
  }

  async findDomain(client: PoolClient, domainId: string): Promise<DomainRecord | null> {
    const result = await client.query<{ id: string; name: string; status: string }>(
      `SELECT id, name, status FROM domains WHERE id = $1`,
      [domainId],
    );
    return result.rows[0] ?? null;
  }

  async findCertificate(client: PoolClient, certId: string): Promise<CertificateRecord | null> {
    const result = await client.query<{
      id: string;
      domain_id: string;
      name: string;
      status: string;
    }>(`SELECT id, domain_id, name, status FROM certificates WHERE id = $1`, [certId]);
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      domainId: row.domain_id,
      name: row.name,
      status: row.status,
    };
  }

  async findSelectableKnowledgePoints(
    client: PoolClient,
    certId: string,
    ids: readonly string[],
  ): Promise<PackKnowledgePoint[]> {
    const result = await client.query<{ id: string; name: string }>(
      `
        SELECT kp.id, kp.name
        FROM knowledge_points kp
        LEFT JOIN textbooks tb ON tb.id = kp.textbook_id
        WHERE kp.id = ANY($1::uuid[])
          AND kp.kind = 'knowledge_point'
          AND kp.status = 'online'
          AND (
            (
              kp.textbook_id IS NOT NULL
              AND tb.status = 'online'
              AND EXISTS (
                SELECT 1
                FROM textbook_certificates tc
                WHERE tc.textbook_id = kp.textbook_id
                  AND tc.certificate_id = $2
              )
            )
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
      `,
      [ids, certId],
    );
    return result.rows;
  }

  async deactivateAll(client: PoolClient, userId: string): Promise<void> {
    await client.query(
      `UPDATE packs SET active = false, updated_at = now() WHERE user_id = $1 AND active = true`,
      [userId],
    );
  }

  async insertPack(
    client: PoolClient,
    input: { id: string; userId: string; domainId: string; certId: string; name: string },
  ): Promise<void> {
    await client.query(
      `
        INSERT INTO packs (id, user_id, domain_id, cert_id, name, active)
        VALUES ($1, $2, $3, $4, $5, true)
      `,
      [input.id, input.userId, input.domainId, input.certId, input.name],
    );
  }

  async replaceKnowledgePoints(
    client: PoolClient,
    packId: string,
    ids: readonly string[],
  ): Promise<void> {
    await client.query(`DELETE FROM pack_knowledge_points WHERE pack_id = $1`, [packId]);
    await client.query(
      `
        INSERT INTO pack_knowledge_points (pack_id, knowledge_point_id, position)
        SELECT $1, item.id, item.ordinal::integer
        FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, ordinal)
      `,
      [packId, ids],
    );
  }

  async rename(client: PoolClient, packId: string, userId: string, name: string): Promise<void> {
    await client.query(
      `UPDATE packs SET name = $3, updated_at = now() WHERE id = $1 AND user_id = $2`,
      [packId, userId, name],
    );
  }

  async markActive(client: PoolClient, packId: string, userId: string): Promise<void> {
    await client.query(
      `UPDATE packs SET active = true, updated_at = now() WHERE id = $1 AND user_id = $2`,
      [packId, userId],
    );
  }

  async deletePack(client: PoolClient, packId: string, userId: string): Promise<void> {
    await client.query(`DELETE FROM packs WHERE id = $1 AND user_id = $2`, [packId, userId]);
  }

  async promoteLatest(client: PoolClient, userId: string): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `
        UPDATE packs
        SET active = true, updated_at = now()
        WHERE id = (
          SELECT id
          FROM packs
          WHERE user_id = $1
          ORDER BY updated_at DESC, created_at DESC
          LIMIT 1
        )
        RETURNING id
      `,
      [userId],
    );
    return result.rows[0]?.id ?? null;
  }

  async findActiveId(client: PoolClient, userId: string): Promise<string | null> {
    const result = await client.query<{ id: string }>(
      `SELECT id FROM packs WHERE user_id = $1 AND active = true`,
      [userId],
    );
    return result.rows[0]?.id ?? null;
  }
}

function mapPack(row: PackRow): PackView {
  const knowledgePoints = parseKnowledgePoints(row.knowledge_points);
  return {
    id: row.id,
    userId: row.user_id,
    domainId: row.domain_id,
    certId: row.cert_id,
    name: row.name,
    knowledgePointIds: knowledgePoints.map((item) => item.id),
    knowledgePoints,
    knowledgePointCount: knowledgePoints.length,
    domainName: row.domain_name,
    certName: row.cert_name,
    active: row.active,
    unavailable: row.unavailable,
  };
}

function parseKnowledgePoints(value: unknown): PackKnowledgePoint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const points: PackKnowledgePoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const name = 'name' in item && typeof item.name === 'string' ? item.name : '';
    if (!id || !name) {
      continue;
    }
    points.push({ id, name });
  }
  return points;
}
