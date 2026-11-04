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

/**
 * 仍只消费 quiz.generate。复练同类与题型变异在 runQuizGeneration 里按会话 source 分支。
 * 变异不新建队列，不读课件，不做向量检索。
 */
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
