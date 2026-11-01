import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/** 固定锁，避免多个 API 进程同时跑迁移。 */
const MIGRATION_LOCK_KEY = 861021;

export async function migrate(pool: Pool, directory: string): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(directory)).filter((name) => name.endsWith('.sql')).sort();
    const applied: string[] = [];

    for (const file of files) {
      const existing = await client.query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
      if (existing.rowCount) {
        continue;
      }
      const sql = await readFile(join(directory, file), 'utf8');
      await applyFile(client, file, sqlStatements(sql));
      applied.push(file);
    }

    return applied;
  } finally {
    await client
      .query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}

function sqlStatements(sql: string): string[] {
  return sql
    .split(';')
    .map((part) => part.trim())
    .filter((part) =>
      part.split('\n').some((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      }),
    );
}

async function applyFile(client: PoolClient, file: string, statements: string[]): Promise<void> {
  try {
    await client.query('BEGIN');
    for (const statement of statements) {
      await client.query(statement);
    }
    await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }
}
