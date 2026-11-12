import { Inject, Injectable } from '@nestjs/common';
import {
  countRetentionTargets,
  insertAdminAudit,
  listAdminSystemAudit,
  readAdminRoleMatrix,
  readDataRetention,
  runDataRetentionPurge,
  writeAdminRoleMatrix,
  writeDataRetention,
  type AdminRoleMatrixRecord,
  type AdminSystemAuditPage,
  type DataRetentionRecord,
} from '@tishuashua/shared/admin-system';
import type {
  AdminRoleMatrix,
  DataRetention,
  RetentionPreview,
  SettingsDb,
  SystemAuditQuery,
} from '@tishuashua/shared';
import type { PoolClient } from 'pg';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

@Injectable()
export class AdminSystemService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async getRoles(): Promise<AdminRoleMatrixRecord> {
    try {
      return await readAdminRoleMatrix(this.db());
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    }
  }

  async putRoles(matrix: AdminRoleMatrix, actor: string): Promise<AdminRoleMatrixRecord> {
    const client = await this.database.requirePool().connect();
    try {
      return await writeAdminRoleMatrix(asDb(client), matrix, actor);
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    } finally {
      client.release();
    }
  }

  async getRetention(): Promise<DataRetentionRecord> {
    try {
      return await readDataRetention(this.db());
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    }
  }

  async putRetention(retention: DataRetention, actor: string): Promise<DataRetentionRecord> {
    const client = await this.database.requirePool().connect();
    try {
      return await writeDataRetention(asDb(client), retention, actor);
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    } finally {
      client.release();
    }
  }

  async previewRetention(retention: DataRetention, now = new Date()): Promise<RetentionPreview> {
    try {
      return await countRetentionTargets(this.db(), retention, now);
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    }
  }

  async listAudit(query: SystemAuditQuery): Promise<AdminSystemAuditPage> {
    try {
      return await listAdminSystemAudit(this.db(), query);
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    }
  }

  async purgeRetention(now = new Date()): Promise<RetentionPreview> {
    const client = await this.database.requirePool().connect();
    try {
      return await runDataRetentionPurge(asDb(client), now);
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    } finally {
      client.release();
    }
  }

  async auditFreeUserBankFirst(
    actor: string,
    beforeEnabled: boolean,
    afterEnabled: boolean,
  ): Promise<void> {
    try {
      await insertAdminAudit(this.db(), {
        actor,
        action: 'system.freeUserBankFirst.update',
        target: 'setting:freeUserBankFirst',
        before: { enabled: beforeEnabled },
        after: { enabled: afterEnabled },
      });
    } catch (error) {
      rethrowDatabaseError('admin-system', error);
    }
  }

  private db(): SettingsDb {
    const pool = this.database.requirePool();
    return { query: (sql, params) => pool.query(sql, params) };
  }
}

function asDb(client: PoolClient): SettingsDb {
  return { query: (sql, params) => client.query(sql, params) };
}
