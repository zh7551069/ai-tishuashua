/**
 * 场次加油包页的文案和应付展示。
 * 场次、天数、价格只格式化服务端 SKU 或订单 amountFen，不写死档位。
 */
import { formatPriceYuan, type CommerceSkuPublic } from '@tishuashua/shared';

export const SESSION_PACK_TITLE = '购买场次加油包';
export const SESSION_PACK_CLOSE = '关闭';
export const SESSION_PACK_SUCCESS_TOAST = '购买成功';
export const SESSION_PACK_EMPTY_TITLE = '暂无可购加油包';
export const SESSION_PACK_EMPTY_DETAIL = '场次加油包暂时下架';
export const SESSION_PACK_MEMBER_NOTE = '会员期内库存暂不扣';
export const SESSION_PACK_PAYING_LABEL = '支付处理中';

export const SESSION_PACK_RULES = [
  '1 场 = 成功「AI 开始出题」进入答题页',
  '「再练这 N 道」不额外扣场',
  '扣场顺序：日免 → 当日奖励 → 场次加油库存',
] as const;

export function sessionPackHeadline(sku: CommerceSkuPublic): string {
  if (isCount(sku.sessions)) {
    return `场次加油 · ${sku.sessions} 场出题额度`;
  }
  return sku.name;
}

export function sessionPackSubtitle(sku: CommerceSkuPublic): string {
  if (isCount(sku.inventoryExpireDays)) {
    return `非刷题包 · 购后 ${sku.inventoryExpireDays} 天 · 跨日不清零`;
  }
  return '非刷题包 · 跨日不清零';
}

export function sessionPackPriceLabel(fen: number | null): string | null {
  if (!isFen(fen)) {
    return null;
  }
  return `¥${formatPriceYuan(fen)}`;
}

/** 有下单响应时用 amountFen，否则用选中 SKU 的 priceFen。 */
export function sessionPackPayableFen(
  skuPriceFen: number | null | undefined,
  orderAmountFen?: number | null,
): number | null {
  if (orderAmountFen !== undefined && orderAmountFen !== null) {
    return isFen(orderAmountFen) ? orderAmountFen : null;
  }
  return isFen(skuPriceFen) ? skuPriceFen : null;
}

export function sessionPackPayLabel(fen: number | null, paying: boolean): string {
  if (paying) {
    return SESSION_PACK_PAYING_LABEL;
  }
  const price = sessionPackPriceLabel(fen);
  if (!price) {
    return '微信支付';
  }
  return `微信支付 ${price}`;
}

function isFen(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isCount(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
