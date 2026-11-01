import { type LlmProvider } from './constants';

export class LlmCallError extends Error {
  readonly code: 'LLM_UNAVAILABLE' | 'LLM_INVALID_OUTPUT' | 'LLM_NOT_CONFIGURED';

  constructor(
    code: 'LLM_UNAVAILABLE' | 'LLM_INVALID_OUTPUT' | 'LLM_NOT_CONFIGURED',
    message: string,
  ) {
    super(message);
    this.name = 'LlmCallError';
    this.code = code;
  }
}

const PROVIDERS: Record<LlmProvider, { url: string; model: string }> = {
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    model: 'deepseek-chat',
  },
  tongyi: {
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    model: 'qwen-plus',
  },
};

export async function requestAiQuestions(input: {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  system: string;
  user: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<unknown> {
  if (!input.apiKey) {
    throw new LlmCallError(
      'LLM_NOT_CONFIGURED',
      '未配置 LLM_API_KEY。本地出题请显式设置 LLM_MOCK=true，生产不要打开。',
    );
  }
  const endpoint = resolveEndpoint(input.provider, input.baseUrl);
  const model = PROVIDERS[input.provider].model;
  const fetchImpl = input.fetchImpl ?? fetch;
  const timeoutMs = input.timeoutMs ?? 45_000;
  let response: Response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        max_tokens: 12000,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: input.system },
          { role: 'user', content: input.user },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    throw new LlmCallError('LLM_UNAVAILABLE', timedOut ? '模型请求超时' : '模型服务不可用');
  }

  if (!response.ok) {
    throw new LlmCallError('LLM_UNAVAILABLE', `模型服务返回 ${response.status}`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回合法 JSON');
  }
  const content = readContent(payload);
  if (content === null) {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回题目内容');
  }
  return parseModelContent(content);
}

function resolveEndpoint(provider: LlmProvider, baseUrl: string): string {
  if (!baseUrl) {
    return PROVIDERS[provider].url;
  }
  const trimmed = baseUrl.replace(/\/$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function readContent(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || !('choices' in payload)) {
    return null;
  }
  const choices = (payload as { choices: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== 'object') {
    return null;
  }
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== 'object' || !('content' in message)) {
    return null;
  }
  const content = (message as { content: unknown }).content;
  return typeof content === 'string' ? content : null;
}

function parseModelContent(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回合法 JSON');
  }
}
