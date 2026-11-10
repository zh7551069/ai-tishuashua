import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

export interface DailyPlanPointRow {
  id: string;
  name: string;
  position: number;
}

export interface DailyPlanPackRow {
  id: string;
  name: string;
  active: boolean;
  domainName: string;
  certName: string;
  unavailable: boolean;
  points: DailyPlanPointRow[];
}

export interface DailyPlanCompletionRow {
  packId: string;
  knowledgePointId: string;
  completedAt: Date;
}

export interface DailyPlanSessionMeta {
  status: string;
  source: string;
  mode: string;
  packId: string | null;
}

const PACK_SOFT_CAP = 50;
const POINT_SOFT_CAP = 200;

@Injectable()
export class DailyPlanRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async listPacks(userId: string): Promise<DailyPlanPackRow[]> {
    try {
      const result = await this.pool().query<{
        id: string;
        name: string;
        active: boolean;
        domain_name: string;
        cert_name: string;
        unavailable: boolean;
        points: unknown;
      }>(
        `
          SELECT
            p.id,
            p.name,
            p.active,
            d.name AS domain_name,
            c.name AS cert_name,
            (c.status IS DISTINCT FROM 'online') AS unavailable,
            COALESCE(
              jsonb_agg(
                jsonb_build_object('id', kp.id, 'name', kp.name, 'position', pkp.position)
                ORDER BY pkp.position
              ) FILTER (
                WHERE kp.id IS NOT NULL
                  AND kp.kind = 'knowledge_point'
                  AND kp.status = 'online'
              ),
              '[]'::jsonb
            ) AS points
          FROM packs p
          JOIN domains d ON d.id = p.domain_id
          JOIN certificates c ON c.id = p.cert_id
          LEFT JOIN pack_knowledge_points pkp ON pkp.pack_id = p.id
          LEFT JOIN knowledge_points kp
            ON kp.id = pkp.knowledge_point_id
           AND kp.kind = 'knowledge_point'
           AND kp.status = 'online'
          WHERE p.user_id = $1
          GROUP BY p.id, d.name, c.name, c.status
          ORDER BY p.active DESC, p.updated_at DESC, p.created_at DESC
        `,
        [userId],
      );
      const packs = result.rows.map(mapPack);
      const maxPoints = packs.reduce((max, pack) => Math.max(max, pack.points.length), 0);
      if (packs.length > PACK_SOFT_CAP || maxPoints > POINT_SOFT_CAP) {
        console.warn(
          `[api] daily-plan: userId=${userId} packs=${packs.length} maxKp=${maxPoints} exceeds soft cap, returning full payload`,
        );
      }
      return packs;
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  async listCompletions(userId: string, businessDate: string): Promise<DailyPlanCompletionRow[]> {
    try {
      const result = await this.pool().query<{
        pack_id: string;
        knowledge_point_id: string;
        completed_at: Date;
      }>(
        `
          SELECT pack_id, knowledge_point_id, completed_at
          FROM daily_plan_item_completions
          WHERE user_id = $1 AND business_date = $2::date
        `,
        [userId, businessDate],
      );
      return result.rows.map((row) => ({
        packId: row.pack_id,
        knowledgePointId: row.knowledge_point_id,
        completedAt: row.completed_at,
      }));
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  async listCompletionDates(userId: string, start: string, end: string): Promise<string[]> {
    try {
      const result = await this.pool().query<{ business_date: string }>(
        `
          SELECT to_char(business_date, 'YYYY-MM-DD') AS business_date
          FROM daily_plan_item_completions
          WHERE user_id = $1
            AND business_date >= $2::date
            AND business_date <= $3::date
          GROUP BY business_date
        `,
        [userId, start, end],
      );
      return result.rows.map((row) => row.business_date);
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  async findSessionMeta(userId: string, sessionId: string): Promise<DailyPlanSessionMeta | null> {
    try {
      const result = await this.pool().query<{
        status: string;
        source: string;
        mode: string;
        pack_id: string | null;
      }>(
        `
          SELECT status, source, mode, pack_id
          FROM quiz_sessions
          WHERE id = $1 AND user_id = $2
        `,
        [sessionId, userId],
      );
      const row = result.rows[0];
      if (!row) {
        return null;
      }
      return {
        status: row.status,
        source: row.source,
        mode: row.mode,
        packId: row.pack_id,
      };
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  /**
   * 试卷题目 kp_ids 的并集，只留本场刷题包已绑定且 kind=knowledge_point 的 id。
   * 不看创建会话时的 knowledge_point_ids。
   */
  async coveredKnowledgePointIds(sessionId: string, packId: string): Promise<string[]> {
    try {
      const result = await this.pool().query<{ id: string }>(
        `
          SELECT DISTINCT kp.id
          FROM paper_questions pq
          CROSS JOIN LATERAL unnest(COALESCE(pq.kp_ids, '{}'::uuid[])) AS kid(id)
          JOIN knowledge_points kp ON kp.id = kid.id
          JOIN pack_knowledge_points pkp
            ON pkp.pack_id = $2 AND pkp.knowledge_point_id = kp.id
          WHERE pq.session_id = $1
            AND kp.kind = 'knowledge_point'
        `,
        [sessionId, packId],
      );
      return result.rows.map((row) => row.id);
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  async upsertCompletions(input: {
    userId: string;
    businessDate: string;
    packId: string;
    knowledgePointIds: readonly string[];
    sessionId: string;
    completedAt: Date;
  }): Promise<void> {
    if (input.knowledgePointIds.length === 0) {
      return;
    }
    try {
      await this.pool().query(
        `
          INSERT INTO daily_plan_item_completions (
            user_id, business_date, pack_id, knowledge_point_id, completed_at, source_session_id
          )
          SELECT $1, $2::date, $3, id, $4, $5
          FROM unnest($6::uuid[]) AS id
          ON CONFLICT (user_id, business_date, pack_id, knowledge_point_id)
          DO NOTHING
        `,
        [
          input.userId,
          input.businessDate,
          input.packId,
          input.completedAt,
          input.sessionId,
          input.knowledgePointIds,
        ],
      );
    } catch (error) {
      rethrowDatabaseError('daily-plan', error);
    }
  }

  private pool(): Pool {
    return this.database.requirePool();
  }
}

function mapPack(row: {
  id: string;
  name: string;
  active: boolean;
  domain_name: string;
  cert_name: string;
  unavailable: boolean;
  points: unknown;
}): DailyPlanPackRow {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    domainName: row.domain_name,
    certName: row.cert_name,
    unavailable: row.unavailable,
    points: parsePoints(row.points),
  };
}

function parsePoints(value: unknown): DailyPlanPointRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const points: DailyPlanPointRow[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const name = 'name' in item && typeof item.name === 'string' ? item.name : '';
    const position = 'position' in item ? Number(item.position) : Number.NaN;
    if (!id || !name || !Number.isFinite(position)) {
      continue;
    }
    points.push({ id, name, position });
  }
  return points;
}
