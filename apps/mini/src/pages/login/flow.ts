/**
 * 登录页状态机辅助。
 * 15 秒只是进 C 前评审建议，用来避免同步中一直停住，不是已拍板的门禁。
 */
export const SUGGESTED_SYNC_DEADLINE_MS = 15_000;

export type Phase =
  | 'checking'
  | 'landing'
  | 'authorizing'
  | 'filling'
  | 'ready'
  | 'authFailed'
  | 'syncFailed';

export class AttemptGate {
  private current = 0;

  issue(): number {
    this.current += 1;
    return this.current;
  }

  /** 作废进行中的取码。不能中断 Taro.login()，只让迟到结果失效。 */
  invalidate(): void {
    this.current += 1;
  }

  isCurrent(issued: number): boolean {
    return issued === this.current;
  }
}

export function isAccountDisabled(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const body = error as { status?: number; code?: string; message?: string };
  return body.status === 403 || body.code === 'FORBIDDEN' || body.message === '账号已停用';
}

/** 评审建议的等待上限。到期后调用方进入同步失败，不把迟到成功写成会话。 */
export function withSuggestedSyncDeadline<T>(
  task: Promise<T>,
  timeoutMs = SUGGESTED_SYNC_DEADLINE_MS,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('同步超时'));
    }, timeoutMs);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
