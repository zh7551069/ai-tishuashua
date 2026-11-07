/**
 * 把加油包支付壳接到既有 HTTP 和 wx.requestPayment。
 * 请求体只有 skuCode、orderKind=purchase、clientIdempotencyKey，不传应付金额，也不询价。
 */
import Taro from '@tarojs/taro';
import type { WechatPayParams } from '@tishuashua/shared';
import { fetchEntitlement, fetchSessionPacks } from './commerce-api';
import { HttpError } from './http-error';
import { apiRequest } from './http';
import {
  SESSION_PACK_ORDER_KIND,
  SESSION_PACK_PAY_PATHS,
  parseSessionPackOrder,
  type SessionPackCatalogTransport,
  type SessionPackPayTransport,
  type SessionPackPaymentLaunch,
} from './session-pack-pay';

export function createSessionPackPayTransport(): SessionPackPayTransport &
  SessionPackCatalogTransport {
  return {
    listSessionPacks: fetchSessionPacks,
    readEntitlement: fetchEntitlement,
    async createOrder(token, body) {
      const response = await apiRequest<unknown>(SESSION_PACK_PAY_PATHS.orders, {
        method: 'POST',
        token,
        data: {
          skuCode: body.skuCode,
          orderKind: SESSION_PACK_ORDER_KIND,
          clientIdempotencyKey: body.clientIdempotencyKey,
        },
      });
      const order = parseSessionPackOrder(response);
      if (!order) {
        throw new HttpError('下单结果无法识别', 0);
      }
      return order;
    },
    async mockNotify(outTradeNo) {
      await apiRequest<unknown>(SESSION_PACK_PAY_PATHS.mockNotify, {
        method: 'POST',
        data: { outTradeNo },
      });
    },
    async getOrder(token, outTradeNo) {
      const response = await apiRequest<unknown>(SESSION_PACK_PAY_PATHS.order(outTradeNo), {
        method: 'GET',
        token,
      });
      const order = parseSessionPackOrder(response);
      if (!order) {
        throw new HttpError('订单结果无法识别', 0);
      }
      return order;
    },
    requestPayment: requestWechatPayment,
  };
}

async function requestWechatPayment(params: WechatPayParams): Promise<SessionPackPaymentLaunch> {
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
