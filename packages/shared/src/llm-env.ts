import { LLM_PROVIDERS, type LlmProvider } from './constants';

export interface LlmRuntimeEnv {
  llmMock: boolean;
  llmApiKey: string;
  llmProvider: string;
  llmBaseUrl: string;
}

export function readProcessLlmEnv(source: NodeJS.ProcessEnv = process.env): LlmRuntimeEnv {
  const flag = (source.LLM_MOCK ?? '').trim().toLowerCase();
  return {
    llmMock: flag === 'true' || flag === '1',
    llmApiKey: (source.LLM_API_KEY ?? '').trim(),
    llmProvider: (source.LLM_PROVIDER ?? '').trim().toLowerCase(),
    llmBaseUrl: (source.LLM_BASE_URL ?? '').trim(),
  };
}

export type LlmMode =
  { mode: 'mock' } | { mode: 'live'; provider: LlmProvider } | { mode: 'missing'; message: string };

/** 缺 Key 且未打开 LLM_MOCK 时拒绝出题。mock 只有 true 或 1 生效，默认关。 */
export function resolveLlmMode(
  env: Pick<LlmRuntimeEnv, 'llmMock' | 'llmApiKey' | 'llmProvider'>,
): LlmMode {
  if (env.llmMock) {
    return { mode: 'mock' };
  }
  if (!env.llmApiKey) {
    return {
      mode: 'missing',
      message: '未配置 LLM_API_KEY。本地出题请显式设置 LLM_MOCK=true，生产不要打开。',
    };
  }
  if (!isLlmProvider(env.llmProvider)) {
    return {
      mode: 'missing',
      message: 'LLM_PROVIDER 必须是 deepseek 或 tongyi',
    };
  }
  return { mode: 'live', provider: env.llmProvider };
}

function isLlmProvider(value: string): value is LlmProvider {
  return (LLM_PROVIDERS as readonly string[]).includes(value);
}
