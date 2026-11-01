-- 最小用户表，对齐架构 v0.2 的 User 字段。学习数据（包、场次、错题）不在本切片。
-- phone_masked 只保存脱敏展示值（例如 138****2160）。本切片登录不写入手机号。

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
