import { randomUUID } from 'node:crypto';
import { estimateExtractMinutes, type ExtractedDraft } from './courseware';
import { CoursewareTextError, extractCoursewareText } from './courseware-text';
import { mockExtractKnowledgePoints, requestExtractedKnowledgePoints } from './courseware-llm';
import { ApiErrorCode } from './errors';
import type { LlmProvider } from './constants';
import { LlmCallError } from './quiz-llm';
import type { SqlExecutor } from './quiz-run';

export type ExtractionOutcome =
  | { status: 'succeeded' }
  | { status: 'cancelled' }
  | { status: 'skipped' }
  | { status: 'failed'; code: string; message: string };

export type ExtractionOptions =
  | { mode: 'mock' }
  | { mode: 'unconfigured'; message: string }
  | {
      mode: 'live';
      provider: LlmProvider;
      apiKey: string;
      baseUrl: string;
      fetchImpl?: typeof fetch;
    };

interface ClaimedJob {
  jobId: string;
  uploadId: string;
  token: string;
}

/**
 * 领取 pending 任务并提炼。取消只看数据库状态，客户端关掉页面不会进这里。
 * 成功时只写草稿，不写知识点树。勾选回树是另一条接口。
 */
export async function runCoursewareExtraction(
  db: SqlExecutor,
  input: { jobId: string; fileName: string; bytes: Buffer; readError?: string },
  options: ExtractionOptions,
): Promise<ExtractionOutcome> {
  const claimed = await claim(db, input.jobId, input.bytes.length);
  if (claimed.status !== 'claimed') {
    return { status: claimed.status === 'cancelled' ? 'cancelled' : 'skipped' };
  }
  const job = claimed.job;

  try {
    if (input.readError) {
      return await fail(db, job, ApiErrorCode.EXTRACT_FAILED, '课件文件读取失败');
    }
    if (options.mode === 'unconfigured') {
      return await fail(db, job, ApiErrorCode.LLM_NOT_CONFIGURED, options.message);
    }

    const text = extractCoursewareText(input.fileName, input.bytes);
    const advanced = await db.query(
      `
        UPDATE extract_jobs
        SET stage = 'extracting', progress = 75, updated_at = now()
        WHERE id = $1 AND run_token = $2 AND status = 'running'
      `,
      [job.jobId, job.token],
    );
    if (!advanced.rowCount) {
      return { status: 'cancelled' };
    }

    const drafts =
      options.mode === 'mock'
        ? mockExtractKnowledgePoints(text)
        : await requestExtractedKnowledgePoints({
            provider: options.provider,
            apiKey: options.apiKey,
            baseUrl: options.baseUrl,
            fileName: input.fileName,
            text,
            fetchImpl: options.fetchImpl,
          });
    return await succeed(db, job, drafts);
  } catch (error) {
    if (await isCancelled(db, job)) {
      return { status: 'cancelled' };
    }
    const mapped = mapFailure(error);
    if (!(error instanceof LlmCallError) && !(error instanceof CoursewareTextError)) {
      const detail = error instanceof Error ? error.message : 'unknown';
      console.error(`[courseware] job=${job.jobId} ${detail}`);
    }
    return fail(db, job, mapped.code, mapped.message);
  }
}

async function claim(
  db: SqlExecutor,
  jobId: string,
  inputBytes: number,
): Promise<
  | { status: 'claimed'; job: ClaimedJob }
  | { status: 'cancelled' }
  | { status: 'skipped' }
  | { status: 'missing' }
> {
  return db.transaction(async (tx) => {
    const result = await tx.query(
      `
        SELECT status, upload_id
        FROM extract_jobs
        WHERE id = $1
        FOR UPDATE
      `,
      [jobId],
    );
    const row = result.rows[0] as { status?: string; upload_id?: string } | undefined;
    if (!row?.status || !row.upload_id) {
      return { status: 'missing' };
    }
    if (row.status === 'cancelled') {
      return { status: 'cancelled' };
    }
    if (row.status !== 'pending') {
      return { status: 'skipped' as const };
    }
    const token = randomUUID();
    const minutes = estimateExtractMinutes(inputBytes);
    await tx.query(
      `
        UPDATE extract_jobs
        SET status = 'running', stage = 'learning', progress = 45,
            estimated_minutes = $3, run_token = $2, updated_at = now()
        WHERE id = $1
      `,
      [jobId, token, minutes],
    );
    await tx.query(
      `
        UPDATE user_uploads
        SET status = 'running', updated_at = now()
        WHERE id = $1
      `,
      [row.upload_id],
    );
    return { status: 'claimed', job: { jobId, uploadId: row.upload_id, token } };
  });
}

async function succeed(
  db: SqlExecutor,
  claimed: ClaimedJob,
  drafts: ExtractedDraft[],
): Promise<ExtractionOutcome> {
  const updated = await db.query(
    `
      UPDATE extract_jobs
      SET status = 'succeeded', stage = 'done', progress = 100, drafts = $3::jsonb,
          error_code = NULL, error_message = NULL, updated_at = now()
      WHERE id = $1 AND run_token = $2 AND status = 'running'
    `,
    [claimed.jobId, claimed.token, JSON.stringify(drafts)],
  );
  if (!updated.rowCount) {
    return { status: 'cancelled' };
  }
  await db.query(
    `
      UPDATE user_uploads
      SET status = 'succeeded', error_code = NULL, error_message = NULL, updated_at = now()
      WHERE id = $1 AND status = 'running'
    `,
    [claimed.uploadId],
  );
  return { status: 'succeeded' };
}

async function fail(
  db: SqlExecutor,
  claimed: ClaimedJob,
  code: string,
  message: string,
): Promise<ExtractionOutcome> {
  const text = message.slice(0, 300);
  const updated = await db.query(
    `
      UPDATE extract_jobs
      SET status = 'failed', stage = 'done', error_code = $3, error_message = $4, updated_at = now()
      WHERE id = $1 AND run_token = $2 AND status = 'running'
    `,
    [claimed.jobId, claimed.token, code, text],
  );
  if (!updated.rowCount) {
    return { status: 'cancelled' };
  }
  await db.query(
    `
      UPDATE user_uploads
      SET status = 'failed', error_code = $2, error_message = $3, updated_at = now()
      WHERE id = $1 AND status = 'running'
    `,
    [claimed.uploadId, code, text],
  );
  return { status: 'failed', code, message: text };
}

async function isCancelled(db: SqlExecutor, claimed: ClaimedJob): Promise<boolean> {
  const result = await db.query(`SELECT status, run_token FROM extract_jobs WHERE id = $1`, [
    claimed.jobId,
  ]);
  const row = result.rows[0] as { status?: string; run_token?: string | null } | undefined;
  return !row || row.status === 'cancelled' || row.run_token !== claimed.token;
}

function mapFailure(error: unknown): { code: string; message: string } {
  if (error instanceof CoursewareTextError) {
    return { code: ApiErrorCode.COURSEWARE_UNREADABLE, message: error.message };
  }
  if (error instanceof LlmCallError) {
    return { code: error.code, message: error.message };
  }
  return { code: ApiErrorCode.EXTRACT_FAILED, message: '提炼没有完成，请重试' };
}
