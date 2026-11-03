/**
 * 后管展示用的昵称。不返回 users.nick 原文。
 * 按 Unicode 码位计：1 个写成 *，2 个留头，更长的留头尾，中间最多三个 *。
 */
export function maskAdminNick(nick: string | null | undefined): string | null {
  const trimmed = nick?.trim() ?? '';
  if (!trimmed) {
    return null;
  }
  const chars = Array.from(trimmed);
  if (chars.length === 1) {
    return '*';
  }
  if (chars.length === 2) {
    return `${chars[0]}*`;
  }
  const hidden = Math.min(chars.length - 2, 3);
  return `${chars[0]}${'*'.repeat(hidden)}${chars[chars.length - 1]}`;
}
