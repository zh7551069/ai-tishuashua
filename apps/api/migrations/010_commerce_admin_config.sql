-- TB-21 C v0.1.0-C：后管配额、增长配置与权益 SKU 目录。
-- 不建收款、下单或回调表。

INSERT INTO system_settings (key, value, updated_by)
VALUES
  ('dailyFreeSessions', '{"sessions": 2}'::jsonb, 'admin'),
  ('refineLifetimeLimitFree', '{"limit": 1}'::jsonb, 'admin'),
  (
    'growthConfig',
    '{"checkin":{"enabled":true,"rewardSessions":1},"share":{"enabled":true,"rewardSessions":1,"memberRefineBonus":1},"invite":{"registerEnabled":true,"inviterRegisterSessions":1,"inviteeWelcomeSessions":1,"firstSubmitEnabled":true,"inviterFirstSubmitSessions":3,"inviteeFirstSubmitSessions":2,"dailyCapEnabled":true,"dailyCapSessions":6,"weeklyCapEnabled":true,"weeklyCapSessions":15}}'::jsonb,
    'admin'
  )
ON CONFLICT (key) DO NOTHING
;

CREATE TABLE IF NOT EXISTS commerce_skus (
  code text PRIMARY KEY,
  type text NOT NULL,
  name text NOT NULL,
  price_fen integer NOT NULL,
  duration_days integer,
  sessions integer,
  inventory_expire_days integer,
  summary text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  recommended boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  CONSTRAINT commerce_skus_type_check CHECK (type IN ('member', 'session_pack')),
  CONSTRAINT commerce_skus_price_check CHECK (price_fen >= 0),
  CONSTRAINT commerce_skus_name_check CHECK (char_length(btrim(name)) > 0),
  CONSTRAINT commerce_skus_shape_check CHECK (
    (
      type = 'member'
      AND duration_days IS NOT NULL
      AND duration_days >= 1
      AND sessions IS NULL
      AND inventory_expire_days IS NULL
    )
    OR (
      type = 'session_pack'
      AND sessions IS NOT NULL
      AND sessions >= 1
      AND duration_days IS NULL
    )
  )
)
;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id bigserial PRIMARY KEY,
  actor text NOT NULL,
  action text NOT NULL,
  target text NOT NULL,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
)
;

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC, id DESC)
;

INSERT INTO commerce_skus (
  code, type, name, price_fen, duration_days, sessions, inventory_expire_days,
  summary, enabled, recommended, sort_order, updated_by
)
VALUES
  ('member_week', 'member', '会员 · 周卡', 1200, 7, NULL, NULL, '不限场 · 全上架证', true, false, 10, 'admin'),
  ('member_month', 'member', '会员 · 月卡（荐）', 2800, 30, NULL, NULL, '不限场 · 全上架证', true, true, 20, 'admin'),
  ('member_quarter', 'member', '会员 · 季卡', 6800, 90, NULL, NULL, '不限场 · 全上架证', true, false, 30, 'admin'),
  ('member_year', 'member', '会员 · 年卡', 19800, 365, NULL, NULL, '不限场 · 全上架证', true, false, 40, 'admin'),
  ('session_pack_5', 'session_pack', '场次加油包 ×5', 600, NULL, 5, 365, '+5 场库存 · 跨日不清零', true, false, 50, 'admin')
ON CONFLICT (code) DO NOTHING
;
