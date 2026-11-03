import type {
  AdminLoginRequest,
  AdminLoginResponse,
  AdminLogoutResponse,
  AdminPingResponse,
} from '@tishuashua/shared';

export const apiBase =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://127.0.0.1:3000/api';

export class AdminApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

export function loginAdmin(body: AdminLoginRequest): Promise<AdminLoginResponse> {
  return request<AdminLoginResponse>('/admin/login', { method: 'POST', body });
}

export function pingAdmin(token: string): Promise<AdminPingResponse> {
  return request<AdminPingResponse>('/admin/ping', { method: 'GET', token });
}

export function logoutAdmin(token: string): Promise<AdminLogoutResponse> {
  return request<AdminLogoutResponse>('/admin/logout', { method: 'POST', token });
}

async function request<T>(
  path: string,
  options: { method: 'GET' | 'POST'; token?: string; body?: unknown },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: options.method,
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new AdminApiError('网络异常，请重试', 0);
  }

  const payload = await readJson(response);
  if (!response.ok) {
    const message =
      payload && typeof payload.message === 'string' && payload.message.trim()
        ? payload.message
        : '请求失败';
    throw new AdminApiError(message, response.status, payload?.code);
  }
  return payload as T;
}

async function readJson(response: Response): Promise<{ code?: string; message?: string } | null> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as { code?: string; message?: string };
  } catch {
    return null;
  }
}
