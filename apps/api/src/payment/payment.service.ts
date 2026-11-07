import {
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  ApiErrorCode,
  COMMERCE_SETTING_CACHE_TTL_SECONDS,
  COMMERCE_SKUS_CACHE_KEY,
  DEFAULT_INVENTORY_EXPIRE_DAYS,
  PAY_CURRENCY,
  PAY_NOTIFY_ACK,
  addWholeDays,
  buildOutTradeNo,
  encodeOrderCursor,
  isMockNotifyEnabled,
  membershipEndsAt,
  orderGrantRef,
  parseAdminOrderQuery,
  parseCreateOrderBody,
  parseMockNotifyBody,
  parseOrderListQuery,
  parsePublicSkuList,
  parseSkuCatalogQuery,
  parseUpgradeQuoteBody,
  quoteMemberUpgrade,
  resolveOrderKind,
  resolveWechatPayMode,
  type AdminOrderItem,
  type ApiErrorCode as ApiErrorCodeValue,
  type CommerceSkuPublic,
  type OrderCreated,
  type OrderDetail,
  type OrderKind,
  type OrderSummary,
  type UpgradeQuote,
  type UserSummary,
  type WechatPayMode,
  type WechatPaySettings,
} from '@tishuashua/shared';
import { grantEntitlement, type EntitlementDb } from '@tishuashua/shared/entitlement';
import Redis from 'ioredis';
import type { IncomingHttpHeaders } from 'node:http';
import { logServerError } from '../common/api.exception';
import { loadApiEnv, type ApiEnv } from '../config/env';
import { DatabaseService } from '../db/database.service';
import { buildMockPayParams, createJsapiPrepay, WechatPrepayError } from './wechat-pay.client';
import {
  decryptNotifyResource,
  loadPlatformVerifier,
  verifyPaySignature,
} from './wechat-pay.crypto';
import {
  closeExpiredOrders,
  findGrantLotId,
  findIdempotentOrder,
  findOrderByOutTradeNo,
  findSku,
  findUserOrder,
  insertOrder,
  listAdminOrders,
  listEnabledSkus,
  listUserOrders,
  lockOrder,
  markFailReason,
  markPaid,
  readMembership,
  setLotOrderId,
  setMembershipLastOrder,
  updateFailed,
  updatePrepay,
  type CatalogSku,
  type PayDb,
  type StoredOrder,
} from './payment.repository';

export class PaymentFlowError extends Error {
  readonly status: HttpStatus;
  readonly code: ApiErrorCodeValue;

  constructor(status: HttpStatus, code: ApiErrorCodeValue, message: string) {
    super(message);
    this.name = 'PaymentFlowError';
    this.status = status;
    this.code = code;
  }
}

@Injectable()
export class PaymentService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private cacheReady = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.config);
    if (!env.redisUrl) {
      return;
    }
    const redis = new Redis(env.redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('error', (error: Error) => {
      this.cacheReady = false;
      logServerError('payment', error);
    });
    this.redis = redis;
    try {
      await redis.connect();
      this.cacheReady = (await redis.ping()) === 'PONG';
    } catch (error) {
      this.cacheReady = false;
      logServerError('payment', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.cacheReady = false;
  }

  async listSkus(typeRaw: unknown): Promise<{ items: CommerceSkuPublic[] }> {
    const parsed = parseSkuCatalogQuery(typeRaw);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    const cached = await this.readSkuCache();
    const all = cached ?? (await this.loadSkuCache());
    const items = parsed.value ? all.filter((item) => item.type === parsed.value) : all;
    return { items };
  }

  async createOrder(user: UserSummary, body: unknown): Promise<OrderCreated> {
    const mode = this.requireOrderMode();
    const parsed = parseCreateOrderBody(body);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    if (!user.wxOpenId.trim()) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '缺少微信 openId',
      );
    }
    const db = this.database.requirePool();
    const sku = await findSku(db, parsed.value.skuCode);
    if (!sku || !sku.enabled) {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_SKU_UNAVAILABLE,
        '商品不可购买',
      );
    }
    const decision = await this.decide(db, user.id, sku, parsed.value.orderKind);
    if (parsed.value.clientIdempotencyKey) {
      const existing = await findIdempotentOrder(db, user.id, parsed.value.clientIdempotencyKey);
      if (existing) {
        if (existing.skuCode !== sku.code) {
          throw new PaymentFlowError(
            HttpStatus.CONFLICT,
            ApiErrorCode.PAY_ORDER_STATE,
            '幂等键已对应另一笔订单',
          );
        }
        return this.continuePay(existing, mode);
      }
    }
    const order = await this.insertFresh(
      db,
      user,
      sku,
      decision,
      parsed.value.clientIdempotencyKey,
    );
    return this.continuePay(order, mode);
  }

  async getOrder(userId: string, outTradeNo: string): Promise<OrderDetail> {
    const db = this.database.requirePool();
    await closeExpiredOrders(db, userId);
    const order = await findUserOrder(db, userId, outTradeNo);
    if (!order) {
      throw new PaymentFlowError(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '订单不存在');
    }
    return this.withMembership(db, order);
  }

  async listOrders(
    userId: string,
    limitRaw: unknown,
    cursorRaw: unknown,
  ): Promise<{ items: OrderSummary[]; nextCursor: string | null }> {
    const parsed = parseOrderListQuery(limitRaw, cursorRaw);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    const db = this.database.requirePool();
    await closeExpiredOrders(db, userId);
    const rows = await listUserOrders(db, userId, parsed.value.limit + 1, parsed.value.cursor);
    return pageOrders(rows, parsed.value.limit, (order) => toSummary(order));
  }

  async upgradeQuote(userId: string, body: unknown): Promise<UpgradeQuote> {
    const parsed = parseUpgradeQuoteBody(body);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    const db = this.database.requirePool();
    const target = await findSku(db, parsed.value.targetSkuCode);
    if (!target || !target.enabled || target.type !== 'member') {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_SKU_UNAVAILABLE,
        '商品不可购买',
      );
    }
    const current = await this.currentMember(db, userId);
    const kind = resolveOrderKind({
      skuType: 'member',
      requested: 'upgrade',
      memberActive: current.active,
      currentDurationDays: current.durationDays,
      targetDurationDays: target.durationDays,
    });
    if (!kind.ok) {
      throw kindError(kind);
    }
    return this.buildQuote(current, target);
  }

  async handleNotify(
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): Promise<typeof PAY_NOTIFY_ACK> {
    const env = loadApiEnv(this.config);
    const verified = this.verifyNotify(env, rawBody, headers);
    if (!verified) {
      throw new PaymentFlowError(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.PAY_SIGN_INVALID,
        '回调验签失败',
      );
    }
    let decrypted = '';
    try {
      decrypted = decryptNotifyResource(env.wechatPayApiV3Key, verified.resource);
    } catch {
      throw new PaymentFlowError(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.PAY_SIGN_INVALID,
        '回调验签失败',
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(decrypted);
    } catch {
      throw new PaymentFlowError(
        HttpStatus.UNAUTHORIZED,
        ApiErrorCode.PAY_SIGN_INVALID,
        '回调验签失败',
      );
    }
    const notice = readNotice(payload);
    if (!notice) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '回调缺少订单字段',
      );
    }
    if (notice.tradeState !== 'SUCCESS') {
      return PAY_NOTIFY_ACK;
    }
    if (!notice.outTradeNo || !notice.transactionId || notice.total === null) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        '回调缺少订单字段',
      );
    }
    try {
      await this.settle(notice.outTradeNo, notice.transactionId, notice.total, notice.payerOpenid);
    } catch (error) {
      if (error instanceof PaymentFlowError && error.code === ApiErrorCode.PAY_AMOUNT_MISMATCH) {
        await markFailReason(
          this.database.requirePool(),
          notice.outTradeNo,
          'amount_mismatch',
        ).catch(() => undefined);
      }
      throw error;
    }
    return PAY_NOTIFY_ACK;
  }

  async mockNotify(body: unknown): Promise<typeof PAY_NOTIFY_ACK> {
    if (!isMockNotifyEnabled(this.settings())) {
      throw new PaymentFlowError(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, 'Not Found');
    }
    const parsed = parseMockNotifyBody(body);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    const order = await findOrderByOutTradeNo(this.database.requirePool(), parsed.value.outTradeNo);
    if (!order) {
      throw new PaymentFlowError(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '订单不存在');
    }
    const transactionId = parsed.value.transactionId ?? `mock_${order.outTradeNo}`;
    await this.settle(order.outTradeNo, transactionId, order.amountFen, order.payerOpenid);
    return PAY_NOTIFY_ACK;
  }

  async listAdmin(query: {
    userId?: unknown;
    outTradeNo?: unknown;
    status?: unknown;
    limit?: unknown;
    cursor?: unknown;
  }): Promise<{ items: AdminOrderItem[]; nextCursor: string | null }> {
    const parsed = parseAdminOrderQuery(query);
    if (!parsed.ok) {
      throw new PaymentFlowError(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.VALIDATION_ERROR,
        parsed.message,
      );
    }
    const db = this.database.requirePool();
    await closeExpiredOrders(db, parsed.value.userId);
    const rows = await listAdminOrders(db, { ...parsed.value, limit: parsed.value.limit + 1 });
    return pageOrders(rows, parsed.value.limit, (order) => ({
      ...toSummary(order),
      userId: order.userId,
      wxTransactionId: order.wxTransactionId,
      failReason: order.failReason,
    }));
  }

  private requireOrderMode(): WechatPayMode {
    const mode = resolveWechatPayMode(this.settings());
    if (mode === 'off') {
      throw new PaymentFlowError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.PAY_NOT_CONFIGURED,
        '微信支付未配置',
      );
    }
    if (mode === 'live' && !this.liveMaterialReady()) {
      throw new PaymentFlowError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.PAY_NOT_CONFIGURED,
        '微信支付未配置',
      );
    }
    return mode;
  }

  private liveMaterialReady(): boolean {
    const env = loadApiEnv(this.config);
    if (!readPrivateKey(env)) {
      return false;
    }
    const pem = readTextFile(env.wechatPayPlatformCertPath);
    return Boolean(pem && loadPlatformVerifier(pem));
  }

  private settings(): WechatPaySettings {
    const env = loadApiEnv(this.config);
    return {
      nodeEnv: env.nodeEnv,
      enabledFlag: env.wechatPayEnabled,
      mock: env.wechatPayMock,
      appId: env.wechatPayAppId || env.wechatAppId,
      mchId: env.wechatPayMchId,
      mchSerialNo: env.wechatPayMchSerialNo,
      hasPrivateKey: Boolean(env.wechatPayPrivateKey || env.wechatPayPrivateKeyPath),
      apiV3Key: env.wechatPayApiV3Key,
      notifyUrl: env.wechatPayNotifyUrl,
      hasPlatformCert: Boolean(env.wechatPayPlatformCertPath),
    };
  }

  private async decide(
    db: PayDb,
    userId: string,
    sku: CatalogSku,
    requested: OrderKind | null,
  ): Promise<{
    kind: OrderKind;
    amountFen: number;
    upgradeFromSku: string | null;
    upgradeQuote: UpgradeQuote | null;
  }> {
    const current = await this.currentMember(db, userId);
    const kind = resolveOrderKind({
      skuType: sku.type,
      requested,
      memberActive: current.active,
      currentDurationDays: current.durationDays,
      targetDurationDays: sku.type === 'member' ? sku.durationDays : null,
    });
    if (!kind.ok) {
      throw kindError(kind);
    }
    if (kind.kind !== 'upgrade') {
      return { kind: kind.kind, amountFen: sku.priceFen, upgradeFromSku: null, upgradeQuote: null };
    }
    const quote = this.buildQuote(current, sku);
    return {
      kind: 'upgrade',
      amountFen: quote.payFen,
      upgradeFromSku: quote.currentSkuCode,
      upgradeQuote: quote,
    };
  }

  private buildQuote(
    current: {
      active: boolean;
      endsAt: Date | null;
      sku: CatalogSku | null;
      durationDays: number | null;
    },
    target: CatalogSku,
  ): UpgradeQuote {
    if (!current.sku || current.durationDays === null || !current.endsAt) {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_ORDER_STATE,
        '无法计算升级差价',
      );
    }
    const numbers = quoteMemberUpgrade({
      now: new Date(),
      endsAt: current.endsAt,
      currentPriceFen: current.sku.priceFen,
      currentDurationDays: current.durationDays,
      targetPriceFen: target.priceFen,
    });
    if (!numbers) {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_ORDER_STATE,
        '无法计算升级差价',
      );
    }
    return {
      currentSkuCode: current.sku.code,
      targetSkuCode: target.code,
      remainingDays: numbers.remainingDays,
      remainingValueFen: numbers.remainingValueFen,
      payFen: numbers.payFen,
      currency: PAY_CURRENCY,
    };
  }

  private async currentMember(
    db: PayDb,
    userId: string,
  ): Promise<{
    active: boolean;
    endsAt: Date | null;
    sku: CatalogSku | null;
    durationDays: number | null;
  }> {
    const membership = await readMembership(db, userId);
    const endsAt = membership?.endsAt ?? null;
    const active = Boolean(endsAt && endsAt.getTime() > Date.now());
    if (!active || !membership?.skuCode) {
      return { active, endsAt, sku: null, durationDays: null };
    }
    const sku = await findSku(db, membership.skuCode);
    if (!sku || sku.type !== 'member') {
      return { active, endsAt, sku: null, durationDays: null };
    }
    return { active, endsAt, sku, durationDays: sku.durationDays };
  }

  private async insertFresh(
    db: PayDb,
    user: UserSummary,
    sku: CatalogSku,
    decision: {
      kind: OrderKind;
      amountFen: number;
      upgradeFromSku: string | null;
      upgradeQuote: UpgradeQuote | null;
    },
    clientIdempotencyKey: string | null,
  ): Promise<StoredOrder> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await insertOrder(db, {
          id: randomUUID(),
          outTradeNo: buildOutTradeNo(new Date(), randomBytes(8).toString('hex')),
          userId: user.id,
          sku,
          orderKind: decision.kind,
          amountFen: decision.amountFen,
          upgradeFromSku: decision.upgradeFromSku,
          upgradeQuote: decision.upgradeQuote,
          payerOpenid: user.wxOpenId,
          clientIdempotencyKey,
        });
      } catch (error) {
        const constraint = uniqueConstraint(error);
        if (constraint === 'commerce_orders_idempotency_uidx' && clientIdempotencyKey) {
          const existing = await findIdempotentOrder(db, user.id, clientIdempotencyKey);
          if (existing) {
            if (existing.skuCode !== sku.code) {
              throw new PaymentFlowError(
                HttpStatus.CONFLICT,
                ApiErrorCode.PAY_ORDER_STATE,
                '幂等键已对应另一笔订单',
              );
            }
            return existing;
          }
        }
        if (constraint === 'commerce_orders_out_trade_no_unique') {
          continue;
        }
        throw error;
      }
    }
    throw new PaymentFlowError(
      HttpStatus.CONFLICT,
      ApiErrorCode.PAY_ORDER_STATE,
      '订单号冲突，请重试',
    );
  }

  private async continuePay(order: StoredOrder, mode: WechatPayMode): Promise<OrderCreated> {
    if (order.status === 'paid') {
      return { ...toSummary(order), payParams: null };
    }
    if (order.status !== 'created' && order.status !== 'prepay') {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_ORDER_STATE,
        '订单已结束，请重新下单',
      );
    }
    const db = this.database.requirePool();
    try {
      const prepared = mode === 'mock' ? await this.mockPrepay() : await this.livePrepay(order);
      const updated = await updatePrepay(db, order.id, prepared.prepayId);
      if (!updated) {
        throw new PaymentFlowError(
          HttpStatus.CONFLICT,
          ApiErrorCode.PAY_ORDER_STATE,
          '订单状态不能支付',
        );
      }
      return { ...toSummary(updated), payParams: prepared.payParams };
    } catch (error) {
      if (error instanceof WechatPrepayError) {
        await updateFailed(db, order.id, 'prepay_failed').catch(() => undefined);
        throw new PaymentFlowError(
          HttpStatus.SERVICE_UNAVAILABLE,
          ApiErrorCode.WECHAT_UNAVAILABLE,
          '微信支付暂不可用',
        );
      }
      throw error;
    }
  }

  private async mockPrepay(): Promise<{
    prepayId: string;
    payParams: ReturnType<typeof buildMockPayParams>;
  }> {
    const prepayId = `mock${randomBytes(8).toString('hex')}`;
    return { prepayId, payParams: buildMockPayParams(prepayId) };
  }

  private async livePrepay(
    order: StoredOrder,
  ): Promise<{ prepayId: string; payParams: ReturnType<typeof buildMockPayParams> }> {
    const env = loadApiEnv(this.config);
    const privateKey = readPrivateKey(env);
    const settings = this.settings();
    if (!privateKey || !order.payerOpenid) {
      throw new PaymentFlowError(
        HttpStatus.SERVICE_UNAVAILABLE,
        ApiErrorCode.PAY_NOT_CONFIGURED,
        '微信支付未配置',
      );
    }
    return createJsapiPrepay({
      appId: settings.appId,
      mchId: settings.mchId,
      serialNo: settings.mchSerialNo,
      privateKeyPem: privateKey,
      notifyUrl: settings.notifyUrl,
      description: order.priceSnapshot.name,
      outTradeNo: order.outTradeNo,
      amountFen: order.amountFen,
      openid: order.payerOpenid,
    });
  }

  private async settle(
    outTradeNo: string,
    transactionId: string,
    amountFen: number,
    payerOpenid: string | null,
  ): Promise<void> {
    const client = await this.database.requirePool().connect();
    try {
      await client.query('BEGIN');
      const order = await lockOrder(client, outTradeNo);
      if (!order) {
        throw new PaymentFlowError(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '订单不存在');
      }
      if (amountFen !== order.amountFen) {
        throw new PaymentFlowError(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.PAY_AMOUNT_MISMATCH,
          '回调金额与订单不一致',
        );
      }
      if (order.status === 'paid') {
        await client.query('COMMIT');
        return;
      }
      if (payerOpenid && order.payerOpenid && payerOpenid !== order.payerOpenid) {
        throw new PaymentFlowError(
          HttpStatus.CONFLICT,
          ApiErrorCode.PAY_ORDER_STATE,
          '付款人与订单不一致',
        );
      }
      if (order.status !== 'created' && order.status !== 'prepay') {
        throw new PaymentFlowError(
          HttpStatus.CONFLICT,
          ApiErrorCode.PAY_ORDER_STATE,
          '订单状态不能入账',
        );
      }
      const paidAt = new Date();
      try {
        const updated = await markPaid(client, order.id, transactionId, paidAt);
        if (updated < 1) {
          throw new PaymentFlowError(
            HttpStatus.CONFLICT,
            ApiErrorCode.PAY_ORDER_STATE,
            '订单状态不能入账',
          );
        }
      } catch (error) {
        if (error instanceof PaymentFlowError) {
          throw error;
        }
        if (uniqueConstraint(error) === 'commerce_orders_wx_transaction_uidx') {
          throw new PaymentFlowError(
            HttpStatus.CONFLICT,
            ApiErrorCode.PAY_ORDER_STATE,
            '微信支付单号已使用',
          );
        }
        throw error;
      }
      await grantPaid(client, order, paidAt);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private verifyNotify(
    env: ApiEnv,
    rawBody: string,
    headers: IncomingHttpHeaders,
  ): { resource: { ciphertext: string; nonce: string; associatedData: string } } | null {
    const pem = readTextFile(env.wechatPayPlatformCertPath);
    const verifier = pem ? loadPlatformVerifier(pem) : null;
    if (!verifier || !env.wechatPayApiV3Key) {
      return null;
    }
    const ok = verifyPaySignature({
      verifier,
      timestamp: headerValue(headers, 'wechatpay-timestamp'),
      nonce: headerValue(headers, 'wechatpay-nonce'),
      signature: headerValue(headers, 'wechatpay-signature'),
      serial: headerValue(headers, 'wechatpay-serial'),
      rawBody,
    });
    if (!ok) {
      return null;
    }
    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!body || typeof body !== 'object' || !('resource' in body)) {
      return null;
    }
    const resource = (body as { resource?: unknown }).resource;
    if (!resource || typeof resource !== 'object') {
      return null;
    }
    const row = resource as Record<string, unknown>;
    if (row.algorithm !== 'AEAD_AES_256_GCM') {
      return null;
    }
    if (typeof row.ciphertext !== 'string' || typeof row.nonce !== 'string') {
      return null;
    }
    const associatedData = typeof row.associated_data === 'string' ? row.associated_data : '';
    return { resource: { ciphertext: row.ciphertext, nonce: row.nonce, associatedData } };
  }

  private async readSkuCache(): Promise<CommerceSkuPublic[] | null> {
    if (!this.redis || !this.cacheReady) {
      return null;
    }
    try {
      const raw = await this.redis.get(COMMERCE_SKUS_CACHE_KEY);
      if (!raw) {
        return null;
      }
      return parsePublicSkuList(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  private async loadSkuCache(): Promise<CommerceSkuPublic[]> {
    const rows = await listEnabledSkus(this.database.requirePool());
    const items = rows.map(toPublicSku);
    if (this.redis && this.cacheReady) {
      await this.redis
        .set(
          COMMERCE_SKUS_CACHE_KEY,
          JSON.stringify(items),
          'EX',
          COMMERCE_SETTING_CACHE_TTL_SECONDS,
        )
        .catch(() => undefined);
    }
    return items;
  }

  private async withMembership(db: PayDb, order: StoredOrder): Promise<OrderDetail> {
    if (order.skuType !== 'member') {
      return { ...toSummary(order), membership: null };
    }
    const membership = await readMembership(db, order.userId);
    const endsAt = membership?.endsAt ?? null;
    return {
      ...toSummary(order),
      membership: {
        active: Boolean(endsAt && endsAt.getTime() > Date.now()),
        endsAt: endsAt ? endsAt.toISOString() : null,
        skuCode: membership?.skuCode ?? null,
      },
    };
  }
}

async function grantPaid(db: EntitlementDb, order: StoredOrder, paidAt: Date): Promise<void> {
  const refId = orderGrantRef(order.outTradeNo);
  if (order.skuType === 'session_pack') {
    const qty = order.priceSnapshot.sessions;
    if (!qty || qty < 1) {
      throw new PaymentFlowError(
        HttpStatus.CONFLICT,
        ApiErrorCode.PAY_ORDER_STATE,
        '加油包快照缺少场次',
      );
    }
    const days = order.priceSnapshot.inventoryExpireDays ?? DEFAULT_INVENTORY_EXPIRE_DAYS;
    const granted = await grantEntitlement(
      db,
      order.userId,
      {
        type: 'inventory',
        qty,
        source: 'session_pack',
        expiresAt: addWholeDays(paidAt, days).toISOString(),
        refId,
      },
      paidAt,
    );
    const lotId = granted.lotId ?? (await findGrantLotId(db, refId));
    if (lotId) {
      await setLotOrderId(db, lotId, order.outTradeNo);
    }
    return;
  }
  const duration = order.priceSnapshot.durationDays;
  if (!duration || duration < 1) {
    throw new PaymentFlowError(
      HttpStatus.CONFLICT,
      ApiErrorCode.PAY_ORDER_STATE,
      '会员快照缺少天数',
    );
  }
  const current = await readMembership(db, order.userId, true);
  const kind =
    order.orderKind === 'renew' || order.orderKind === 'upgrade' ? order.orderKind : 'purchase';
  const endsAt = membershipEndsAt({
    kind,
    paidAt,
    durationDays: duration,
    currentEndsAt: current?.endsAt ?? null,
  });
  await grantEntitlement(
    db,
    order.userId,
    { type: 'membership', endsAt: endsAt.toISOString(), skuCode: order.skuCode, refId },
    paidAt,
  );
  await setMembershipLastOrder(db, order.userId, order.outTradeNo);
}

function toSummary(order: StoredOrder): OrderSummary {
  return {
    id: order.id,
    outTradeNo: order.outTradeNo,
    status: order.status,
    amountFen: order.amountFen,
    currency: PAY_CURRENCY,
    skuCode: order.skuCode,
    skuType: order.skuType,
    orderKind: order.orderKind,
    paidAt: order.paidAt,
    createdAt: order.createdAt,
  };
}

function toPublicSku(sku: CatalogSku): CommerceSkuPublic {
  return {
    code: sku.code,
    type: sku.type,
    name: sku.name,
    priceFen: sku.priceFen,
    priceYuan: sku.priceYuan,
    durationDays: sku.durationDays,
    sessions: sku.sessions,
    inventoryExpireDays: sku.inventoryExpireDays,
    summary: sku.summary,
    recommended: sku.recommended,
  };
}

function pageOrders<T>(
  rows: StoredOrder[],
  limit: number,
  map: (order: StoredOrder) => T,
): {
  items: T[];
  nextCursor: string | null;
} {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map(map),
    nextCursor: rows.length > limit && last ? encodeOrderCursor(last.createdAt, last.id) : null,
  };
}

function kindError(result: {
  ok: false;
  code: ApiErrorCodeValue;
  message: string;
}): PaymentFlowError {
  const status =
    result.code === ApiErrorCode.VALIDATION_ERROR ? HttpStatus.BAD_REQUEST : HttpStatus.CONFLICT;
  return new PaymentFlowError(status, result.code, result.message);
}

function readNotice(value: unknown): {
  outTradeNo: string;
  transactionId: string;
  tradeState: string;
  total: number | null;
  payerOpenid: string | null;
} | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const tradeState = typeof row.trade_state === 'string' ? row.trade_state : '';
  const outTradeNo = typeof row.out_trade_no === 'string' ? row.out_trade_no : '';
  const transactionId = typeof row.transaction_id === 'string' ? row.transaction_id : '';
  const amount = row.amount;
  const total =
    amount && typeof amount === 'object' && 'total' in amount
      ? readFen((amount as { total?: unknown }).total)
      : null;
  const payer = row.payer;
  const payerOpenid =
    payer && typeof payer === 'object' && typeof (payer as { openid?: unknown }).openid === 'string'
      ? (payer as { openid: string }).openid
      : null;
  if (!tradeState && !outTradeNo) {
    return null;
  }
  return { outTradeNo, transactionId, tradeState, total, payerOpenid };
}

function readFen(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function headerValue(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }
  return value ?? '';
}

function readPrivateKey(env: ApiEnv): string {
  if (env.wechatPayPrivateKey.includes('PRIVATE KEY')) {
    return env.wechatPayPrivateKey;
  }
  const text = readTextFile(env.wechatPayPrivateKeyPath);
  return text.includes('PRIVATE KEY') ? text : '';
}

function readTextFile(filePath: string): string {
  if (!filePath) {
    return '';
  }
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function uniqueConstraint(error: unknown): string | null {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    (error as { code?: unknown }).code !== '23505'
  ) {
    return null;
  }
  const constraint = (error as { constraint?: unknown }).constraint;
  return typeof constraint === 'string' ? constraint : '';
}
