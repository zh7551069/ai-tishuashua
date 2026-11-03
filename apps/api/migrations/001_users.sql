-- 用户表，对齐架构 v0.2 的 User 字段。本文件只建 users。
-- 刷题包、出题会话、错题和课件在 002 及之后的迁移。
-- phone_masked 只保存脱敏展示值（例如 138****2160）。
-- 微信登录不写这一列。设置页授权后由 POST /api/users/me/phone 写入脱敏值，不保存完整号码。

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  wx_open_id text NOT NULL,
  union_id text,
  nick text,
  phone_masked text,
  avatar text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_wx_open_id_unique UNIQUE (wx_open_id),
  CONSTRAINT users_status_check CHECK (status IN ('active', 'banned'))
);

CREATE INDEX IF NOT EXISTS users_union_id_idx ON users (union_id);
