import { Inject, Injectable } from '@nestjs/common';
import {
  summarizeQuestionBankStem,
  type AdminQuestionBankDetail,
  type AdminQuestionBankSummary,
  type BankIngestSource,
  type BankStatus,
  type QuizDifficulty,
  type QuizOption,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';
import type { AdminQuestionBankQuery } from './admin-question-bank.query';

interface BankRow {
  id: string;
  stem: string;
  domain_id: string;
  domain_name: string;
  certificate_id: string;
  certificate_name: string;
  kp_ids: unknown;
  knowledge_label: string | null;
  source: string;
  created_at: Date | string;
  type_code?: string;
  options?: unknown;
  answer?: unknown;
  analysis?: string | null;
  difficulty?: string | null;
  status?: string;
}

const FILTER_SQL = `
  ($1::uuid IS NULL OR qb.domain_id = $1::uuid)
  AND ($2::uuid IS NULL OR qb.certificate_id = $2::uuid)
  AND ($3::uuid IS NULL OR $3::uuid = ANY (qb.kp_ids))
  AND (
    $4::text = 'all'
    OR ($4::text = '7d' AND qb.created_at >= now() - interval '7 days')
    OR ($4::text = '30d' AND qb.created_at >= now() - interval '30 days')
    OR ($4::text = '90d' AND qb.created_at >= now() - interval '90 days')
  )
`;

const LIST_SELECT = `
  qb.id,
  qb.stem,
  qb.domain_id,
  d.name AS domain_name,
  qb.certificate_id,
  c.name AS certificate_name,
  qb.kp_ids,
  COALESCE((
    SELECT string_agg(kp.name, '、' ORDER BY kp.sort_order, kp.name)
    FROM knowledge_points kp
    WHERE kp.id = ANY (qb.kp_ids)
  ), '') AS knowledge_label,
  qb.source,
  qb.created_at
`;

@Injectable()
export class AdminQuestionBankRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async list(
    query: AdminQuestionBankQuery,
  ): Promise<{ items: AdminQuestionBankSummary[]; total: number }> {
    const filters = [query.domainId, query.certificateId, query.knowledgePointId, query.range];
    try {
      const pool = this.database.requirePool();
      const count = await pool.query<{ total: number | string }>(
        `SELECT COUNT(*)::int AS total FROM question_bank qb WHERE ${FILTER_SQL}`,
        filters,
      );
      const result = await pool.query<BankRow>(
        `
          SELECT ${LIST_SELECT}
          FROM question_bank qb
          JOIN domains d ON d.id = qb.domain_id
          JOIN certificates c ON c.id = qb.certificate_id
          WHERE ${FILTER_SQL}
          ORDER BY qb.created_at DESC, qb.id
          LIMIT $5 OFFSET $6
        `,
        [...filters, query.pageSize, (query.page - 1) * query.pageSize],
      );
      return {
        total: Number(count.rows[0]?.total ?? 0),
        items: result.rows.map((row) => toSummary(row)),
      };
    } catch (error) {
      rethrowDatabaseError('admin-question-bank', error);
    }
  }

  async find(id: string): Promise<AdminQuestionBankDetail | null> {
    try {
      const result = await this.database.requirePool().query<BankRow>(
        `
          SELECT
            ${LIST_SELECT},
            qb.type_code,
            qb.options,
            qb.answer,
            qb.analysis,
            qb.difficulty,
            qb.status
          FROM question_bank qb
          JOIN domains d ON d.id = qb.domain_id
          JOIN certificates c ON c.id = qb.certificate_id
          WHERE qb.id = $1
        `,
        [id],
      );
      const row = result.rows[0];
      return row ? toDetail(row) : null;
    } catch (error) {
      rethrowDatabaseError('admin-question-bank', error);
    }
  }
}

function toSummary(row: BankRow): AdminQuestionBankSummary {
  const stem = row.stem.trim() ? row.stem.trim() : '';
  return {
    id: row.id,
    summary: summarizeQuestionBankStem(stem),
    domainId: row.domain_id,
    domainName: row.domain_name,
    certificateId: row.certificate_id,
    certificateName: row.certificate_name,
    kpIds: readIds(row.kp_ids),
    knowledgeLabel: row.knowledge_label?.trim() ?? '',
    source: asSource(row.source),
    createdAt: toIso(row.created_at),
  };
}

function toDetail(row: BankRow): AdminQuestionBankDetail {
  const summary = toSummary(row);
  const stem = row.stem.trim();
  return {
    ...summary,
    stem: stem || '题目内容无法读取',
    type: asType(row.type_code),
    options: readOptions(row.options),
    answer: readAnswer(row.answer),
    analysis: row.analysis?.trim() ? row.analysis.trim() : null,
    difficulty: asDifficulty(row.difficulty),
    status: asStatus(row.status),
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

function readOptions(value: unknown): QuizOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: QuizOption[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const body = item as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id : '';
    const text = typeof body.text === 'string' ? body.text : '';
    if (!id && !text) {
      continue;
    }
    options.push({ id, text });
  }
  return options;
}

function readAnswer(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function asSource(value: string): BankIngestSource {
  return value === 'ai_variant' ? 'ai_variant' : 'ai';
}

function asType(value: string | undefined): QuizTypeCode {
  return value === 'multi' || value === 'judge' ? value : 'single';
}

function asDifficulty(value: string | null | undefined): QuizDifficulty | null {
  return value === 'easy' || value === 'medium' || value === 'hard' ? value : null;
}

function asStatus(value: string | undefined): BankStatus {
  return value === 'offline' ? 'offline' : 'online';
}
