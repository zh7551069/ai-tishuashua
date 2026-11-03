-- 课件上传与慢提炼。
-- 用户勾选的知识点挂在 owner_user_id 上，只出现在该用户的证书树里。
-- 免费终身 1 次提炼配额本期不设门禁。

ALTER TABLE user_uploads
  ADD COLUMN IF NOT EXISTS certificate_id uuid REFERENCES certificates (id) ON DELETE CASCADE
;

ALTER TABLE user_uploads
  ADD COLUMN IF NOT EXISTS error_code text
;

ALTER TABLE user_uploads
  ADD COLUMN IF NOT EXISTS error_message text
;

ALTER TABLE user_uploads DROP CONSTRAINT IF EXISTS user_uploads_status_check
;

ALTER TABLE user_uploads ADD CONSTRAINT user_uploads_status_check CHECK (
  status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')
)
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS stage text NOT NULL DEFAULT 'uploading'
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS estimated_minutes integer
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS error_code text
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS error_message text
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS run_token uuid
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS drafts jsonb NOT NULL DEFAULT '[]'::jsonb
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS accepted_at timestamptz
;

ALTER TABLE extract_jobs ADD COLUMN IF NOT EXISTS accepted_draft_ids uuid[] NOT NULL DEFAULT '{}'
;

ALTER TABLE extract_jobs DROP CONSTRAINT IF EXISTS extract_jobs_stage_check
;

ALTER TABLE extract_jobs ADD CONSTRAINT extract_jobs_stage_check CHECK (
  stage IN ('uploading', 'learning', 'extracting', 'done')
)
;

ALTER TABLE extract_jobs DROP CONSTRAINT IF EXISTS extract_jobs_progress_check
;

ALTER TABLE extract_jobs ADD CONSTRAINT extract_jobs_progress_check CHECK (
  progress >= 0 AND progress <= 100
)
;

ALTER TABLE extract_jobs DROP CONSTRAINT IF EXISTS extract_jobs_minutes_check
;

ALTER TABLE extract_jobs ADD CONSTRAINT extract_jobs_minutes_check CHECK (
  estimated_minutes IS NULL OR (estimated_minutes >= 1 AND estimated_minutes <= 30)
)
;

CREATE UNIQUE INDEX IF NOT EXISTS extract_jobs_one_per_upload ON extract_jobs (upload_id)
;

CREATE INDEX IF NOT EXISTS extract_jobs_user_idx ON extract_jobs (user_id, created_at DESC)
;

CREATE INDEX IF NOT EXISTS user_uploads_user_idx ON user_uploads (user_id, created_at DESC)
;

ALTER TABLE knowledge_points
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users (id) ON DELETE CASCADE
;

ALTER TABLE textbooks
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES users (id) ON DELETE CASCADE
;

CREATE INDEX IF NOT EXISTS knowledge_points_owner_idx ON knowledge_points (owner_user_id)
;

CREATE INDEX IF NOT EXISTS textbooks_owner_idx ON textbooks (owner_user_id)
;
