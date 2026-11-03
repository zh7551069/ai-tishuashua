-- 配置表与学习表，对齐架构 v0.2 §6。
-- 目录、刷题包，以及出题、错题、Prompt、课件上传和提炼任务都在这里建表。
-- 出题进度、交卷和课件字段由 004–006 补上。这些表已有 API。
-- Knowledge 没有 weight。只有 kind = knowledge_point 的行可以进入刷题包。

CREATE TABLE IF NOT EXISTS domains (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'online',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT domains_code_unique UNIQUE (code),
  CONSTRAINT domains_status_check CHECK (status IN ('online', 'offline'))
);

CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY,
  domain_id uuid NOT NULL REFERENCES domains (id),
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'online',
  total_score integer NOT NULL,
  pass_score integer,
  enabled_question_type_codes text[] NOT NULL DEFAULT ARRAY['single', 'multi', 'judge']::text[],
  extra_constraint text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT certificates_code_unique UNIQUE (code),
  CONSTRAINT certificates_status_check CHECK (status IN ('online', 'offline')),
  CONSTRAINT certificates_total_score_check CHECK (total_score > 0),
  CONSTRAINT certificates_pass_score_check CHECK (
    pass_score IS NULL OR (pass_score >= 0 AND pass_score <= total_score)
  ),
  CONSTRAINT certificates_types_check CHECK (cardinality(enabled_question_type_codes) >= 1)
);

CREATE INDEX IF NOT EXISTS certificates_domain_idx ON certificates (domain_id, status);

-- 题型 code 不可变，用主键保住。本期内置 single / multi / judge。
CREATE TABLE IF NOT EXISTS question_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  option_structure jsonb NOT NULL,
  app_renderer_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO question_types (code, name, option_structure, app_renderer_key, enabled, sort_order)
VALUES
  ('single', '单选', '{"selection":"single"}'::jsonb, 'single', true, 1),
  ('multi', '多选', '{"selection":"multiple"}'::jsonb, 'multi', true, 2),
  ('judge', '判断', '{"selection":"boolean"}'::jsonb, 'judge', true, 3)
ON CONFLICT (code) DO NOTHING;

-- 教材可挂多张证书，不直接属于单一证书。
CREATE TABLE IF NOT EXISTS textbooks (
  id uuid PRIMARY KEY,
  code text NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'online',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT textbooks_code_unique UNIQUE (code),
  CONSTRAINT textbooks_status_check CHECK (status IN ('online', 'offline'))
);

CREATE TABLE IF NOT EXISTS textbook_certificates (
  textbook_id uuid NOT NULL REFERENCES textbooks (id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  PRIMARY KEY (textbook_id, certificate_id)
);

CREATE INDEX IF NOT EXISTS textbook_certificates_cert_idx ON textbook_certificates (certificate_id);

CREATE TABLE IF NOT EXISTS knowledge_points (
  id uuid PRIMARY KEY,
  textbook_id uuid REFERENCES textbooks (id) ON DELETE CASCADE,
  parent_id uuid REFERENCES knowledge_points (id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'knowledge_point',
  prompt_hint text,
  source_ref text,
  level integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'online',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_points_code_unique UNIQUE (code),
  CONSTRAINT knowledge_points_kind_check CHECK (kind IN ('knowledge_point', 'group')),
  CONSTRAINT knowledge_points_status_check CHECK (status IN ('online', 'offline')),
  CONSTRAINT knowledge_points_level_check CHECK (level >= 1 AND level <= 4),
  CONSTRAINT knowledge_points_prompt_check CHECK (
    (kind = 'group' AND prompt_hint IS NULL)
    OR (kind = 'knowledge_point' AND prompt_hint IS NOT NULL AND length(btrim(prompt_hint)) > 0)
  )
);

CREATE INDEX IF NOT EXISTS knowledge_points_textbook_idx ON knowledge_points (textbook_id, status, sort_order);

-- 不挂教材的独立知识点，直接关联证书。
CREATE TABLE IF NOT EXISTS knowledge_point_certificates (
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_points (id) ON DELETE CASCADE,
  certificate_id uuid NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  PRIMARY KEY (knowledge_point_id, certificate_id)
);

CREATE INDEX IF NOT EXISTS knowledge_point_certificates_cert_idx
  ON knowledge_point_certificates (certificate_id);

-- unavailable 不落库，读的时候用证书 status 计算。
CREATE TABLE IF NOT EXISTS packs (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  domain_id uuid NOT NULL REFERENCES domains (id),
  cert_id uuid NOT NULL REFERENCES certificates (id),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT packs_name_check CHECK (length(btrim(name)) > 0 AND char_length(name) <= 40)
);

CREATE INDEX IF NOT EXISTS packs_user_idx ON packs (user_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS packs_one_active_per_user ON packs (user_id) WHERE active;

CREATE TABLE IF NOT EXISTS pack_knowledge_points (
  pack_id uuid NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_points (id),
  position integer NOT NULL,
  PRIMARY KEY (pack_id, knowledge_point_id),
  CONSTRAINT pack_knowledge_points_position_check CHECK (position >= 1)
);

-- 出题会话、试卷题、错题、Prompt、课件上传和提炼任务。API 已接通。
CREATE TABLE IF NOT EXISTS quiz_sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  pack_id uuid REFERENCES packs (id) ON DELETE SET NULL,
  pack_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  mode text NOT NULL DEFAULT 'practice',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  score numeric,
  pass_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending',
  source text NOT NULL DEFAULT 'normal',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quiz_sessions_mode_check CHECK (mode IN ('practice', 'exam')),
  CONSTRAINT quiz_sessions_status_check CHECK (
    status IN ('pending', 'ready', 'in_progress', 'submitted', 'cancelled')
  ),
  CONSTRAINT quiz_sessions_source_check CHECK (source IN ('normal', 'wrongSet'))
);

CREATE INDEX IF NOT EXISTS quiz_sessions_user_idx ON quiz_sessions (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS paper_questions (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES quiz_sessions (id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  type_code text NOT NULL,
  stem text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]'::jsonb,
  answer jsonb NOT NULL DEFAULT 'null'::jsonb,
  analysis text,
  kp_ids uuid[] NOT NULL DEFAULT '{}',
  source text NOT NULL,
  score numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paper_questions_ordinal_unique UNIQUE (session_id, ordinal),
  CONSTRAINT paper_questions_source_check CHECK (source IN ('ai', 'wrong_carry'))
);

CREATE TABLE IF NOT EXISTS wrong_items (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  cert_id uuid NOT NULL REFERENCES certificates (id),
  kp_ids uuid[] NOT NULL DEFAULT '{}',
  question_snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  wrong_count integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wrong_items_status_check CHECK (status IN ('pending', 'cleared')),
  CONSTRAINT wrong_items_count_check CHECK (wrong_count >= 1)
);

CREATE INDEX IF NOT EXISTS wrong_items_user_idx ON wrong_items (user_id, cert_id, status);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id uuid PRIMARY KEY,
  scope text NOT NULL,
  scope_ref_id uuid,
  templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_templates_scope_check CHECK (scope IN ('global', 'domain', 'certificate')),
  CONSTRAINT prompt_templates_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT prompt_templates_version_check CHECK (version >= 1)
);

CREATE TABLE IF NOT EXISTS user_uploads (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  file_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS extract_jobs (
  id uuid PRIMARY KEY,
  upload_id uuid NOT NULL REFERENCES user_uploads (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  extracted_kp_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT extract_jobs_status_check CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed', 'cancelled')
  )
);
