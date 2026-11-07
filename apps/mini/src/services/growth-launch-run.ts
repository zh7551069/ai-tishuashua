import Taro from '@tarojs/taro';
import { postGrowthInviteBind, postGrowthShareOpen } from './commerce-api';
import { growthLaunchDisposition, parseGrowthLaunch, type GrowthLaunch } from './growth-launch';
import { HttpError } from './http';

const STORAGE_KEY = 'tishuashua.growthLaunch';

export function captureGrowthLaunch(query: Record<string, unknown> | null | undefined): void {
  const parsed = parseGrowthLaunch({
    shareToken: firstQuery(query?.shareToken),
    inviteCode: firstQuery(query?.inviteCode),
  });
  if (!parsed.shareToken && !parsed.inviteCode) {
    return;
  }
  const current = readGrowthLaunch();
  writeGrowthLaunch({
    shareToken: parsed.shareToken ?? current.shareToken,
    inviteCode: parsed.inviteCode ?? current.inviteCode,
  });
}

/** 登录后补一次 open / bind。成功或明确失败会清掉对应参数。 */
export async function settleGrowthLaunch(token: string): Promise<string | null> {
  const pending = readGrowthLaunch();
  if (!pending.shareToken && !pending.inviteCode) {
    return null;
  }
  let shareToken = pending.shareToken;
  let inviteCode = pending.inviteCode;
  const notes: string[] = [];
  if (shareToken) {
    try {
      const opened = await postGrowthShareOpen(token, shareToken);
      shareToken = null;
      if (opened.applied) {
        notes.push('分享已计入');
      } else if (opened.reason === 'member_unlimited') {
        notes.push('对方今日已享会员不限场');
      }
    } catch (error) {
      const http = error instanceof HttpError ? error : null;
      if (growthLaunchDisposition(http?.status ?? 500, http?.code) === 'clear') {
        shareToken = null;
        if (http?.message) {
          notes.push(http.message);
        }
      }
    }
  }
  if (inviteCode) {
    try {
      await postGrowthInviteBind(token, inviteCode);
      inviteCode = null;
      notes.push('邀请已绑定');
    } catch (error) {
      const http = error instanceof HttpError ? error : null;
      if (growthLaunchDisposition(http?.status ?? 500, http?.code) === 'clear') {
        inviteCode = null;
        if (http?.message) {
          notes.push(http.message);
        }
      }
    }
  }
  writeGrowthLaunch({ shareToken, inviteCode });
  return notes[0] ?? null;
}

function readGrowthLaunch(): GrowthLaunch {
  try {
    const raw: unknown = Taro.getStorageSync(STORAGE_KEY);
    if (!raw || typeof raw !== 'object') {
      return { shareToken: null, inviteCode: null };
    }
    return parseGrowthLaunch(raw as Record<string, unknown>);
  } catch {
    return { shareToken: null, inviteCode: null };
  }
}

function writeGrowthLaunch(value: GrowthLaunch): void {
  if (!value.shareToken && !value.inviteCode) {
    try {
      Taro.removeStorageSync(STORAGE_KEY);
    } catch {
      /* 清不掉也不挡页面 */
    }
    return;
  }
  Taro.setStorageSync(STORAGE_KEY, value);
}

function firstQuery(value: unknown): unknown {
  return Array.isArray(value) ? value[0] : value;
}
