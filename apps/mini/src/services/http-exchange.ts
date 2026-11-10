import { HttpError } from './http-error';

/** GET 超过这个时间还没有 success/fail，就结束等待。微信对 304 可能两个回调都不来。 */
export const GET_RESPONSE_DEADLINE_MS = 15_000;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface JsonRequestOptions {
  method: HttpMethod;
  token?: string;
  data?: unknown;
}

export interface TransportRequest {
  url: string;
  method: HttpMethod;
  data?: unknown;
  header: Record<string, string>;
  dataType?: 'text';
  enableCache?: false;
  timeout?: number;
}

export interface TransportResponse {
  statusCode: number;
  data: unknown;
}

export interface TransportTask extends Promise<TransportResponse> {
  abort?: () => void;
}

export function buildTransportRequest(url: string, options: JsonRequestOptions): TransportRequest {
  const header: Record<string, string> = {};
  if (options.data !== undefined) {
    header['content-type'] = 'application/json';
  }
  if (options.token) {
    header.authorization = `Bearer ${options.token}`;
  }
  const request: TransportRequest = {
    url,
    method: options.method,
    data: options.data,
    header,
  };
  if (options.method === 'GET') {
    header['cache-control'] = 'no-cache';
    header.pragma = 'no-cache';
    request.dataType = 'text';
    request.enableCache = false;
    request.timeout = GET_RESPONSE_DEADLINE_MS;
  }
  return request;
}

export function interpretTransportResult<T>(method: HttpMethod, response: TransportResponse): T {
  const status = response.statusCode;
  if (!status || status === 304) {
    throw new HttpError('网络异常，请重试', status || 0);
  }
  const payload = decodeBody(response.data);
  if (status >= 200 && status < 300) {
    if (method === 'GET' && (payload === undefined || payload === null)) {
      throw new HttpError('网络异常，请重试', status);
    }
    return payload as T;
  }
  const body = errorBody(payload);
  throw new HttpError(body.message, status, body.code, body.details);
}

export async function dispatchApiRequest<T>(
  url: string,
  options: JsonRequestOptions,
  send: (request: TransportRequest) => TransportTask,
): Promise<T> {
  const request = buildTransportRequest(url, options);
  try {
    const task = send(request);
    const response =
      options.method === 'GET'
        ? await settleWithin(task, request.timeout ?? GET_RESPONSE_DEADLINE_MS, () => {
            task.abort?.();
          })
        : await task;
    return interpretTransportResult<T>(options.method, response);
  } catch (caught) {
    if (caught instanceof HttpError) {
      throw caught;
    }
    throw new HttpError('网络异常，请重试', 0);
  }
}

/** 回调不来时也要 reject，避免页面停在加载。 */
export function settleWithin<T>(
  task: Promise<T>,
  timeoutMs: number,
  onTimeout?: () => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      try {
        onTimeout?.();
      } catch {
        // 超时后的中断失败不影响本次报错。
      }
      reject(new HttpError('网络异常，请重试', 0));
    }, timeoutMs);

    task.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function decodeBody(data: unknown): unknown {
  if (typeof data !== 'string') {
    return data;
  }
  const text = data.trim();
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function errorBody(payload: unknown): { message: string; code?: string; details?: unknown } {
  if (!payload || typeof payload !== 'object') {
    return { message: '请求失败' };
  }
  const body = payload as { message?: unknown; code?: unknown; details?: unknown };
  const message =
    typeof body.message === 'string' && body.message.trim() ? body.message : '请求失败';
  const code = typeof body.code === 'string' ? body.code : undefined;
  return { message, code, details: body.details };
}
