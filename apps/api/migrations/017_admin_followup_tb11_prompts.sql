-- TB-11 出题配置。工作行与已发布快照分开。
-- 发布只 INSERT prompt_template_versions，不改旧版本行。
-- 回填现网两条已发布种子。其余已存在行只补身份列，不新增业务种子。

ALTER TABLE prompt_templates
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_published_version integer,
  ADD COLUMN IF NOT EXISTS updated_by text
;

ALTER TABLE prompt_templates DROP CONSTRAINT IF EXISTS prompt_templates_version_check
;

ALTER TABLE prompt_templates
  ADD CONSTRAINT prompt_templates_version_check CHECK (version >= 0)
;

UPDATE prompt_templates
SET
  name = '全局出题模板',
  code = 'gen_global_v1',
  locked = false,
  current_published_version = version,
  status = 'published'
WHERE id = '44444444-4444-4444-8444-444444444401'
;

UPDATE prompt_templates
SET
  name = '中学教师资格出题模板',
  code = 'gen_cert_teacher_secondary',
  locked = false,
  current_published_version = version,
  status = 'published'
WHERE id = '44444444-4444-4444-8444-444444444402'
;

UPDATE prompt_templates
SET
  name = COALESCE(NULLIF(btrim(name), ''), '未命名模板'),
  code = COALESCE(NULLIF(btrim(code), ''), 'tpl_' || replace(id::text, '-', ''))
WHERE name IS NULL OR code IS NULL OR btrim(name) = '' OR btrim(code) = ''
;

UPDATE prompt_templates
SET current_published_version = version
WHERE status = 'published' AND current_published_version IS NULL
;

ALTER TABLE prompt_templates ALTER COLUMN name SET NOT NULL
;

ALTER TABLE prompt_templates ALTER COLUMN code SET NOT NULL
;

CREATE UNIQUE INDEX IF NOT EXISTS prompt_templates_code_unique ON prompt_templates (code)
;

CREATE TABLE IF NOT EXISTS prompt_template_versions (
  id uuid PRIMARY KEY,
  template_id uuid NOT NULL REFERENCES prompt_templates (id) ON DELETE RESTRICT,
  version integer NOT NULL,
  templates jsonb NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prompt_template_versions_version_check CHECK (version >= 1),
  CONSTRAINT prompt_template_versions_unique UNIQUE (template_id, version)
)
;

CREATE INDEX IF NOT EXISTS prompt_template_versions_template_idx
  ON prompt_template_versions (template_id, version DESC)
;

INSERT INTO prompt_template_versions (
  id, template_id, version, templates, variables, published_by
)
SELECT
  '55555555-5555-4555-8555-555555555501',
  id,
  version,
  templates,
  variables,
  'seed'
FROM prompt_templates
WHERE id = '44444444-4444-4444-8444-444444444401'
  AND NOT EXISTS (
    SELECT 1
    FROM prompt_template_versions AS existing
    WHERE existing.template_id = prompt_templates.id
      AND existing.version = prompt_templates.version
  )
;

INSERT INTO prompt_template_versions (
  id, template_id, version, templates, variables, published_by
)
SELECT
  '55555555-5555-4555-8555-555555555502',
  id,
  version,
  templates,
  variables,
  'seed'
FROM prompt_templates
WHERE id = '44444444-4444-4444-8444-444444444402'
  AND NOT EXISTS (
    SELECT 1
    FROM prompt_template_versions AS existing
    WHERE existing.template_id = prompt_templates.id
      AND existing.version = prompt_templates.version
  )
;

INSERT INTO prompt_template_versions (
  id, template_id, version, templates, variables, published_by
)
SELECT
  gen_random_uuid(),
  template.id,
  template.current_published_version,
  template.templates,
  template.variables,
  'migration'
FROM prompt_templates AS template
WHERE template.status = 'published'
  AND template.current_published_version IS NOT NULL
  AND template.id NOT IN (
    '44444444-4444-4444-8444-444444444401',
    '44444444-4444-4444-8444-444444444402'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM prompt_template_versions AS existing
    WHERE existing.template_id = template.id
      AND existing.version = template.current_published_version
  )
;

ALTER TABLE question_types
  ADD COLUMN IF NOT EXISTS grading_rule_brief text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_by text
;

UPDATE question_types
SET
  grading_rule_brief = CASE code
    WHEN 'single' THEN '全对得分'
    WHEN 'multi' THEN '全对得分，少选得部分分'
    WHEN 'judge' THEN '全对得分'
    ELSE COALESCE(NULLIF(btrim(grading_rule_brief), ''), '全对得分')
  END,
  updated_at = COALESCE(updated_at, now())
;

ALTER TABLE question_types ALTER COLUMN grading_rule_brief SET NOT NULL
;

CREATE TABLE IF NOT EXISTS cert_question_type_configs (
  certificate_id uuid NOT NULL REFERENCES certificates (id) ON DELETE CASCADE,
  question_type_code text NOT NULL REFERENCES question_types (code),
  default_selected boolean NOT NULL DEFAULT false,
  min_count integer,
  max_count integer,
  default_count_share integer,
  score_per_question numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text,
  PRIMARY KEY (certificate_id, question_type_code),
  CONSTRAINT cert_qtype_min_check CHECK (min_count IS NULL OR min_count >= 0),
  CONSTRAINT cert_qtype_max_check CHECK (max_count IS NULL OR max_count >= 0),
  CONSTRAINT cert_qtype_range_check CHECK (
    min_count IS NULL OR max_count IS NULL OR min_count <= max_count
  ),
  CONSTRAINT cert_qtype_share_check CHECK (
    default_count_share IS NULL
    OR (default_count_share >= 0 AND default_count_share <= 100)
  ),
  CONSTRAINT cert_qtype_score_check CHECK (
    score_per_question IS NULL OR score_per_question > 0
  )
)
;
