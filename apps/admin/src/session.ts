const STORAGE_KEY = 'tishuashua.admin.session';

/** 浏览器只保存会话，不保存口令。 */
export interface StoredAdminSession {
  token: string;
  expiresAt: string;
  username: string;
}

export function readAdminSession(): StoredAdminSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredAdminSession>;
    if (!parsed.token || !parsed.expiresAt || !parsed.username) {
      return null;
    }
    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
      username: parsed.username,
    };
  } catch {
    return null;
  }
}

export function writeAdminSession(session: StoredAdminSession): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearAdminSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}
