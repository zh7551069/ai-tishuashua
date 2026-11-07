/**
 * 会员定价页的文案和应付展示。价格只格式化服务端分，不写试用价。
 */
import {
  ApiErrorCode,
  formatPriceYuan,
  type CommerceSkuPublic,
  type OrderKind,
} from '@tishuashua/shared';
import {
  MEMBER_DOWNGRADE_MESSAGE,
  memberDurationDays,
  type MemberSelection,
} from './membership-pay';

export const MEMBER_PAGE_TITLE = '开通会员';
export const MEMBER_HERO_TITLE = '题刷刷会员';
export const MEMBER_HERO_SUB = '不限场次 · 会员提炼不限 · AI 点评不限';
export const MEMBER_HERO_NOTE = '免费上传提炼终身仅 1 次 · 会员期内提炼不限次';
export const MEMBER_CHIPS = ['不限 AI 出题场次', '会员提炼不限', 'AI 点评摘要不限'] as const;
export const MEMBER_RULE_TITLE = '升级可补差价 · 不支持降级';
export const MEMBER_RULE_BODY = '续费延长到期日 · 会员不受日免场次限制';
export const MEMBER_PAY_CAPTION = '微信支付 · 开通后立即生效';
export const MEMBER_TERMS_LABEL = '用户协议';
export const MEMBER_TERMS_ROUTE = '/pages/legal/terms/index';
export const MEMBER_SUCCESS_TOAST = '开通成功';
export const MEMBER_RECOMMENDED_BADGE = '推荐';

export interface MemberPayBlock {
  disabled: boolean;
  fen: number | null;
  intercept: string | null;
}

export function memberSkuSubtitle(sku: CommerceSkuPublic): string {
  const months = memberMonthSpan(sku);
  if (!months) {
    return sku.summary;
  }
  return memberMonthlyLabel(sku.priceFen, months) ?? sku.summary;
}

export function memberMonthlyLabel(priceFen: number, months: number): string | null {
  if (!isFen(priceFen) || !Number.isInteger(months) || months < 1) {
    return null;
  }
  const rounded = Math.round((priceFen / 100 / months) * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `约 ¥${text}/月`;
}

export function memberPeriodSuffix(sku: { code: string; durationDays: number | null }): string {
  if (sku.code === 'member_week') {
    return '/周';
  }
  if (sku.code === 'member_month') {
    return '/月';
  }
  if (sku.code === 'member_quarter') {
    return '/季';
  }
  if (sku.code === 'member_year') {
    return '/年';
  }
  const days = memberDurationDays(sku);
  if (days === 7) {
    return '/周';
  }
  if (days === 30) {
    return '/月';
  }
  if (days === 90) {
    return '/季';
  }
  if (days === 365) {
    return '/年';
  }
  return '';
}

export function sessionPackEntryLabel(sku: CommerceSkuPublic | null): string {
  if (!sku || sku.sessions == null || sku.sessions < 1 || !isFen(sku.priceFen)) {
    return '场次加油包（非刷题包）';
  }
  return `场次加油包 ${sku.sessions} 场 ¥${formatPriceYuan(sku.priceFen)}（非刷题包）`;
}

export function memberPayLabel(fen: number | null, busy: boolean): string {
  if (busy) {
    return '支付处理中';
  }
  if (!isFen(fen)) {
    return '确认协议并支付';
  }
  return `确认协议并支付 ¥${formatPriceYuan(fen)}`;
}

export function memberUpgradeCaption(kind: OrderKind | null, fen: number | null): string | null {
  if (kind !== 'upgrade' || !isFen(fen)) {
    return null;
  }
  return `补差价 ¥${formatPriceYuan(fen)}`;
}

export function memberPayBlock(input: {
  decision: MemberSelection;
  skuPriceFen: number | null;
  quotePayFen: number | null;
  quoting: boolean;
  paying: boolean;
}): MemberPayBlock {
  if (input.paying) {
    return { disabled: true, fen: null, intercept: null };
  }
  if (!input.decision.ok) {
    const intercept =
      input.decision.code === ApiErrorCode.PAY_DOWNGRADE_FORBIDDEN
        ? MEMBER_DOWNGRADE_MESSAGE
        : input.decision.message;
    return { disabled: false, fen: null, intercept };
  }
  if (input.decision.kind === 'upgrade') {
    if (input.quoting || !isFen(input.quotePayFen)) {
      return { disabled: true, fen: null, intercept: null };
    }
    return { disabled: false, fen: input.quotePayFen, intercept: null };
  }
  if (!isFen(input.skuPriceFen)) {
    return { disabled: true, fen: null, intercept: null };
  }
  return { disabled: false, fen: input.skuPriceFen, intercept: null };
}

function memberMonthSpan(sku: CommerceSkuPublic): number | null {
  const days = memberDurationDays(sku);
  if (sku.code === 'member_quarter') {
    return 3;
  }
  if (sku.code === 'member_year') {
    return 12;
  }
  if (days === 90) {
    return 3;
  }
  if (days === 365) {
    return 12;
  }
  return null;
}

function isFen(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
