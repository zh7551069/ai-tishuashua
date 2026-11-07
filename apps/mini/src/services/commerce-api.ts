import {
  parsePublicSkuList,
  type CommerceSkuPublic,
  type EntitlementLedgerPage,
  type EntitlementView,
  type GrowthCheckinResult,
  type GrowthInviteBindResult,
  type GrowthShareOpenResult,
  type GrowthShareTokenResult,
  type GrowthView,
} from '@tishuashua/shared';
import { apiRequest } from './http';
import { entitlementLedgerPath, type EntitlementLedgerQuery } from './session-ledger-present';

export function fetchEntitlement(token: string): Promise<EntitlementView> {
  return apiRequest<EntitlementView>('/me/entitlement', { method: 'GET', token });
}

/** 只读场次流水。不写账本，也不下单。 */
export function fetchEntitlementLedger(
  token: string,
  query?: EntitlementLedgerQuery,
): Promise<EntitlementLedgerPage> {
  return apiRequest<EntitlementLedgerPage>(entitlementLedgerPath(query), { method: 'GET', token });
}

/** 只读在售会员档。不创建订单。 */
export async function fetchMemberSkus(token: string): Promise<CommerceSkuPublic[]> {
  const body = await apiRequest<{ items?: unknown }>('/commerce/skus?type=member', {
    method: 'GET',
    token,
  });
  const items = parsePublicSkuList(body?.items);
  if (!items) {
    throw new Error('会员档位无法识别');
  }
  return items;
}

/** 签到、分享、邀请的聚合态。不发奖。 */
export function fetchGrowth(token: string): Promise<GrowthView> {
  return apiRequest<GrowthView>('/me/growth', { method: 'GET', token });
}

/** 每日签到入账。重复请求由服务端幂等。 */
export function postGrowthCheckin(token: string): Promise<GrowthCheckinResult> {
  return apiRequest<GrowthCheckinResult>('/me/growth/checkin', {
    method: 'POST',
    token,
    data: {},
  });
}

export function postGrowthShareToken(token: string): Promise<GrowthShareTokenResult> {
  return apiRequest<GrowthShareTokenResult>('/me/growth/share/token', {
    method: 'POST',
    token,
    data: {},
  });
}

export function postGrowthShareOpen(
  token: string,
  shareToken: string,
): Promise<GrowthShareOpenResult> {
  return apiRequest<GrowthShareOpenResult>('/me/growth/share/open', {
    method: 'POST',
    token,
    data: { shareToken },
  });
}

export function postGrowthInviteBind(
  token: string,
  inviteCode: string,
): Promise<GrowthInviteBindResult> {
  return apiRequest<GrowthInviteBindResult>('/me/growth/invite/bind', {
    method: 'POST',
    token,
    data: { inviteCode },
  });
}

/** 只读在售目录。半屏不创建订单。 */
export async function fetchSessionPacks(token: string): Promise<CommerceSkuPublic[]> {
  const body = await apiRequest<{ items?: unknown }>('/commerce/skus?type=session_pack', {
    method: 'GET',
    token,
  });
  return parsePublicSkuList(body?.items) ?? [];
}
