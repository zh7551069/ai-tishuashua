-- 交卷：进入答题的时间、交卷时间和原因。
-- score、pass_snapshot 在建表时已经存在，这里只补计时和原因。
-- 考试到点由服务端按 started_at 判断，不依赖客户端倒计时。

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS started_at timestamptz
;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS submitted_at timestamptz
;

ALTER TABLE quiz_sessions ADD COLUMN IF NOT EXISTS submit_reason text
;

ALTER TABLE quiz_sessions DROP CONSTRAINT IF EXISTS quiz_sessions_submit_reason_check
;

ALTER TABLE quiz_sessions ADD CONSTRAINT quiz_sessions_submit_reason_check CHECK (
  submit_reason IS NULL OR submit_reason IN ('manual', 'timeout')
)
;

CREATE INDEX IF NOT EXISTS quiz_sessions_submitted_idx
  ON quiz_sessions (user_id, submitted_at DESC)
  WHERE status = 'submitted'
;
