import { isGrowthShareToken, isInviteCode } from '@tishuashua/shared';

export interface GrowthLaunch {
  shareToken: string | null;
  inviteCode: string | null;
}

/**
 * 冷启动 query 解析。本轮只提供解析，不在启动时自动 open/bind。
 * 分享参数名 shareToken；邀请参数名 inviteCode。
 */
export function parseGrowthLaunch(query: Record<string, unknown> | null | undefined): GrowthLaunch {
  const shareToken = readMatch(query?.shareToken, isGrowthShareToken);
  const inviteCode = readMatch(query?.inviteCode, (value) => isInviteCode(value.toUpperCase()));
  return {
    shareToken,
    inviteCode: inviteCode ? inviteCode.toUpperCase() : null,
  };
}

function readMatch(value: unknown, match: (text: string) => boolean): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return match(text) ? text : null;
}
