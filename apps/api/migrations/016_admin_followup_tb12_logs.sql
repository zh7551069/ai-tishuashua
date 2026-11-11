-- TB-12 出题日志。追加写入，不回填历史场次。
-- 会话删掉后日志还在，session_id 置空。不级联删用户或证书。

CREATE TABLE IF NOT EXISTS quiz_generation_logs (
  id uuid PRIMARY KEY,
  session_id uuid REFERENCES quiz_sessions (id) ON DELETE SET NULL,
  user_id uuid,
  cert_id uuid,
  cert_name text,
  template_id uuid,
  template_version integer,
  template_code text,
  used_builtin boolean NOT NULL,
  success boolean NOT NULL,
  error_code text,
  error_message text,
  duration_ms integer,
  request_summary jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quiz_generation_logs_created_idx
  ON quiz_generation_logs (created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS quiz_generation_logs_session_idx
  ON quiz_generation_logs (session_id);

CREATE INDEX IF NOT EXISTS quiz_generation_logs_success_created_idx
  ON quiz_generation_logs (success, created_at DESC);

CREATE INDEX IF NOT EXISTS quiz_generation_logs_user_created_idx
  ON quiz_generation_logs (user_id, created_at DESC);
