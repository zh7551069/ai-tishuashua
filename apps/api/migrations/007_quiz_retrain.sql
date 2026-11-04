-- 复练同类 / 题型变异（C v0.1.0-C）
-- source 增加 retrain_similar、variant。wrongSet 仍只预留。
-- knowledge_point_ids 为空表示普通出题使用整包；非空是会话级覆盖，Worker 不得回退整包。
-- 变异题 source 为 ai_variant。不读课件，不做向量检索。

ALTER TABLE quiz_sessions DROP CONSTRAINT IF EXISTS quiz_sessions_source_check
;

ALTER TABLE quiz_sessions ADD CONSTRAINT quiz_sessions_source_check CHECK (
  source IN ('normal', 'retrain_similar', 'variant', 'wrongSet')
)
;

ALTER TABLE paper_questions DROP CONSTRAINT IF EXISTS paper_questions_source_check
;

ALTER TABLE paper_questions ADD CONSTRAINT paper_questions_source_check CHECK (
  source IN ('ai', 'wrong_carry', 'ai_variant')
)
;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS knowledge_point_ids uuid[]
;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS wrong_item_id uuid
;
