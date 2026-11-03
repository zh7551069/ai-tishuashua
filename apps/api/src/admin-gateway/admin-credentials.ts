import { createHash, timingSafeEqual } from 'node:crypto';

export interface AdminAccount {
  username: string;
  password: string;
}

/** 两项都要有。空字符串表示未配置，不会回落到代码里的默认口令。 */
export function configuredAdminAccount(username: string, password: string): AdminAccount | null {
  const name = username.trim();
  if (!name || password.length === 0) {
    return null;
  }
  return { username: name, password };
}

/**
 * 用户名和口令都比对。
 * 先做成定长摘要再比较，避免长度不同时提前暴露，也避免只错用户名就跳过口令比对。
 */
export function credentialsMatch(
  input: { username: string; password: string },
  account: AdminAccount,
): boolean {
  const usernameOk = fixedEqual(input.username, account.username);
  const passwordOk = fixedEqual(input.password, account.password);
  return usernameOk && passwordOk;
}

function fixedEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left, 'utf8').digest();
  const b = createHash('sha256').update(right, 'utf8').digest();
  return timingSafeEqual(a, b);
}
