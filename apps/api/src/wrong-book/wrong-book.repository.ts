import { Inject, Injectable } from '@nestjs/common';
import {
  QUIZ_TYPES,
  type QuizOption,
  type QuizTypeCode,
  type WrongBookItem,
  type WrongItemStatus,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

interface WrongRow {
  id: string;
  cert_id: string;
  cert_name: string;
  status: string;
  wrong_count: number | string;
  kp_ids: string[] | null;
  kp_names: string[] | null;
  question_snapshot: unknown;
  updated_at: Date | string;
}

@Injectable()
export class WrongBookRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(userId: string, status: WrongItemStatus | 'all'): Promise<WrongBookItem[]> {
    try {
      const result = await this.database.requirePool().query<WrongRow>(
        `
          SELECT
            w.id,
            w.cert_id,
            c.name AS cert_name,
            w.status,
            w.wrong_count,
            w.kp_ids,
            ${KP_NAMES_SQL} AS kp_names,
            w.question_snapshot,
            w.updated_at
          FROM wrong_items w
          JOIN certificates c ON c.id = w.cert_id
          WHERE w.user_id = $1
            AND ($2::text = 'all' OR w.status = $2)
          ORDER BY w.updated_at DESC, w.id
          LIMIT 100
        `,
        [userId, status],
      );
      return result.rows.map(mapItem);
    } catch (error) {
      rethrowDatabaseError('wrong-book', error);
    }
  }

  async find(userId: string, itemId: string): Promise<WrongBookItem | null> {
    try {
      const result = await this.database.requirePool().query<WrongRow>(
        `
          SELECT
            w.id,
            w.cert_id,
            c.name AS cert_name,
            w.status,
            w.wrong_count,
            w.kp_ids,
            ${KP_NAMES_SQL} AS kp_names,
            w.question_snapshot,
            w.updated_at
          FROM wrong_items w
          JOIN certificates c ON c.id = w.cert_id
          WHERE w.user_id = $1 AND w.id = $2
        `,
        [userId, itemId],
      );
      const row = result.rows[0];
      return row ? mapItem(row) : null;
    } catch (error) {
      rethrowDatabaseError('wrong-book', error);
    }
  }

  async clear(userId: string, itemId: string): Promise<'missing' | 'cleared'> {
    try {
      const result = await this.database.requirePool().query<{ id: string }>(
        `
          UPDATE wrong_items
          SET status = 'cleared', updated_at = now()
          WHERE id = $1 AND user_id = $2
          RETURNING id
        `,
        [itemId, userId],
      );
      return result.rows[0] ? 'cleared' : 'missing';
    } catch (error) {
      rethrowDatabaseError('wrong-book', error);
    }
  }
}

const KP_NAMES_SQL = `
  COALESCE(
    (
      SELECT array_agg(COALESCE(kp.name, '') ORDER BY u.ord)
      FROM unnest(w.kp_ids) WITH ORDINALITY AS u(id, ord)
      LEFT JOIN knowledge_points kp ON kp.id = u.id
    ),
    ARRAY[]::text[]
  )
`;

function alignNames(ids: string[] | null, names: string[] | null): string[] {
  const count = ids?.length ?? 0;
  if (count === 0) {
    return [];
  }
  return Array.from({ length: count }, (_item, index) => {
    const name = names?.[index];
    return typeof name === 'string' ? name : '';
  });
}

function mapItem(row: WrongRow): WrongBookItem {
  const snapshot = readSnapshot(row.question_snapshot);
  const updated = row.updated_at instanceof Date ? row.updated_at : new Date(row.updated_at);
  return {
    id: row.id,
    certId: row.cert_id,
    certName: row.cert_name,
    status: row.status === 'cleared' ? 'cleared' : 'pending',
    wrongCount: Number(row.wrong_count) || 1,
    type: snapshot.type,
    stem: snapshot.stem,
    options: snapshot.options,
    answer: snapshot.answer,
    analysis: snapshot.analysis,
    score: snapshot.score,
    kpIds: (row.kp_ids ?? []).map((id) => id.toLowerCase()),
    kpNames: alignNames(row.kp_ids, row.kp_names),
    updatedAt: Number.isFinite(updated.getTime())
      ? updated.toISOString()
      : new Date(0).toISOString(),
  };
}

function readSnapshot(value: unknown): {
  type: QuizTypeCode | null;
  stem: string;
  options: QuizOption[];
  answer: string[];
  analysis: string;
  score: number;
} {
  const empty = {
    type: null,
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
  const type = isQuizType(body.type) ? body.type : null;
  const stem = typeof body.stem === 'string' && body.stem.trim() ? body.stem.trim() : empty.stem;
  return {
    type,
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
