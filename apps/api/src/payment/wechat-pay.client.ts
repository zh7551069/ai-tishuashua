import { randomBytes } from 'node:crypto';
import type { WechatPayParams } from '@tishuashua/shared';
import { signPayMessage } from './wechat-pay.crypto';

const JSAPI_PATH = '/v3/pay/transactions/jsapi';
const JSAPI_URL = `https://api.mch.weixin.qq.com${JSAPI_PATH}`;

export class WechatPrepayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WechatPrepayError';
  }
}

export async function createJsapiPrepay(
  input: {
    appId: string;
    mchId: string;
    serialNo: string;
    privateKeyPem: string;
    notifyUrl: string;
    description: string;
    outTradeNo: string;
    amountFen: number;
    openid: string;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<{ prepayId: string; payParams: WechatPayParams }> {
  const body = JSON.stringify({
    appid: input.appId,
    mchid: input.mchId,
    description: input.description.slice(0, 127),
    out_trade_no: input.outTradeNo,
    notify_url: input.notifyUrl,
    amount: { total: input.amountFen, currency: 'CNY' },
    payer: { openid: input.openid },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomBytes(16).toString('hex');
  const message = `POST\n${JSAPI_PATH}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = signPayMessage(input.privateKeyPem, message);
  const authorization =
    `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",` +
    `nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${input.serialNo}",` +
    `signature="${signature}"`;

  let response: Response;
  try {
    response = await fetchImpl(JSAPI_URL, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        authorization,
        'user-agent': 'tishuashua-api',
      },
      body,
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new WechatPrepayError('微信支付暂不可用');
  }

  if (!response.ok) {
    throw new WechatPrepayError('微信支付暂不可用');
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new WechatPrepayError('微信支付暂不可用');
  }
  const prepayId =
    payload && typeof payload === 'object' && 'prepay_id' in payload
      ? (payload as { prepay_id?: unknown }).prepay_id
      : null;
  if (typeof prepayId !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(prepayId)) {
    throw new WechatPrepayError('微信支付暂不可用');
  }
  return { prepayId, payParams: buildPayParams(input.appId, input.privateKeyPem, prepayId) };
}

export function buildPayParams(
  appId: string,
  privateKeyPem: string,
  prepayId: string,
): WechatPayParams {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomBytes(16).toString('hex');
  const pack = `prepay_id=${prepayId}`;
  const paySign = signPayMessage(privateKeyPem, `${appId}\n${timeStamp}\n${nonceStr}\n${pack}\n`);
  return { timeStamp, nonceStr, package: pack, signType: 'RSA', paySign };
}

export function buildMockPayParams(prepayId: string): WechatPayParams {
  return {
    timeStamp: String(Math.floor(Date.now() / 1000)),
    nonceStr: randomBytes(8).toString('hex'),
    package: `prepay_id=${prepayId}`,
    signType: 'RSA',
    paySign: 'mock',
  };
}
