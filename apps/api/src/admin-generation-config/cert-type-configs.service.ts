import { Inject, Injectable } from '@nestjs/common';
import {
  parseCertTypeConfigWrite,
  type CertQuestionTypeConfig,
  type CertQuestionTypeConfigView,
} from '@tishuashua/shared';
import type { PoolClient } from 'pg';
import {
  GenerationConfigNotFoundError,
  GenerationConfigValidationError,
} from './generation-config.errors';
import { GenerationConfigStore } from './generation-config.store';

interface CertificateRow {
  id: string;
  name: string;
  total_score: number;
  enabled_question_type_codes: string[];
}

@Injectable()
export class CertTypeConfigService {
  constructor(@Inject(GenerationConfigStore) private readonly store: GenerationConfigStore) {}

  async get(certificateId: string): Promise<CertQuestionTypeConfigView> {
    const certificate = await this.findCertificate(certificateId);
    if (!certificate) {
      throw new GenerationConfigNotFoundError('证书不存在');
    }
    const items = await this.loadItems(certificateId);
    return toView(certificate, items);
  }

  async replace(
    certificateId: string,
    body: unknown,
    actor: string,
  ): Promise<CertQuestionTypeConfigView> {
    const parsed = parseCertTypeConfigWrite(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const items = parsed.value;
    return this.store.write(async (client) => {
      const certificate = await lockCertificate(client, certificateId);
      await assertTypesExist(client, items);
      const before = await loadItemsOn(client, certificateId);
      await client.query(`DELETE FROM cert_question_type_configs WHERE certificate_id = $1`, [
        certificateId,
      ]);
      for (const item of items) {
        await client.query(
          `
            INSERT INTO cert_question_type_configs (
              certificate_id, question_type_code, default_selected,
              min_count, max_count, default_count_share, score_per_question,
              updated_at, updated_by
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $8)
          `,
          [
            certificateId,
            item.questionTypeCode,
            item.defaultSelected,
            item.minCount,
            item.maxCount,
            item.defaultCountShare,
            item.scorePerQuestion,
            actor,
          ],
        );
      }
      await this.store.audit(client, {
        actor,
        action: 'certTypeConfig.update',
        target: `certificate:${certificateId}`,
        before: { count: before.length, codes: before.map((item) => item.questionTypeCode) },
        after: { count: items.length, codes: items.map((item) => item.questionTypeCode) },
      });
      const saved = await loadItemsOn(client, certificateId);
      return toView(certificate, saved);
    });
  }

  private async findCertificate(certificateId: string): Promise<CertificateRow | null> {
    const result = await this.store.pool().query<CertificateRow>(
      `
        SELECT id, name, total_score, enabled_question_type_codes
        FROM certificates
        WHERE id = $1
      `,
      [certificateId],
    );
    return result.rows[0] ?? null;
  }

  private async loadItems(certificateId: string): Promise<CertQuestionTypeConfig[]> {
    const result = await this.store.pool().query(itemSql(), [certificateId]);
    return result.rows.map(toItem);
  }
}

async function lockCertificate(client: PoolClient, certificateId: string): Promise<CertificateRow> {
  const result = await client.query<CertificateRow>(
    `
      SELECT id, name, total_score, enabled_question_type_codes
      FROM certificates
      WHERE id = $1
      FOR UPDATE
    `,
    [certificateId],
  );
  const row = result.rows[0];
  if (!row) {
    throw new GenerationConfigNotFoundError('证书不存在');
  }
  return row;
}

async function assertTypesExist(client: PoolClient, items: readonly CertQuestionTypeConfig[]): Promise<void> {
  if (items.length === 0) {
    return;
  }
  const codes = items.map((item) => item.questionTypeCode);
  const found = await client.query<{ code: string }>(
    `SELECT code FROM question_types WHERE code = ANY($1::text[])`,
    [codes],
  );
  const known = new Set(found.rows.map((row) => row.code));
  const missing = codes.find((code) => !known.has(code));
  if (missing) {
    throw new GenerationConfigValidationError('题型不存在');
  }
}

async function loadItemsOn(
  client: PoolClient,
  certificateId: string,
): Promise<CertQuestionTypeConfig[]> {
  const result = await client.query(itemSql(), [certificateId]);
  return result.rows.map(toItem);
}

function itemSql(): string {
  return `
    SELECT
      question_type_code, default_selected, min_count, max_count,
      default_count_share, score_per_question
    FROM cert_question_type_configs
    WHERE certificate_id = $1
    ORDER BY question_type_code ASC
  `;
}

function toView(certificate: CertificateRow, items: CertQuestionTypeConfig[]): CertQuestionTypeConfigView {
  return {
    certificateId: certificate.id,
    certificateName: certificate.name,
    totalScore: Number(certificate.total_score),
    enabledQuestionTypeCodes: certificate.enabled_question_type_codes ?? [],
    items,
  };
}

function toItem(value: unknown): CertQuestionTypeConfig {
  const row = value as {
    question_type_code: string;
    default_selected: boolean;
    min_count: number | null;
    max_count: number | null;
    default_count_share: number | null;
    score_per_question: string | number | null;
  };
  return {
    questionTypeCode: row.question_type_code,
    defaultSelected: row.default_selected,
    minCount: row.min_count === null ? null : Number(row.min_count),
    maxCount: row.max_count === null ? null : Number(row.max_count),
    defaultCountShare: row.default_count_share === null ? null : Number(row.default_count_share),
    scorePerQuestion:
      row.score_per_question === null || row.score_per_question === undefined
        ? null
        : Number(row.score_per_question),
  };
}
