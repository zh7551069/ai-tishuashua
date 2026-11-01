import type { ExtractCoursewareJobPayload } from '@tishuashua/shared';
import {
  createObjectStorage,
  createPgExecutor,
  readProcessLlmEnv,
  readStorageEnv,
  resolveLlmMode,
  runCoursewareExtraction,
  type ExtractionOptions,
  type ExtractionOutcome,
} from '@tishuashua/shared/courseware';
import type { Job } from 'bullmq';
import type { Pool } from 'pg';

export async function handleExtractCourseware(
  job: Job<ExtractCoursewareJobPayload>,
  pool: Pool,
): Promise<ExtractionOutcome> {
  const env = readProcessLlmEnv();
  const decision = resolveLlmMode(env);
  const options: ExtractionOptions =
    decision.mode === 'missing'
      ? { mode: 'unconfigured', message: decision.message }
      : decision.mode === 'mock'
        ? { mode: 'mock' }
        : {
            mode: 'live',
            provider: decision.provider,
            apiKey: env.llmApiKey,
            baseUrl: env.llmBaseUrl,
          };

  let bytes = Buffer.alloc(0);
  let readError: string | undefined;
  try {
    bytes = Buffer.from(await createObjectStorage(readStorageEnv()).get(job.data.objectKey));
  } catch (error) {
    readError = error instanceof Error ? error.message : '对象存储读取失败';
    console.error(`[worker] courseware.extract read failed job=${job.data.jobId} ${readError}`);
  }

  const executor = createPgExecutor(pool);
  const outcome = await runCoursewareExtraction(
    executor,
    {
      jobId: job.data.jobId,
      fileName: job.data.fileName,
      bytes,
      readError,
    },
    options,
  );
  console.log(`[worker] courseware.extract job=${job.data.jobId} status=${outcome.status}`);
  return outcome;
}
