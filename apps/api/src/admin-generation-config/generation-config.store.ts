import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../db/database.service';

export interface AuditWrite {
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
}

@Injectable()
export class GenerationConfigStore {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  pool(): Pool {
    return this.database.requirePool();
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
      throw error;
    } finally {
      client.release();
    }
  }

  async audit(client: PoolClient, input: AuditWrite): Promise<void> {
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
}
