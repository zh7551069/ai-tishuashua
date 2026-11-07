/**
 * 把会员支付壳接到既有 HTTP 和 wx.requestPayment。
 * 请求体只有 skuCode / orderKind / clientIdempotencyKey，不传应付金额。
 */
import Taro from '@tarojs/taro';
import type { WechatPayParams } from '@tishuashua/shared';
import { fetchEntitlement, fetchMemberSkus, fetchSessionPacks } from './commerce-api';
import { HttpError } from './http-error';
import { apiRequest } from './http';
import {
  MEMBERSHIP_PAY_PATHS,
  parseMemberOrder,
  parseUpgradeQuote,
  type MembershipCatalogTransport,
  type MembershipPayTransport,
  type PaymentLaunch,
} from './membership-pay';

export function createMembershipPayTransport(): MembershipPayTransport &
  MembershipCatalogTransport {
  return {
    listMemberSkus: fetchMemberSkus,
    listSessionPacks: fetchSessionPacks,
    readEntitlement: fetchEntitlement,
    async upgradeQuote(token, targetSkuCode) {
      const body = await apiRequest<unknown>(MEMBERSHIP_PAY_PATHS.upgradeQuote, {
        method: 'POST',
        token,
        data: { targetSkuCode },
      });
      const quote = parseUpgradeQuote(body);
      if (!quote) {
        throw new HttpError('询价结果无法识别', 0);
      }
      return quote;
    },
    async createOrder(token, body) {
      const response = await apiRequest<unknown>(MEMBERSHIP_PAY_PATHS.orders, {
        method: 'POST',
        token,
        data: {
          skuCode: body.skuCode,
          orderKind: body.orderKind,
          clientIdempotencyKey: body.clientIdempotencyKey,
        },
      });
      const order = parseMemberOrder(response);
      if (!order) {
        throw new HttpError('下单结果无法识别', 0);
      }
      return order;
    },
    async mockNotify(outTradeNo) {
      await apiRequest<unknown>(MEMBERSHIP_PAY_PATHS.mockNotify, {
        method: 'POST',
        data: { outTradeNo },
      });
    },
    async getOrder(token, outTradeNo) {
      const response = await apiRequest<unknown>(MEMBERSHIP_PAY_PATHS.order(outTradeNo), {
        method: 'GET',
        token,
      });
      const order = parseMemberOrder(response);
      if (!order) {
        throw new HttpError('订单结果无法识别', 0);
      }
      return order;
    },
    requestPayment: requestWechatPayment,
  };
}

async function requestWechatPayment(params: WechatPayParams): Promise<PaymentLaunch> {
  try {
    await Taro.requestPayment({
      timeStamp: params.timeStamp,
      nonceStr: params.nonceStr,
      package: params.package,
      signType: params.signType,
      paySign: params.paySign,
    });
    return { ok: true };
  } catch (error) {
    const message = errorText(error);
    if (/cancel/i.test(message)) {
      return { ok: false, cancelled: true, message: '已取消支付' };
    }
    return { ok: false, cancelled: false, message: '支付未完成' };
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'errMsg' in error) {
    const msg = (error as { errMsg?: unknown }).errMsg;
    if (typeof msg === 'string') {
      return msg;
    }
  }
  return '';
}
