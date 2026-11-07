-- TB-29：邀请关系、每日任务态、分享 token、用户邀请码。
-- 超限写入既有 entitlement_pending_grants。本文件不自动把 pending 改成 granted。

CREATE TABLE IF NOT EXISTS invite_relations (
  invitee_user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  inviter_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  bound_at timestamptz NOT NULL DEFAULT now(),
  invite_code_used text,
  CONSTRAINT invite_relations_not_self CHECK (invitee_user_id <> inviter_user_id)
);

CREATE INDEX IF NOT EXISTS invite_relations_inviter_idx
  ON invite_relations (inviter_user_id, bound_at DESC);

CREATE TABLE IF NOT EXISTS growth_task_states (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  checkin_done boolean NOT NULL DEFAULT false,
  share_claimed boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, business_date)
);

CREATE TABLE IF NOT EXISTS growth_share_tokens (
  token text PRIMARY KEY,
  sharer_user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  first_open_at timestamptz,
  claimed_at timestamptz,
  CONSTRAINT growth_share_tokens_token_check CHECK (char_length(token) BETWEEN 20 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_share_tokens_sharer_day_idx
  ON growth_share_tokens (sharer_user_id, business_date);

CREATE TABLE IF NOT EXISTS user_invite_codes (
  user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_invite_codes_code_unique UNIQUE (code),
  CONSTRAINT user_invite_codes_format_check CHECK (
    code ~ '^TS-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$'
  )
);
