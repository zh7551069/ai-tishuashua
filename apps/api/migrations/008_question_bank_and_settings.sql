-- TB-17 C v0.1.0-C：独立 question_bank、系统设置、题目来源 bank。
-- 不回填历史 paper_questions / wrong_items。

CREATE TABLE IF NOT EXISTS question_bank (
  id uuid PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES domains (id),
  certificate_id uuid NOT NULL REFERENCES certificates (id),
  textbook_id uuid REFERENCES textbooks (id) ON DELETE SET NULL,
  kp_ids uuid[] NOT NULL,
  type_code text NOT NULL,
  stem text NOT NULL,
  options jsonb NOT NULL,
  answer jsonb NOT NULL,
  analysis text,
  difficulty text,
  source text NOT NULL,
  -- 指纹含 NUL，text 存不下。bytea 保存 questionContentKey 的 UTF-8 原文。
  content_key bytea NOT NULL,
  origin_session_id uuid REFERENCES quiz_sessions (id) ON DELETE SET NULL,
  origin_user_id uuid REFERENCES users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'online',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_kp_ids_check CHECK (cardinality(kp_ids) >= 1),
  CONSTRAINT question_bank_type_check CHECK (type_code IN ('single', 'multi', 'judge')),
  CONSTRAINT question_bank_source_check CHECK (source IN ('ai', 'ai_variant')),
  CONSTRAINT question_bank_status_check CHECK (status IN ('online', 'offline')),
  CONSTRAINT question_bank_difficulty_check CHECK (
    difficulty IS NULL OR difficulty IN ('easy', 'medium', 'hard')
  ),
  CONSTRAINT question_bank_cert_content_key UNIQUE (certificate_id, content_key)
)
;

CREATE INDEX IF NOT EXISTS question_bank_cert_status_idx
  ON question_bank (certificate_id, status)
;

CREATE INDEX IF NOT EXISTS question_bank_cert_type_status_idx
  ON question_bank (certificate_id, type_code, status)
;

CREATE INDEX IF NOT EXISTS question_bank_kp_ids_idx
  ON question_bank USING GIN (kp_ids)
;

ALTER TABLE paper_questions DROP CONSTRAINT IF EXISTS paper_questions_source_check
;

ALTER TABLE paper_questions ADD CONSTRAINT paper_questions_source_check CHECK (
  source IN ('ai', 'wrong_carry', 'ai_variant', 'bank')
)
;

ALTER TABLE paper_questions
  ADD COLUMN IF NOT EXISTS bank_question_id uuid REFERENCES question_bank (id)
;

ALTER TABLE paper_questions DROP CONSTRAINT IF EXISTS paper_questions_bank_ref_check
;

ALTER TABLE paper_questions ADD CONSTRAINT paper_questions_bank_ref_check CHECK (
  source <> 'bank' OR bank_question_id IS NOT NULL
)
;

ALTER TABLE wrong_items
  ADD COLUMN IF NOT EXISTS bank_question_id uuid REFERENCES question_bank (id) ON DELETE SET NULL
;

CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text
)
;

INSERT INTO system_settings (key, value, updated_by)
VALUES ('freeUserBankFirst', '{"enabled": false}'::jsonb, 'admin')
ON CONFLICT (key) DO NOTHING
;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS generation_stats jsonb
;
