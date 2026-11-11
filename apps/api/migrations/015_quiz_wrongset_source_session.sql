-- TB-6 本卷 wrongSet 再练。
-- 记录再练来源场次。来源会话删除后置空，不级联删掉已经生成的再练卷。

ALTER TABLE quiz_sessions
  ADD COLUMN IF NOT EXISTS source_session_id uuid
;

ALTER TABLE quiz_sessions
  DROP CONSTRAINT IF EXISTS quiz_sessions_source_session_fk
;

ALTER TABLE quiz_sessions
  ADD CONSTRAINT quiz_sessions_source_session_fk
  FOREIGN KEY (source_session_id) REFERENCES quiz_sessions (id) ON DELETE SET NULL
;

CREATE INDEX IF NOT EXISTS quiz_sessions_source_session_idx
  ON quiz_sessions (source_session_id)
;
