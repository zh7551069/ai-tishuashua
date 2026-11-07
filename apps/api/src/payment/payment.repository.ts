import {
  PAY_CURRENCY,
  parsePriceSnapshot,
  priceYuanFromFen,
  type CommerceSkuPublic,
  type OrderCursor,
  type OrderKind,
  type OrderStatus,
  type SkuType,
  type UpgradeQuote,
} from '@tishuashua/shared';

export interface PayDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; rowCount?: number | null }>;
}

export interface CatalogSku extends CommerceSkuPublic {
  enabled: boolean;
}

export interface StoredOrder {
  id: string;
  outTradeNo: string;
  userId: string;
  skuCode: string;
  skuType: SkuType;
  orderKind: OrderKind;
  amountFen: number;
  status: OrderStatus;
  priceSnapshot: CommerceSkuPublic;
  upgradeFromSku: string | null;
  upgradeQuote: UpgradeQuote | null;
  wxPrepayId: string | null;
  wxTransactionId: string | null;
  payerOpenid: string | null;
  paidAt: string | null;
  closedAt: string | null;
  clientIdempotencyKey: string | null;
  failReason: string | null;
  createdAt: string;
}

export interface MembershipSnapshot {
  endsAt: Date | null;
  skuCode: string | null;
}

const ORDER_COLUMNS = `
  id, out_trade_no, user_id, sku_code, sku_type, order_kind, amount_fen, currency, status,
  price_snapshot, upgrade_from_sku, upgrade_quote, wx_prepay_id, wx_transaction_id,
  payer_openid, paid_at, closed_at, client_idempotency_key, fail_reason, created_at
`;

export async function listEnabledSkus(db: PayDb): Promise<CatalogSku[]> {
  const result = await db.query(
    `
      SELECT
        code, type, name, price_fen, duration_days, sessions, inventory_expire_days,
        summary, recommended, enabled
      FROM commerce_skus
      WHERE enabled = true
      ORDER BY sort_order ASC, code ASC
    `,
  );
  return result.rows.map(mapSku);
}

export async function findSku(db: PayDb, code: string): Promise<CatalogSku | null> {
  const result = await db.query(
    `
      SELECT
        code, type, name, price_fen, duration_days, sessions, inventory_expire_days,
        summary, recommended, enabled
      FROM commerce_skus
      WHERE code = $1
    `,
    [code],
  );
  const row = result.rows[0];
  return row ? mapSku(row) : null;
}

export async function findOrderByOutTradeNo(
  db: PayDb,
  outTradeNo: string,
): Promise<StoredOrder | null> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE out_trade_no = $1
    `,
    [outTradeNo],
  );
  const row = result.rows[0];
  return row ? requiredOrder(row) : null;
}

export async function readMembership(
  db: PayDb,
  userId: string,
  lock = false,
): Promise<MembershipSnapshot | null> {
  const result = await db.query(
    `
      SELECT ends_at, sku_code
      FROM memberships
      WHERE user_id = $1
      ${lock ? 'FOR UPDATE' : ''}
    `,
    [userId],
  );
  const row = result.rows[0];
  if (!row || typeof row !== 'object') {
    return null;
  }
  const record = row as { ends_at?: unknown; sku_code?: unknown };
  return {
    endsAt: asDate(record.ends_at),
    skuCode: typeof record.sku_code === 'string' && record.sku_code.trim() ? record.sku_code : null,
  };
}

export async function insertOrder(
  db: PayDb,
  input: {
    id: string;
    outTradeNo: string;
    userId: string;
    sku: CatalogSku;
    orderKind: OrderKind;
    amountFen: number;
    upgradeFromSku: string | null;
    upgradeQuote: UpgradeQuote | null;
    payerOpenid: string;
    clientIdempotencyKey: string | null;
  },
): Promise<StoredOrder> {
  const result = await db.query(
    `
      INSERT INTO commerce_orders (
        id, out_trade_no, user_id, sku_code, sku_type, order_kind, amount_fen, currency,
        status, price_snapshot, upgrade_from_sku, upgrade_quote, payer_openid,
        client_idempotency_key
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, 'CNY', 'created', $8::jsonb, $9, $10::jsonb, $11, $12
      )
      RETURNING ${ORDER_COLUMNS}
    `,
    [
      input.id,
      input.outTradeNo,
      input.userId,
      input.sku.code,
      input.sku.type,
      input.orderKind,
      input.amountFen,
      JSON.stringify(snapshotOf(input.sku)),
      input.upgradeFromSku,
      input.upgradeQuote ? JSON.stringify(input.upgradeQuote) : null,
      input.payerOpenid,
      input.clientIdempotencyKey,
    ],
  );
  return requiredOrder(result.rows[0]);
}

export async function findIdempotentOrder(
  db: PayDb,
  userId: string,
  key: string,
): Promise<StoredOrder | null> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE user_id = $1 AND client_idempotency_key = $2
    `,
    [userId, key],
  );
  const row = result.rows[0];
  return row ? requiredOrder(row) : null;
}

export async function findUserOrder(
  db: PayDb,
  userId: string,
  outTradeNo: string,
): Promise<StoredOrder | null> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE user_id = $1 AND out_trade_no = $2
    `,
    [userId, outTradeNo],
  );
  const row = result.rows[0];
  return row ? requiredOrder(row) : null;
}

export async function lockOrder(db: PayDb, outTradeNo: string): Promise<StoredOrder | null> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE out_trade_no = $1
      FOR UPDATE
    `,
    [outTradeNo],
  );
  const row = result.rows[0];
  return row ? requiredOrder(row) : null;
}

export async function updatePrepay(
  db: PayDb,
  id: string,
  prepayId: string,
): Promise<StoredOrder | null> {
  const result = await db.query(
    `
      UPDATE commerce_orders
      SET status = 'prepay', wx_prepay_id = $2, updated_at = now()
      WHERE id = $1 AND status IN ('created', 'prepay')
      RETURNING ${ORDER_COLUMNS}
    `,
    [id, prepayId],
  );
  const row = result.rows[0];
  return row ? requiredOrder(row) : null;
}

export async function updateFailed(db: PayDb, id: string, reason: string): Promise<void> {
  await db.query(
    `
      UPDATE commerce_orders
      SET status = 'failed', fail_reason = $2, updated_at = now()
      WHERE id = $1 AND status IN ('created', 'prepay')
    `,
    [id, reason.slice(0, 200)],
  );
}

export async function markPaid(
  db: PayDb,
  id: string,
  transactionId: string,
  paidAt: Date,
): Promise<number> {
  const result = await db.query(
    `
      UPDATE commerce_orders
      SET status = 'paid',
          paid_at = $2,
          wx_transaction_id = $3,
          fail_reason = NULL,
          updated_at = now()
      WHERE id = $1 AND status IN ('created', 'prepay')
    `,
    [id, paidAt.toISOString(), transactionId],
  );
  return result.rowCount ?? 0;
}

export async function markFailReason(db: PayDb, outTradeNo: string, reason: string): Promise<void> {
  await db.query(
    `
      UPDATE commerce_orders
      SET fail_reason = $2, updated_at = now()
      WHERE out_trade_no = $1
    `,
    [outTradeNo, reason.slice(0, 200)],
  );
}

export async function closeExpiredOrders(db: PayDb, userId: string | null): Promise<void> {
  await db.query(
    `
      UPDATE commerce_orders
      SET status = 'closed', closed_at = now(), updated_at = now()
      WHERE status IN ('created', 'prepay')
        AND created_at <= now() - interval '2 hours'
        AND ($1::uuid IS NULL OR user_id = $1)
    `,
    [userId],
  );
}

export async function listUserOrders(
  db: PayDb,
  userId: string,
  limit: number,
  cursor: OrderCursor | null,
): Promise<StoredOrder[]> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE user_id = $1
        AND (
          $2::timestamptz IS NULL
          OR (created_at, id) < ($2::timestamptz, $3::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $4
    `,
    [userId, cursor?.createdAt ?? null, cursor?.id ?? null, limit],
  );
  return result.rows.map(requiredOrder);
}

export async function listAdminOrders(
  db: PayDb,
  filter: {
    userId: string | null;
    outTradeNo: string | null;
    status: OrderStatus | null;
    limit: number;
    cursor: OrderCursor | null;
  },
): Promise<StoredOrder[]> {
  const result = await db.query(
    `
      SELECT ${ORDER_COLUMNS}
      FROM commerce_orders
      WHERE ($1::uuid IS NULL OR user_id = $1)
        AND ($2::text IS NULL OR out_trade_no = $2)
        AND ($3::text IS NULL OR status = $3)
        AND (
          $4::timestamptz IS NULL
          OR (created_at, id) < ($4::timestamptz, $5::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $6
    `,
    [
      filter.userId,
      filter.outTradeNo,
      filter.status,
      filter.cursor?.createdAt ?? null,
      filter.cursor?.id ?? null,
      filter.limit,
    ],
  );
  return result.rows.map(requiredOrder);
}

export async function setMembershipLastOrder(
  db: PayDb,
  userId: string,
  outTradeNo: string,
): Promise<void> {
  await db.query(
    `
      UPDATE memberships
      SET last_order_id = $2, updated_at = now()
      WHERE user_id = $1
    `,
    [userId, outTradeNo],
  );
}

export async function setLotOrderId(db: PayDb, lotId: string, outTradeNo: string): Promise<void> {
  await db.query(
    `
      UPDATE entitlement_lots
      SET order_id = $2
      WHERE id = $1 AND (order_id IS NULL OR order_id = $2)
    `,
    [lotId, outTradeNo],
  );
}

export async function findGrantLotId(db: PayDb, refId: string): Promise<string | null> {
  const result = await db.query(
    `
      SELECT lot_id
      FROM entitlement_ledger
      WHERE ref_type = 'grant' AND ref_id = $1 AND reason = 'inventory_grant' AND bucket = 'inventory'
    `,
    [refId],
  );
  const lotId = (result.rows[0] as { lot_id?: unknown } | undefined)?.lot_id;
  return typeof lotId === 'string' ? lotId : null;
}

function snapshotOf(sku: CatalogSku): CommerceSkuPublic {
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

function mapSku(value: unknown): CatalogSku {
  if (!value || typeof value !== 'object') {
    throw new Error('SKU 行无法读取');
  }
  const row = value as Record<string, unknown>;
  const priceFen = asInt(row.price_fen);
  if (
    typeof row.code !== 'string' ||
    priceFen === null ||
    (row.type !== 'member' && row.type !== 'session_pack')
  ) {
    throw new Error('SKU 行无法读取');
  }
  return {
    code: row.code,
    type: row.type,
    name: typeof row.name === 'string' ? row.name : row.code,
    priceFen,
    priceYuan: priceYuanFromFen(priceFen),
    durationDays: asInt(row.duration_days),
    sessions: asInt(row.sessions),
    inventoryExpireDays: asInt(row.inventory_expire_days),
    summary: typeof row.summary === 'string' ? row.summary : '',
    recommended: row.recommended === true,
    enabled: row.enabled === true,
  };
}

function requiredOrder(value: unknown): StoredOrder {
  const order = mapOrder(value);
  if (!order) {
    throw new Error('订单行无法读取');
  }
  return order;
}

function mapOrder(value: unknown): StoredOrder | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  const snapshot = parsePriceSnapshot(row.price_snapshot);
  const amountFen = asInt(row.amount_fen);
  const createdAt = asDate(row.created_at);
  if (
    typeof row.id !== 'string' ||
    typeof row.out_trade_no !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.sku_code !== 'string' ||
    (row.sku_type !== 'member' && row.sku_type !== 'session_pack') ||
    (row.order_kind !== 'purchase' && row.order_kind !== 'renew' && row.order_kind !== 'upgrade') ||
    amountFen === null ||
    !isStatus(row.status) ||
    !snapshot ||
    !createdAt
  ) {
    return null;
  }
  if (row.currency !== undefined && row.currency !== null && row.currency !== PAY_CURRENCY) {
    return null;
  }
  return {
    id: row.id,
    outTradeNo: row.out_trade_no,
    userId: row.user_id,
    skuCode: row.sku_code,
    skuType: row.sku_type,
    orderKind: row.order_kind,
    amountFen,
    status: row.status,
    priceSnapshot: snapshot,
    upgradeFromSku: typeof row.upgrade_from_sku === 'string' ? row.upgrade_from_sku : null,
    upgradeQuote: mapQuote(row.upgrade_quote),
    wxPrepayId: typeof row.wx_prepay_id === 'string' ? row.wx_prepay_id : null,
    wxTransactionId: typeof row.wx_transaction_id === 'string' ? row.wx_transaction_id : null,
    payerOpenid: typeof row.payer_openid === 'string' ? row.payer_openid : null,
    paidAt: asIso(row.paid_at),
    closedAt: asIso(row.closed_at),
    clientIdempotencyKey:
      typeof row.client_idempotency_key === 'string' ? row.client_idempotency_key : null,
    failReason: typeof row.fail_reason === 'string' ? row.fail_reason : null,
    createdAt: createdAt.toISOString(),
  };
}

function mapQuote(value: unknown): UpgradeQuote | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;
  const remainingDays = asInt(row.remainingDays);
  const remainingValueFen = asInt(row.remainingValueFen);
  const payFen = asInt(row.payFen);
  if (
    typeof row.currentSkuCode !== 'string' ||
    typeof row.targetSkuCode !== 'string' ||
    remainingDays === null ||
    remainingValueFen === null ||
    payFen === null
  ) {
    return null;
  }
  return {
    currentSkuCode: row.currentSkuCode,
    targetSkuCode: row.targetSkuCode,
    remainingDays,
    remainingValueFen,
    payFen,
    currency: PAY_CURRENCY,
  };
}

function isStatus(value: unknown): value is OrderStatus {
  return (
    value === 'created' ||
    value === 'prepay' ||
    value === 'paid' ||
    value === 'closed' ||
    value === 'failed' ||
    value === 'refunding' ||
    value === 'refunded'
  );
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  return null;
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return null;
}

function asIso(value: unknown): string | null {
  return asDate(value)?.toISOString() ?? null;
}
