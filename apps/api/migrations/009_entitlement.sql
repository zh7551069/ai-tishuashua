-- TB-20 C v0.1.0-C：四桶权益账户、库存批次、只追加流水、会员与出题预扣。
-- 不建支付、订单或微信回调表。不回填历史用户的日免行，首请求懒创建。

CREATE TABLE IF NOT EXISTS entitlement_accounts (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  daily_free_remain integer NOT NULL,
  daily_task_remain integer NOT NULL,
  refine_lifetime_used integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_accounts_daily_free_check CHECK (daily_free_remain >= 0),
  CONSTRAINT entitlement_accounts_daily_task_check CHECK (daily_task_remain >= 0),
  CONSTRAINT entitlement_accounts_refine_check CHECK (refine_lifetime_used >= 0)
)
;

CREATE TABLE IF NOT EXISTS entitlement_lots (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bucket text NOT NULL,
  qty integer NOT NULL,
  remain integer NOT NULL,
  source text NOT NULL,
  expires_at timestamptz,
  order_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_lots_bucket_check CHECK (bucket = 'inventory'),
  CONSTRAINT entitlement_lots_qty_check CHECK (qty >= 1),
  CONSTRAINT entitlement_lots_remain_check CHECK (remain >= 0 AND remain <= qty)
)
;

CREATE INDEX IF NOT EXISTS entitlement_lots_user_remain_idx
  ON entitlement_lots (user_id, remain)
;

CREATE INDEX IF NOT EXISTS entitlement_lots_consume_idx
  ON entitlement_lots (user_id, expires_at ASC NULLS LAST, created_at ASC, id ASC)
;

CREATE TABLE IF NOT EXISTS entitlement_ledger (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta integer NOT NULL,
  bucket text NOT NULL,
  reason text NOT NULL,
  ref_type text NOT NULL,
  ref_id text NOT NULL,
  biz_date date NOT NULL,
  lot_id uuid REFERENCES entitlement_lots (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_ledger_bucket_check CHECK (
    bucket IN ('daily_free', 'daily_task', 'inventory', 'membership')
  ),
  CONSTRAINT entitlement_ledger_reason_check CHECK (
    reason IN (
      'daily_grant',
      'daily_expire',
      'task_grant',
      'inventory_grant',
      'membership_grant',
      'reserve_hold',
      'deduct',
      'release_restore'
    )
  ),
  CONSTRAINT entitlement_ledger_ref_unique UNIQUE (ref_type, ref_id, reason, bucket)
)
;

CREATE INDEX IF NOT EXISTS entitlement_ledger_user_created_idx
  ON entitlement_ledger (user_id, created_at DESC, id DESC)
;

CREATE TABLE IF NOT EXISTS memberships (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  sku_code text,
  last_order_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_status_check CHECK (status IN ('active', 'expired', 'none'))
)
;

CREATE TABLE IF NOT EXISTS entitlement_reservations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL,
  bucket_spent text,
  lot_id uuid REFERENCES entitlement_lots (id),
  qty integer NOT NULL,
  biz_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_reservations_session_unique UNIQUE (session_id),
  CONSTRAINT entitlement_reservations_key_unique UNIQUE (idempotency_key),
  CONSTRAINT entitlement_reservations_status_check CHECK (
    status IN ('held', 'committed', 'released')
  ),
  CONSTRAINT entitlement_reservations_qty_check CHECK (qty = 1),
  CONSTRAINT entitlement_reservations_bucket_check CHECK (
    bucket_spent IS NULL OR bucket_spent IN ('daily_free', 'daily_task', 'inventory')
  ),
  CONSTRAINT entitlement_reservations_lot_check CHECK (
    (bucket_spent = 'inventory' AND lot_id IS NOT NULL)
    OR (bucket_spent IS DISTINCT FROM 'inventory' AND lot_id IS NULL)
  )
)
;

CREATE INDEX IF NOT EXISTS entitlement_reservations_session_idx
  ON entitlement_reservations (session_id)
;
