import { Inject, Injectable } from '@nestjs/common';
import {
  QUIZ_TYPES,
  type AdminWrongBookDetail,
  type AdminWrongBookSummary,
  type QuizOption,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminWrongBookQuery } from './admin-wrong-book.query';

interface WrongRow {
  id: string;
  user_id: string;
  user_nick: string | null;
  cert_id: string;
  cert_name: string;
  domain_id: string;
  domain_name: string;
  status: string;
  wrong_count: number | string;
  question_snapshot: unknown;
  kp_ids: unknown;
  created_at: Date | string;
  updated_at: Date | string;
}

const FILTER_SQL = `
  ($1::uuid IS NULL OR w.user_id = $1::uuid)
  AND ($2::uuid IS NULL OR w.cert_id = $2::uuid)
  AND ($3::text = 'all' OR w.status = $3)
`;

@Injectable()
export class AdminWrongBookRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminWrongBookQuery,
  ): Promise<{ items: AdminWrongBookSummary[]; total: number }> {
    const filters = [query.userId, query.certId, query.status];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total FROM wrong_items w WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<WrongRow>(
        `
          SELECT
            w.id,
            w.user_id,
            u.nick AS user_nick,
            w.cert_id,
            c.name AS cert_name,
            d.id AS domain_id,
            d.name AS domain_name,
            w.status,
            w.wrong_count,
            w.question_snapshot,
            w.kp_ids,
            w.created_at,
            w.updated_at
          FROM wrong_items w
          JOIN users u ON u.id = w.user_id
          JOIN certificates c ON c.id = w.cert_id
          JOIN domains d ON d.id = c.domain_id
          WHERE ${FILTER_SQL}
          ORDER BY w.updated_at DESC, w.id
          LIMIT $4 OFFSET $5
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(mapDetail(row))),
      };
    } catch (error) {
      rethrowDatabaseError('admin-wrong-book', error);
    }
  }

  async find(itemId: string): Promise<AdminWrongBookDetail | null> {
    try {
      const result = await this.database.requirePool().query<WrongRow>(
        `
          SELECT
            w.id,
            w.user_id,
            u.nick AS user_nick,
            w.cert_id,
            c.name AS cert_name,
            d.id AS domain_id,
            d.name AS domain_name,
            w.status,
            w.wrong_count,
            w.question_snapshot,
            w.kp_ids,
            w.created_at,
            w.updated_at
          FROM wrong_items w
          JOIN users u ON u.id = w.user_id
          JOIN certificates c ON c.id = w.cert_id
          JOIN domains d ON d.id = c.domain_id
          WHERE w.id = $1
        `,
        [itemId],
      );
      const row = result.rows[0];
      return row ? mapDetail(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-wrong-book', error);
    }
  }
}

function toSummary(item: AdminWrongBookDetail): AdminWrongBookSummary {
  return {
    id: item.id,
    userId: item.userId,
    userNick: item.userNick,
    certId: item.certId,
    certName: item.certName,
    domainId: item.domainId,
    domainName: item.domainName,
    status: item.status,
    wrongCount: item.wrongCount,
    type: item.type,
    stem: item.stem,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

function mapDetail(row: WrongRow): AdminWrongBookDetail {
  const snapshot = readSnapshot(row.question_snapshot);
  return {
    id: row.id,
    userId: row.user_id,
    userNick: row.user_nick?.trim() ? row.user_nick.trim() : null,
    certId: row.cert_id,
    certName: row.cert_name,
    domainId: row.domain_id,
    domainName: row.domain_name,
    status: row.status === 'cleared' ? 'cleared' : 'pending',
    wrongCount: Number(row.wrong_count) || 1,
    type: snapshot.type,
    stem: snapshot.stem,
    options: snapshot.options,
    answer: snapshot.answer,
    analysis: snapshot.analysis,
    score: snapshot.score,
    kpIds: readIds(row.kp_ids),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date(0).toISOString();
}

function readIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

/**
 * 与用户错题本同一套快照读法：坏快照不抛错，题干回落到「题目内容无法读取」。
 * 读法抄在这里，避免改动小程序接口。
 */
function readSnapshot(value: unknown): {
  type: QuizTypeCode | null;
  stem: string;
  options: QuizOption[];
  answer: string[];
  analysis: string;
  score: number;
} {
  const empty = {
    type: null as QuizTypeCode | null,
    stem: '题目内容无法读取',
    options: [] as QuizOption[],
    answer: [] as string[],
    analysis: '',
    score: 0,
  };
  if (!value || typeof value !== 'object') {
    return empty;
  }
  const body = value as Record<string, unknown>;
  const stem = typeof body.stem === 'string' && body.stem.trim() ? body.stem.trim() : empty.stem;
  return {
    type: isQuizType(body.type) ? body.type : null,
    stem,
    options: readOptions(body.options),
    answer: Array.isArray(body.answer)
      ? body.answer.filter((item): item is string => typeof item === 'string')
      : [],
    analysis: typeof body.analysis === 'string' ? body.analysis : '',
    score: typeof body.score === 'number' && Number.isFinite(body.score) ? body.score : 0,
  };
}

function readOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: QuizOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const id = 'id' in item && typeof item.id === 'string' ? item.id : '';
    const text = 'text' in item && typeof item.text === 'string' ? item.text : '';
    if (id && text) {
      options.push({ id, text });
    }
  }
  return options;
}

function isQuizType(value: unknown): value is QuizTypeCode {
  return typeof value === 'string' && (QUIZ_TYPES as readonly string[]).includes(value);
}
