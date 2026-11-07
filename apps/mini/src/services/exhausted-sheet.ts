import {
  ApiErrorCode,
  DEFAULT_DAILY_FREE_SESSIONS,
  ENTITLEMENT_CTA_TYPES,
  formatPriceYuan,
  sessionConsumesEntitlement,
  type CommerceSkuPublic,
  type EntitlementCtaType,
  type EntitlementView,
} from '@tishuashua/shared';
import { HttpError } from './http-error';

/** 对稿 122:3。生产文案，不带设计版本角标。 */
export const EXHAUSTED_TITLE = '今日场次已用完';
export const EXHAUSTED_SUBTITLE = '开通会员不限场，或买场次加油包 / 做任务领场次';
export const EXHAUSTED_LATER = '稍后再说';
export const MEMBER_CTA_LABEL = '开通会员 · 不限场';
export const TASK_CTA_LABEL = '做任务领场次';
export const PACK_CTA_FALLBACK = '买场次加油包';

export const EXHAUSTED_CTA_ORDER = ENTITLEMENT_CTA_TYPES;

export const EXHAUSTED_ROUTES: Record<EntitlementCtaType, string> = {
  member: '/pages/commerce/member/index',
  pack: '/pages/commerce/session-pack/index',
  task: '/pages/commerce/tasks/index',
};

export interface ExhaustedSnapshot {
  dailyFreeRemain: number;
  dailyTaskRemain: number;
  inventoryRemain: number;
  dailyFreeQuota: number;
}

export type StartOutcome<T> =
  | { kind: 'created'; session: T }
  | { kind: 'sheet'; snapshot: ExhaustedSnapshot }
  | { kind: 'auth' }
  | { kind: 'error'; message: string };

export function dailyFreeQuotaOf(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  return DEFAULT_DAILY_FREE_SESSIONS;
}

export function dailyFreeUsed(quota: number, remain: number): number {
  const safeRemain = typeof remain === 'number' && Number.isFinite(remain) ? remain : 0;
  return Math.max(0, dailyFreeQuotaOf(quota) - safeRemain);
}

export function exhaustedSummary(
  snapshot: Pick<ExhaustedSnapshot, 'dailyFreeQuota' | 'dailyFreeRemain'>,
): string {
  const quota = dailyFreeQuotaOf(snapshot.dailyFreeQuota);
  const used = dailyFreeUsed(quota, snapshot.dailyFreeRemain);
  return `今日免费 ${used}/${quota} 已用 · 明日 00:00 重置`;
}

export function shouldOpenExhaustedSheet(view: EntitlementView): boolean {
  if (view.membership.active) {
    return false;
  }
  const balances = view.balances;
  return (
    numericRemain(balances.dailyFreeRemain) <= 0 &&
    numericRemain(balances.dailyTaskRemain) <= 0 &&
    numericRemain(balances.inventoryRemain) <= 0
  );
}

export function isEntitlementExhausted(error: unknown): boolean {
  return (
    error instanceof HttpError &&
    error.status === 402 &&
    error.code === ApiErrorCode.ENTITLEMENT_EXHAUSTED
  );
}

/**
 * 推荐加油包优先，否则用目录里已经排好序的第一档。
 * 没有可展示场次时返回 null，按钮回退「买场次加油包」。
 */
export function pickSessionPack(items: readonly CommerceSkuPublic[]): CommerceSkuPublic | null {
  const packs = items.filter((item) => item.type === 'session_pack');
  const priced = packs.filter((item) => item.sessions != null && item.sessions >= 1);
  const pool = priced.length > 0 ? priced : [];
  return pool.find((item) => item.recommended) ?? pool[0] ?? null;
}

export function packCtaLabel(sku: CommerceSkuPublic | null): string {
  if (!sku || sku.sessions == null || sku.sessions < 1) {
    return PACK_CTA_FALLBACK;
  }
  if (!Number.isInteger(sku.priceFen) || sku.priceFen < 0) {
    return PACK_CTA_FALLBACK;
  }
  return `买场次加油包 · ${sku.sessions} 场 ¥${formatPriceYuan(sku.priceFen)}`;
}

export function snapshotFromView(view: EntitlementView): ExhaustedSnapshot {
  return {
    dailyFreeRemain: numericRemain(view.balances.dailyFreeRemain),
    dailyTaskRemain: numericRemain(view.balances.dailyTaskRemain),
    inventoryRemain: numericRemain(view.balances.inventoryRemain),
    dailyFreeQuota: dailyFreeQuotaOf(view.balances.dailyFreeQuota),
  };
}

export function snapshotFromError(error: unknown): ExhaustedSnapshot {
  const details = error instanceof HttpError ? error.details : undefined;
  const balances = recordOf(details)?.balances;
  const row = recordOf(balances);
  return {
    dailyFreeRemain: numericRemain(row?.dailyFreeRemain),
    dailyTaskRemain: numericRemain(row?.dailyTaskRemain),
    inventoryRemain: numericRemain(row?.inventoryRemain),
    dailyFreeQuota: dailyFreeQuotaOf(row?.dailyFreeQuota),
  };
}

/**
 * 会占场的来源先读权益。三桶耗尽且非会员时不创建会话。
 * 预检失败仍继续 POST。402 才是门禁。wrongSet 不弹半屏。
 */
export async function startEntitledSession<T>(input: {
  source: string;
  withAuth: <R>(task: (token: string) => Promise<R>) => Promise<R | null>;
  readEntitlement: (token: string) => Promise<EntitlementView>;
  create: (token: string) => Promise<T>;
}): Promise<StartOutcome<T>> {
  try {
    const outcome = await input.withAuth(async (token) => {
      if (sessionConsumesEntitlement(input.source)) {
        try {
          const view = await input.readEntitlement(token);
          if (shouldOpenExhaustedSheet(view)) {
            return { kind: 'sheet' as const, snapshot: snapshotFromView(view) };
          }
        } catch (error) {
          if (isAuthStatus(error)) {
            throw error;
          }
        }
      }
      try {
        const session = await input.create(token);
        return { kind: 'created' as const, session };
      } catch (error) {
        if (sessionConsumesEntitlement(input.source) && isEntitlementExhausted(error)) {
          return { kind: 'sheet' as const, snapshot: snapshotFromError(error) };
        }
        throw error;
      }
    });
    if (!outcome) {
      return { kind: 'auth' };
    }
    return outcome;
  } catch (error) {
    if (isAuthStatus(error)) {
      return { kind: 'auth' };
    }
    return {
      kind: 'error',
      message: error instanceof Error && error.message ? error.message : '出题失败',
    };
  }
}

function numericRemain(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return 0;
}

function recordOf(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function isAuthStatus(error: unknown): boolean {
  return error instanceof HttpError && (error.status === 401 || error.status === 403);
}
