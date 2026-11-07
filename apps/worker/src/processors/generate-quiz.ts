import {
  createPgExecutor,
  readProcessLlmEnv,
  resolveLlmMode,
  runQuizGeneration,
  type GenerationOutcome,
} from '@tishuashua/shared/generation';
import {
  readFreeUserBankFirst,
  type GenerateQuizJobPayload,
  type SettingsCache,
} from '@tishuashua/shared';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { Pool } from 'pg';

/**
 * 仍只消费 quiz.generate。复练同类与题型变异在 runQuizGeneration 里按会话 source 分支。
 * 变异不新建队列，不读课件，不做向量检索。
 */
export async function handleGenerateQuiz(
  job: Job<GenerateQuizJobPayload>,
  pool: Pool,
  redis: Redis | null,
): Promise<GenerationOutcome> {
  const sessionId = job.data.sessionId;
  const env = readProcessLlmEnv();
  const decision = resolveLlmMode(env);
  const executor = createPgExecutor(pool);
  const deps = {
    settingsCache: redis ? settingsCache(redis) : null,
    getFreeUserBankFirst: () =>
      readFreeUserBankFirst(executor, redis ? settingsCache(redis) : null),
  };
  const outcome =
    decision.mode === 'missing'
      ? await runQuizGeneration(
          executor,
          sessionId,
          {
            mode: 'unconfigured',
            message: decision.message,
          },
          deps,
        )
      : decision.mode === 'mock'
        ? await runQuizGeneration(executor, sessionId, { mode: 'mock' }, deps)
        : await runQuizGeneration(
            executor,
            sessionId,
            {
              mode: 'live',
              provider: decision.provider,
              apiKey: env.llmApiKey,
              baseUrl: env.llmBaseUrl,
            },
            deps,
          );
  console.log(
    `[worker] quiz.generate session=${sessionId} status=${outcome.status}${formatStats(outcome)}`,
  );
  return outcome;
}

function settingsCache(redis: Redis): SettingsCache {
  return {
    get: (key) => redis.get(key),
    set: (key, value, mode, ttl) => redis.set(key, value, mode, ttl),
    del: (key) => redis.del(key),
  };
}

function formatStats(outcome: GenerationOutcome): string {
  if (!('stats' in outcome) || !outcome.stats) {
    return '';
  }
  const { wrongCarried, bankDrawn, aiGenerated } = outcome.stats;
  return ` wrongCarried=${wrongCarried} bankDrawn=${bankDrawn} aiGenerated=${aiGenerated}`;
}
