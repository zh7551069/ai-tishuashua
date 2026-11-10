-- TB-30：包 × 知识点 × 业务日的今日完成。
-- 与 growth_task_states 签到无关。删除刷题包时去掉该包的完成行。
-- 交卷会话删掉后保留完成，只把 source_session_id 置空。

CREATE TABLE IF NOT EXISTS daily_plan_item_completions (
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  business_date date NOT NULL,
  pack_id uuid NOT NULL REFERENCES packs (id) ON DELETE CASCADE,
  knowledge_point_id uuid NOT NULL REFERENCES knowledge_points (id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL,
  source_session_id uuid REFERENCES quiz_sessions (id) ON DELETE SET NULL,
  PRIMARY KEY (user_id, business_date, pack_id, knowledge_point_id)
);

CREATE INDEX IF NOT EXISTS daily_plan_item_completions_user_date_idx
  ON daily_plan_item_completions (user_id, business_date);
