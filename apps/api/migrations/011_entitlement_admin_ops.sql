-- TB-22 C v0.1.0-C：后管作废原因与待发放决议表。
-- 不建收款、下单或微信回调表。不改四桶账户列。

ALTER TABLE entitlement_ledger DROP CONSTRAINT IF EXISTS entitlement_ledger_reason_check
;

ALTER TABLE entitlement_ledger
  ADD CONSTRAINT entitlement_ledger_reason_check CHECK (
    reason IN (
      'daily_grant',
      'daily_expire',
      'task_grant',
      'inventory_grant',
      'membership_grant',
      'reserve_hold',
      'deduct',
      'release_restore',
      'admin_revoke'
    )
  )
;

CREATE TABLE IF NOT EXISTS entitlement_pending_grants (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  qty integer NOT NULL,
  source text NOT NULL,
  risk_code text,
  risk_text text NOT NULL DEFAULT '',
  status text NOT NULL,
  related_ref text,
  grant_lot_id uuid REFERENCES entitlement_lots (id),
  resolved_by text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entitlement_pending_grants_qty_check CHECK (qty >= 1),
  CONSTRAINT entitlement_pending_grants_status_check CHECK (
    status IN ('pending', 'granted', 'voided')
  )
)
;

CREATE INDEX IF NOT EXISTS entitlement_pending_grants_user_status_idx
  ON entitlement_pending_grants (user_id, status, created_at DESC)
;

CREATE UNIQUE INDEX IF NOT EXISTS entitlement_pending_grants_related_ref_idx
  ON entitlement_pending_grants (user_id, related_ref)
  WHERE related_ref IS NOT NULL
;
