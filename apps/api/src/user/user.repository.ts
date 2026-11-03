import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode, type UserStatus, type UserSummary } from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import type { QueryResult } from 'pg';
import { isMaskedPhone } from '../auth/phone-mask';
import { ApiException, logServerError } from '../common/api.exception';
import { DatabaseService } from '../db/database.service';

export interface UpsertUserInput {
  wxOpenId: string;
  unionId: string | null;
  nick: string | null;
  avatar: string | null;
}

interface UserRow {
  id: string;
  wx_open_id: string;
  union_id: string | null;
  nick: string | null;
  phone_masked: string | null;
  avatar: string | null;
  status: string;
}

const USER_COLUMNS = `
  id, wx_open_id, union_id, nick, phone_masked, avatar, status
`;

@Injectable()
export class UserRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async upsertByOpenId(input: UpsertUserInput): Promise<UserSummary> {
    const pool = this.database.requirePool();
    try {
      const result = await pool.query<UserRow>(
        `
          INSERT INTO users (id, wx_open_id, union_id, nick, avatar)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (wx_open_id) DO UPDATE SET
            union_id = COALESCE(EXCLUDED.union_id, users.union_id),
            nick = COALESCE(EXCLUDED.nick, users.nick),
            avatar = COALESCE(EXCLUDED.avatar, users.avatar),
            updated_at = now()
          RETURNING ${USER_COLUMNS}
        `,
        [randomUUID(), input.wxOpenId, input.unionId, input.nick, input.avatar],
      );
      return mapUser(requiredRow(result));
    } catch (error) {
      throw this.asDatabaseError(error);
    }
  }

  async bindPhone(id: string, phoneMasked: string): Promise<UserSummary> {
    if (!isMaskedPhone(phoneMasked)) {
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ApiErrorCode.INTERNAL,
        '手机号未能脱敏',
      );
    }
    const pool = this.database.requirePool();
    try {
      const result = await pool.query<UserRow>(
        `
          UPDATE users
          SET phone_masked = $2, updated_at = now()
          WHERE id = $1
          RETURNING ${USER_COLUMNS}
        `,
        [id, phoneMasked],
      );
      const row = result.rows[0];
      if (!row) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '用户不存在');
      }
      return mapUser(row);
    } catch (error) {
      throw this.asDatabaseError(error);
    }
  }

  async findById(id: string): Promise<UserSummary | null> {
    const pool = this.database.requirePool();
    try {
      const result = await pool.query<UserRow>(`SELECT ${USER_COLUMNS} FROM users WHERE id = $1`, [
        id,
      ]);
      const row = result.rows[0];
      return row ? mapUser(row) : null;
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      throw this.asDatabaseError(error);
    }
  }

  private asDatabaseError(error: unknown): ApiException {
    if (error instanceof ApiException) {
      return error;
    }
    logServerError('postgres', error);
    return new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ApiErrorCode.DATABASE_UNAVAILABLE,
      '数据库不可用',
    );
  }
}

function requiredRow(result: QueryResult<UserRow>): UserRow {
  const row = result.rows[0];
  if (!row) {
    throw new ApiException(
      HttpStatus.SERVICE_UNAVAILABLE,
      ApiErrorCode.DATABASE_UNAVAILABLE,
      '数据库不可用',
    );
  }
  return row;
}

function mapUser(row: UserRow): UserSummary {
  return {
    id: row.id,
    wxOpenId: row.wx_open_id,
    unionId: row.union_id,
    nick: row.nick,
    phoneMasked: row.phone_masked,
    phoneBound: Boolean(row.phone_masked),
    avatar: row.avatar,
    status: asStatus(row.status),
  };
}

function asStatus(value: string): UserStatus {
  return value === 'banned' ? 'banned' : 'active';
}

function isPgCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}
