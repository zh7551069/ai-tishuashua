import { isGrowthShareToken, isInviteCode } from '@tishuashua/shared';

export interface GrowthLaunch {
  shareToken: string | null;
  inviteCode: string | null;
}

/**
 * 冷启动 query 解析。分享参数名 shareToken；邀请参数名 inviteCode。
 * 登录后由 growth-launch-run 调 open / bind。
 */
export function parseGrowthLaunch(query: Record<string, unknown> | null | undefined): GrowthLaunch {
  const shareToken = readMatch(query?.shareToken, isGrowthShareToken);
  const inviteCode = readMatch(query?.inviteCode, (value) => isInviteCode(value.toUpperCase()));
  return {
    shareToken,
    inviteCode: inviteCode ? inviteCode.toUpperCase() : null,
  };
}

/** 网络或登录失效时留着下次再试。明确拒绝则清掉，避免反复弹。 */
export function growthLaunchDisposition(
  status: number,
  code: string | undefined,
): 'clear' | 'keep' {
  if (status === 0 || status === 401 || status >= 500) {
    return 'keep';
  }
  if (
    code === 'GROWTH_SELF_INVITE' ||
    code === 'GROWTH_INVALID_TOKEN' ||
    code === 'GROWTH_ALREADY_BOUND' ||
    code === 'GROWTH_ALREADY_CLAIMED' ||
    code === 'GROWTH_DISABLED' ||
    code === 'GROWTH_CONDITION_NOT_MET' ||
    code === 'VALIDATION_ERROR'
  ) {
    return 'clear';
  }
  return status >= 400 ? 'clear' : 'keep';
}

function readMatch(value: unknown, match: (text: string) => boolean): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return match(text) ? text : null;
}
