export const apiBase =
  import.meta.env.VITE_API_BASE?.replace(/\/$/, '') || 'http://127.0.0.1:3000/api';

export async function postJson(path: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${apiBase}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  return payload;
}
