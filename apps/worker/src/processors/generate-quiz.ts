import {
  createPgExecutor,
  readProcessLlmEnv,
  resolveLlmMode,
  runQuizGeneration,
  type GenerationOutcome,
} from '@tishuashua/shared/generation';
import type { GenerateQuizJobPayload } from '@tishuashua/shared';
import type { Job } from 'bullmq';
import type { Pool } from 'pg';

export async function handleGenerateQuiz(
  job: Job<GenerateQuizJobPayload>,
  pool: Pool,
): Promise<GenerationOutcome> {
  const sessionId = job.data.sessionId;
  const env = readProcessLlmEnv();
  const decision = resolveLlmMode(env);
  const executor = createPgExecutor(pool);
  const outcome =
    decision.mode === 'missing'
      ? await runQuizGeneration(executor, sessionId, {
          mode: 'unconfigured',
          message: decision.message,
        })
      : decision.mode === 'mock'
        ? await runQuizGeneration(executor, sessionId, { mode: 'mock' })
        : await runQuizGeneration(executor, sessionId, {
            mode: 'live',
            provider: decision.provider,
            apiKey: env.llmApiKey,
            baseUrl: env.llmBaseUrl,
          });
  console.log(`[worker] quiz.generate session=${sessionId} status=${outcome.status}`);
  return outcome;
}
