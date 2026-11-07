import {
  parsePublicSkuList,
  type CommerceSkuPublic,
  type EntitlementLedgerPage,
  type EntitlementView,
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

/** 只读在售目录。半屏不创建订单。 */
export async function fetchSessionPacks(token: string): Promise<CommerceSkuPublic[]> {
  const body = await apiRequest<{ items?: unknown }>('/commerce/skus?type=session_pack', {
    method: 'GET',
    token,
  });
  return parsePublicSkuList(body?.items) ?? [];
}
