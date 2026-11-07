import {
  parsePublicSkuList,
  type CommerceSkuPublic,
  type EntitlementView,
} from '@tishuashua/shared';
import { apiRequest } from './http';

export function fetchEntitlement(token: string): Promise<EntitlementView> {
  return apiRequest<EntitlementView>('/me/entitlement', { method: 'GET', token });
}

/** 只读在售目录。半屏不创建订单。 */
export async function fetchSessionPacks(token: string): Promise<CommerceSkuPublic[]> {
  const body = await apiRequest<{ items?: unknown }>('/commerce/skus?type=session_pack', {
    method: 'GET',
    token,
  });
  return parsePublicSkuList(body?.items) ?? [];
}
