import { Inject, Injectable } from '@nestjs/common';
import {
  ADMIN_USER_STATUSES,
  type AdminUserStatus,
  type AdminUserSummary,
} from '@tishuashua/shared';
import { isMaskedPhone } from '../auth/phone-mask';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminUserQuery } from './admin-users.query';
import { maskAdminNick } from './nick-mask';

interface UserRow {
  id: string;
  nick: string | null;
  phone_masked: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
}

const FILTER_SQL = `($1::text = 'all' OR status = $1)`;

@Injectable()
export class AdminUserRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(query: AdminUserQuery): Promise<{ items: AdminUserSummary[]; total: number }> {
    const filters = [query.status];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total FROM users WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<UserRow>(
        `
          SELECT id, nick, phone_masked, status, created_at, updated_at
          FROM users
          WHERE ${FILTER_SQL}
          ORDER BY created_at DESC, id DESC
          LIMIT $2 OFFSET $3
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map(toSummary),
      };
    } catch (error) {
      rethrowDatabaseError('admin-users', error);
    }
  }

  async find(userId: string): Promise<AdminUserSummary | null> {
    try {
      const result = await this.database.requirePool().query<UserRow>(
        `
          SELECT id, nick, phone_masked, status, created_at, updated_at
          FROM users
          WHERE id = $1
        `,
        [userId],
      );
      const row = result.rows[0];
      return row ? toSummary(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-users', error);
    }
  }
}

function toSummary(row: UserRow): AdminUserSummary {
  const phone = readPhone(row.phone_masked);
  return {
    id: row.id,
    nick: maskAdminNick(row.nick),
    phoneMasked: phone.phoneMasked,
    phoneBound: phone.phoneBound,
    status: asStatus(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

/** 库里若不是脱敏号码，就不回传，避免把完整号码带出后管。 */
function readPhone(value: string | null): { phoneMasked: string | null; phoneBound: boolean } {
  if (!value || !isMaskedPhone(value)) {
    return { phoneMasked: null, phoneBound: false };
  }
  return { phoneMasked: value, phoneBound: true };
}

function asStatus(value: string): AdminUserStatus {
  return (ADMIN_USER_STATUSES as readonly string[]).includes(value)
    ? (value as AdminUserStatus)
    : 'active';
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : '';
}
