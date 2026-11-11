/**
 * 出题日志写入失败时保留原结果。
 * 不连接数据库。调用方把 INSERT 放进 write，失败只走 onError。
 */
export async function keepOutcomeIfLogWriteFails<T extends { status: string }>(
  outcome: T,
  write: () => Promise<void>,
  onError?: (error: unknown) => void,
): Promise<T> {
  if (outcome.status !== 'ready' && outcome.status !== 'failed') {
    return outcome;
  }
  try {
    await write();
  } catch (error) {
    if (onError) {
      onError(error);
    } else {
      const message = error instanceof Error ? error.message : 'unknown error';
      console.error(`[quiz-generation-log] append failed: ${message}`);
    }
  }
  return outcome;
}

/** 日志 error_message 上限。按 Unicode 码位截断，不写入更长的模型原文。 */
export function truncateGenerationError(message: string, max = 500): string {
  const chars = Array.from(message.trim());
  if (chars.length <= max) {
    return chars.join('');
  }
  return chars.slice(0, max).join('');
}
