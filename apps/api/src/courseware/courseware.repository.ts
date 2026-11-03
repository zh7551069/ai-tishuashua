import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  EXTRACT_JOB_STATUSES,
  EXTRACT_STAGES,
  USER_COURSEWARE_TEXTBOOK,
  type CoursewareFileMeta,
  type ExtractJobStatus,
  type ExtractJobView,
  type ExtractStage,
  type ExtractedDraft,
  type CommitExtractResult,
} from '@tishuashua/shared';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ApiException } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

interface JobRow {
  id: string;
  upload_id: string;
  status: string;
  stage: string;
  progress: number;
  estimated_minutes: number | null;
  extracted_kp_ids: string[] | null;
  drafts: unknown;
  error_code: string | null;
  error_message: string | null;
  accepted_at: Date | string | null;
  accepted_draft_ids: string[] | null;
  certificate_id: string | null;
  file_meta: unknown;
}

export interface OnlineCertificate {
  id: string;
  domainId: string;
}

@Injectable()
export class CoursewareRepository {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  async findOnlineCertificate(id: string): Promise<OnlineCertificate | null> {
    try {
      const result = await this.pool().query<{ id: string; domain_id: string }>(
        `
          SELECT c.id, c.domain_id
          FROM certificates c
          JOIN domains d ON d.id = c.domain_id
          WHERE c.id = $1
            AND c.status = 'online'
            AND d.status = 'online'
        `,
        [id],
      );
      const row = result.rows[0];
      return row ? { id: row.id, domainId: row.domain_id } : null;
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      rethrowDatabaseError('courseware', error);
    }
  }

  async insertPending(input: {
    uploadId: string;
    jobId: string;
    userId: string;
    certificateId: string;
    fileMeta: CoursewareFileMeta;
    estimatedMinutes: number;
  }): Promise<void> {
    await this.transaction(async (client) => {
      await client.query(
        `
          INSERT INTO user_uploads (id, user_id, certificate_id, file_meta, status)
          VALUES ($1, $2, $3, $4::jsonb, 'pending')
        `,
        [input.uploadId, input.userId, input.certificateId, JSON.stringify(input.fileMeta)],
      );
      await client.query(
        `
          INSERT INTO extract_jobs (
            id, upload_id, user_id, status, stage, progress, estimated_minutes
          )
          VALUES ($1, $2, $3, 'pending', 'uploading', 20, $4)
        `,
        [input.jobId, input.uploadId, input.userId, input.estimatedMinutes],
      );
    });
  }

  async deleteUpload(uploadId: string): Promise<void> {
    try {
      await this.pool().query(`DELETE FROM user_uploads WHERE id = $1`, [uploadId]);
    } catch (error) {
      rethrowDatabaseError('courseware', error);
    }
  }

  async findJob(userId: string, jobId: string): Promise<ExtractJobView | null> {
    try {
      const result = await this.pool().query<JobRow>(JOB_SQL, [jobId, userId]);
      const row = result.rows[0];
      return row ? mapJob(row) : null;
    } catch (error) {
      if (isPgCode(error, '22P02')) {
        return null;
      }
      rethrowDatabaseError('courseware', error);
    }
  }

  async cancel(userId: string, jobId: string): Promise<'missing' | 'conflict' | 'cancelled'> {
    return this.transaction(async (client) => {
      const result = await client.query<{ status: string; upload_id: string }>(
        `
          SELECT status, upload_id
          FROM extract_jobs
          WHERE id = $1 AND user_id = $2
          FOR UPDATE
        `,
        [jobId, userId],
      );
      const row = result.rows[0];
      if (!row) {
        return 'missing';
      }
      if (row.status === 'cancelled') {
        return 'cancelled';
      }
      if (row.status !== 'pending' && row.status !== 'running') {
        return 'conflict';
      }
      await client.query(
        `
          UPDATE extract_jobs
          SET status = 'cancelled', run_token = NULL, updated_at = now()
          WHERE id = $1
        `,
        [jobId],
      );
      await client.query(
        `
          UPDATE user_uploads
          SET status = 'cancelled', updated_at = now()
          WHERE id = $1 AND status IN ('pending', 'running')
        `,
        [row.upload_id],
      );
      return 'cancelled';
    });
  }

  async commit(input: {
    userId: string;
    jobId: string;
    draftIds: readonly string[];
    packId: string | null;
  }): Promise<CommitExtractResult> {
    return this.transaction(async (client) => {
      const result = await client.query<JobRow>(`${JOB_SQL} FOR UPDATE OF j`, [
        input.jobId,
        input.userId,
      ]);
      const row = result.rows[0];
      if (!row?.certificate_id) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '提炼任务不存在');
      }
      if (row.status !== 'succeeded') {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ApiErrorCode.VALIDATION_ERROR,
          '提炼完成后才能加入知识点树',
        );
      }
      const drafts = asDrafts(row.drafts);
      const wanted = input.draftIds.map((id) => id.toLowerCase());
      const byId = new Map(drafts.map((draft) => [draft.id.toLowerCase(), draft]));
      if (wanted.some((id) => !byId.has(id))) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          '有知识点不在这次提炼结果里',
        );
      }
      const selected = wanted.map((id) => byId.get(id)!);
      const accepted = (row.accepted_draft_ids ?? []).map((id) => id.toLowerCase());
      if (row.accepted_at) {
        if (!sameIds(accepted, wanted)) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            ApiErrorCode.VALIDATION_ERROR,
            '这次提炼已经加入知识点树',
          );
        }
        const textbookId = await textbookIdOf(client, row.extracted_kp_ids ?? []);
        if (input.packId) {
          await appendPack(
            client,
            input.userId,
            input.packId,
            row.certificate_id,
            row.extracted_kp_ids ?? [],
          );
        }
        return {
          jobId: row.id,
          certificateId: row.certificate_id,
          textbookId,
          textbookName: USER_COURSEWARE_TEXTBOOK,
          knowledgePointIds: row.extracted_kp_ids ?? [],
          packId: input.packId,
        };
      }

      const textbookId = await ensureUserTextbook(client, input.userId, row.certificate_id);
      const sort = await nextSort(client, textbookId);
      const knowledgePointIds: string[] = [];
      for (const [index, draft] of selected.entries()) {
        const id = randomUUID();
        knowledgePointIds.push(id);
        await client.query(
          `
            INSERT INTO knowledge_points (
              id, textbook_id, parent_id, code, name, kind, prompt_hint, source_ref,
              level, status, sort_order, owner_user_id
            )
            VALUES ($1, $2, NULL, $3, $4, 'knowledge_point', $5, $6, 1, 'online', $7, $8)
          `,
          [
            id,
            textbookId,
            `user-kp-${id}`,
            draft.name,
            draft.promptHint.trim() || `根据上传材料考察「${draft.name}」。`,
            `upload:${row.upload_id}`,
            sort + index,
            input.userId,
          ],
        );
      }
      await client.query(
        `
          UPDATE extract_jobs
          SET extracted_kp_ids = $2::uuid[], accepted_draft_ids = $3::uuid[],
              accepted_at = now(), updated_at = now()
          WHERE id = $1
        `,
        [row.id, knowledgePointIds, wanted],
      );
      if (input.packId) {
        await appendPack(client, input.userId, input.packId, row.certificate_id, knowledgePointIds);
      }
      return {
        jobId: row.id,
        certificateId: row.certificate_id,
        textbookId,
        textbookName: USER_COURSEWARE_TEXTBOOK,
        knowledgePointIds,
        packId: input.packId,
      };
    });
  }

  private async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      rethrowDatabaseError('courseware', error);
    } finally {
      client.release();
    }
  }

  private pool(): Pool {
    return this.database.requirePool();
  }
}

const JOB_SQL = `
  SELECT
    j.id,
    j.upload_id,
    j.status,
    j.stage,
    j.progress,
    j.estimated_minutes,
    j.extracted_kp_ids,
    j.drafts,
    j.error_code,
    j.error_message,
    j.accepted_at,
    j.accepted_draft_ids,
    u.certificate_id,
    u.file_meta
  FROM extract_jobs j
  JOIN user_uploads u ON u.id = j.upload_id
  WHERE j.id = $1 AND j.user_id = $2
`;

async function ensureUserTextbook(
  client: PoolClient,
  userId: string,
  certificateId: string,
): Promise<string> {
  const code = `user-courseware-${userId}-${certificateId}`;
  const inserted = await client.query<{ id: string }>(
    `
      INSERT INTO textbooks (id, code, name, status, sort_order, owner_user_id)
      VALUES ($1, $2, $3, 'online', 10000, $4)
      ON CONFLICT (code) DO UPDATE SET updated_at = now()
      RETURNING id
    `,
    [randomUUID(), code, USER_COURSEWARE_TEXTBOOK, userId],
  );
  const textbookId = inserted.rows[0]?.id;
  if (!textbookId) {
    throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, ApiErrorCode.INTERNAL, '教材没有写上');
  }
  await client.query(
    `
      INSERT INTO textbook_certificates (textbook_id, certificate_id)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `,
    [textbookId, certificateId],
  );
  return textbookId;
}

async function nextSort(client: PoolClient, textbookId: string): Promise<number> {
  const result = await client.query<{ max_sort: number | null }>(
    `SELECT MAX(sort_order) AS max_sort FROM knowledge_points WHERE textbook_id = $1`,
    [textbookId],
  );
  return Number(result.rows[0]?.max_sort ?? 0) + 1;
}

async function textbookIdOf(
  client: PoolClient,
  knowledgePointIds: readonly string[],
): Promise<string> {
  const result = await client.query<{ textbook_id: string | null }>(
    `
      SELECT textbook_id
      FROM knowledge_points
      WHERE id = ANY($1::uuid[])
      LIMIT 1
    `,
    [knowledgePointIds],
  );
  const textbookId = result.rows[0]?.textbook_id;
  if (!textbookId) {
    throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, ApiErrorCode.INTERNAL, '教材没有写上');
  }
  return textbookId;
}

async function appendPack(
  client: PoolClient,
  userId: string,
  packId: string,
  certificateId: string,
  knowledgePointIds: readonly string[],
): Promise<void> {
  const pack = await client.query<{ cert_id: string; cert_status: string }>(
    `
      SELECT p.cert_id, c.status AS cert_status
      FROM packs p
      JOIN certificates c ON c.id = p.cert_id
      WHERE p.id = $1 AND p.user_id = $2
      FOR UPDATE OF p
    `,
    [packId, userId],
  );
  const row = pack.rows[0];
  if (!row) {
    throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '刷题包不存在');
  }
  if (row.cert_id !== certificateId) {
    throw new ApiException(
      HttpStatus.BAD_REQUEST,
      ApiErrorCode.VALIDATION_ERROR,
      '刷题包不属于这张证书',
    );
  }
  if (row.cert_status !== 'online') {
    throw new ApiException(
      HttpStatus.CONFLICT,
      ApiErrorCode.PACK_UNAVAILABLE,
      '关联证书已下架，此包只能删除',
    );
  }
  const existing = await client.query<{ knowledge_point_id: string }>(
    `
      SELECT knowledge_point_id
      FROM pack_knowledge_points
      WHERE pack_id = $1
      ORDER BY position
    `,
    [packId],
  );
  const merged = existing.rows.map((item) => item.knowledge_point_id);
  const have = new Set(merged.map((id) => id.toLowerCase()));
  for (const id of knowledgePointIds) {
    if (!have.has(id.toLowerCase())) {
      merged.push(id);
      have.add(id.toLowerCase());
    }
  }
  await client.query(`DELETE FROM pack_knowledge_points WHERE pack_id = $1`, [packId]);
  await client.query(
    `
      INSERT INTO pack_knowledge_points (pack_id, knowledge_point_id, position)
      SELECT $1, item.id, item.ordinal::integer
      FROM unnest($2::uuid[]) WITH ORDINALITY AS item(id, ordinal)
    `,
    [packId, merged],
  );
  await client.query(`UPDATE packs SET updated_at = now() WHERE id = $1`, [packId]);
}

function mapJob(row: JobRow): ExtractJobView | null {
  if (!row.certificate_id) {
    return null;
  }
  const meta = asFileMeta(row.file_meta);
  if (!meta) {
    return null;
  }
  return {
    id: row.id,
    uploadId: row.upload_id,
    certificateId: row.certificate_id,
    status: asStatus(row.status),
    stage: asStage(row.stage),
    progress: Number(row.progress) || 0,
    estimatedMinutes: row.estimated_minutes ?? 1,
    file: {
      fileName: meta.fileName,
      extension: meta.extension,
      byteSize: meta.byteSize,
    },
    drafts: row.status === 'succeeded' ? asDrafts(row.drafts) : [],
    extractedKpIds: row.extracted_kp_ids ?? [],
    committed: Boolean(row.accepted_at),
    error:
      row.error_code && row.error_message
        ? { code: row.error_code, message: row.error_message }
        : null,
  };
}

function asFileMeta(value: unknown): CoursewareFileMeta | null {
  const record = typeof value === 'string' ? parseJson(value) : value;
  if (!record || typeof record !== 'object') {
    return null;
  }
  const meta = record as Partial<CoursewareFileMeta>;
  if (typeof meta.fileName !== 'string' || typeof meta.extension !== 'string') {
    return null;
  }
  if (
    meta.extension !== 'ppt' &&
    meta.extension !== 'pptx' &&
    meta.extension !== 'pdf' &&
    meta.extension !== 'doc' &&
    meta.extension !== 'docx'
  ) {
    return null;
  }
  return {
    fileName: meta.fileName,
    extension: meta.extension,
    mimeType: typeof meta.mimeType === 'string' ? meta.mimeType : 'application/octet-stream',
    byteSize: Number(meta.byteSize) || 0,
    objectKey: typeof meta.objectKey === 'string' ? meta.objectKey : '',
  };
}

function asDrafts(value: unknown): ExtractedDraft[] {
  const source = typeof value === 'string' ? parseJson(value) : value;
  if (!Array.isArray(source)) {
    return [];
  }
  const drafts: ExtractedDraft[] = [];
  for (const item of source) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Partial<ExtractedDraft>;
    if (typeof row.id !== 'string' || typeof row.name !== 'string') {
      continue;
    }
    drafts.push({
      id: row.id,
      name: row.name,
      promptHint: typeof row.promptHint === 'string' ? row.promptHint : row.name,
      excerpt: typeof row.excerpt === 'string' ? row.excerpt : row.name,
    });
  }
  return drafts;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function asStatus(value: string): ExtractJobStatus {
  return (EXTRACT_JOB_STATUSES as readonly string[]).includes(value)
    ? (value as ExtractJobStatus)
    : 'failed';
}

function asStage(value: string): ExtractStage {
  return (EXTRACT_STAGES as readonly string[]).includes(value)
    ? (value as ExtractStage)
    : 'uploading';
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const have = new Set(left);
  return right.every((id) => have.has(id));
}
