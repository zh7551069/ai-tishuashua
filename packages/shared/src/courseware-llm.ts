import { randomUUID } from 'node:crypto';
import type { ExtractedDraft } from './courseware';
import type { LlmProvider } from './constants';
import { LlmCallError } from './quiz-llm';

/** 只在 LLM_MOCK 打开时生效。正文里出现这一行会模拟提炼失败。 */
export const EXTRACT_FAIL_MARKER = '[[EXTRACT_FAIL]]';

export function mockExtractKnowledgePoints(text: string): ExtractedDraft[] {
  if (text.includes(EXTRACT_FAIL_MARKER)) {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回合法的知识点');
  }
  return draftsFromLines(text);
}

export async function requestExtractedKnowledgePoints(input: {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  fileName: string;
  text: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ExtractedDraft[]> {
  if (!input.apiKey) {
    throw new LlmCallError(
      'LLM_NOT_CONFIGURED',
      '未配置 LLM_API_KEY。本地提炼请显式设置 LLM_MOCK=true，生产不要打开。',
    );
  }
  const endpoint = resolveEndpoint(input.provider, input.baseUrl);
  const model = input.provider === 'tongyi' ? 'qwen-plus' : 'deepseek-chat';
  const fetchImpl = input.fetchImpl ?? fetch;
  const material = input.text.slice(0, 12000);
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
        temperature: 0.2,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              '你是题刷刷的教材提炼助手。只依据给定材料提炼可以刷题的知识点，不编造材料里没有的内容，不输出思维过程。只返回一个 JSON 对象。',
          },
          {
            role: 'user',
            content: [
              `文件名：${input.fileName}`,
              '请提炼 1 到 8 个知识点。name 不超过 40 个字。promptHint 用简体中文说明日后出题要考什么。excerpt 是材料原句，不超过 80 个字。',
              '返回格式：{"knowledgePoints":[{"name":"","promptHint":"","excerpt":""}]}',
              '材料：',
              material,
            ].join('\n'),
          },
        ],
      }),
      signal: AbortSignal.timeout(input.timeoutMs ?? 90_000),
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
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回知识点内容');
  }
  return parseExtractedKnowledgePoints(parseModelContent(content));
}

export function parseExtractedKnowledgePoints(payload: unknown): ExtractedDraft[] {
  const list = readList(payload);
  if (!list) {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回知识点列表');
  }
  const drafts: ExtractedDraft[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = readString(record, 'name').replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 40) {
      continue;
    }
    const promptHint =
      readString(record, 'promptHint').trim() || readString(record, 'prompt_hint').trim();
    const excerpt = readString(record, 'excerpt').trim() || name;
    drafts.push({
      id: randomUUID(),
      name,
      promptHint: (promptHint || `根据上传材料考察「${name}」，用简体中文出原创题。`).slice(0, 400),
      excerpt: excerpt.slice(0, 200),
    });
    if (drafts.length >= 8) {
      break;
    }
  }
  if (drafts.length === 0) {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '模型没有返回可用的知识点');
  }
  return drafts;
}

function draftsFromLines(text: string): ExtractedDraft[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length >= 2 && line.length <= 80);
  const unique: string[] = [];
  for (const line of lines) {
    if (!unique.includes(line)) {
      unique.push(line);
    }
    if (unique.length >= 8) {
      break;
    }
  }
  if (unique.length === 0) {
    const fallback = text.replace(/\s+/g, ' ').trim().slice(0, 40);
    if (fallback.length >= 2) {
      unique.push(fallback);
    }
  }
  if (unique.length === 0) {
    throw new LlmCallError('LLM_INVALID_OUTPUT', '材料里没有可提炼的知识点');
  }
  return unique.map((name) => ({
    id: randomUUID(),
    name: name.slice(0, 40),
    promptHint: `根据上传材料考察「${name.slice(0, 40)}」，用简体中文出原创题。`,
    excerpt: name.slice(0, 120),
  }));
}

function readList(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const list = record.knowledgePoints ?? record.knowledge_points ?? record.items;
  return Array.isArray(list) ? list : null;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function resolveEndpoint(provider: LlmProvider, baseUrl: string): string {
  if (!baseUrl) {
    return provider === 'tongyi'
      ? 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
      : 'https://api.deepseek.com/chat/completions';
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
