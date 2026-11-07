-- TB-23 C v0.1.0-C：微信支付订单与退款工单空壳。
-- 不建商户密钥表。不调用微信退款，工单没有执行器。

CREATE TABLE IF NOT EXISTS commerce_orders (
  id uuid PRIMARY KEY,
  out_trade_no text NOT NULL,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  sku_code text NOT NULL,
  sku_type text NOT NULL,
  order_kind text NOT NULL,
  amount_fen integer NOT NULL,
  currency text NOT NULL DEFAULT 'CNY',
  status text NOT NULL,
  price_snapshot jsonb NOT NULL,
  upgrade_from_sku text,
  upgrade_quote jsonb,
  wx_prepay_id text,
  wx_transaction_id text,
  payer_openid text,
  paid_at timestamptz,
  closed_at timestamptz,
  client_idempotency_key text,
  fail_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_orders_out_trade_no_unique UNIQUE (out_trade_no),
  CONSTRAINT commerce_orders_out_trade_no_len CHECK (char_length(out_trade_no) BETWEEN 6 AND 32),
  CONSTRAINT commerce_orders_sku_type_check CHECK (sku_type IN ('member', 'session_pack')),
  CONSTRAINT commerce_orders_kind_check CHECK (order_kind IN ('purchase', 'renew', 'upgrade')),
  CONSTRAINT commerce_orders_amount_check CHECK (amount_fen >= 0),
  CONSTRAINT commerce_orders_currency_check CHECK (currency = 'CNY'),
  CONSTRAINT commerce_orders_status_check CHECK (
    status IN ('created', 'prepay', 'paid', 'closed', 'failed', 'refunding', 'refunded')
  ),
  CONSTRAINT commerce_orders_pack_kind_check CHECK (
    sku_type <> 'session_pack' OR order_kind = 'purchase'
  ),
  CONSTRAINT commerce_orders_upgrade_check CHECK (
    (
      order_kind = 'upgrade'
      AND upgrade_from_sku IS NOT NULL
      AND upgrade_quote IS NOT NULL
    )
    OR (
      order_kind <> 'upgrade'
      AND upgrade_from_sku IS NULL
      AND upgrade_quote IS NULL
    )
  ),
  CONSTRAINT commerce_orders_paid_check CHECK (
    status <> 'paid' OR (paid_at IS NOT NULL AND wx_transaction_id IS NOT NULL)
  )
)
;

CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_wx_transaction_uidx
  ON commerce_orders (wx_transaction_id)
  WHERE wx_transaction_id IS NOT NULL
;

CREATE UNIQUE INDEX IF NOT EXISTS commerce_orders_idempotency_uidx
  ON commerce_orders (user_id, client_idempotency_key)
  WHERE client_idempotency_key IS NOT NULL
;

CREATE INDEX IF NOT EXISTS commerce_orders_user_created_idx
  ON commerce_orders (user_id, created_at DESC, id DESC)
;

CREATE INDEX IF NOT EXISTS commerce_orders_status_created_idx
  ON commerce_orders (status, created_at)
;

CREATE TABLE IF NOT EXISTS commerce_refund_tickets (
  id uuid PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES commerce_orders (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commerce_refund_tickets_status_check CHECK (status = 'open'),
  CONSTRAINT commerce_refund_tickets_reason_check CHECK (char_length(btrim(reason)) > 0)
)
;
