-- TB-13 角色矩阵与数据保留。键落在已有 system_settings，不新建表。
-- 无行时 API 仍返回默认矩阵与 90/90。这里只预置默认，已有行不动。
-- 不删除练习记录、错题、证书成绩或题库。

INSERT INTO system_settings (key, value, updated_by)
VALUES
  (
    'adminRoleMatrix',
    '{
      "roles": ["research", "ops", "superadmin"],
      "capabilities": {
        "catalog.domain.write": { "research": "read", "ops": "write", "superadmin": "write" },
        "catalog.certificate.scoring": { "research": "read", "ops": "write", "superadmin": "write" },
        "catalog.knowledge.write": { "research": "write", "ops": "read", "superadmin": "write" },
        "prompt.write": { "research": "write", "ops": "read", "superadmin": "write" },
        "prompt.lock": { "research": "none", "ops": "none", "superadmin": "write" },
        "questionType.write": { "research": "read", "ops": "read", "superadmin": "write" },
        "user.ban": { "research": "none", "ops": "none", "superadmin": "write" },
        "learning.read": { "research": "read", "ops": "read", "superadmin": "read" },
        "roles.write": { "research": "none", "ops": "none", "superadmin": "write" }
      }
    }'::jsonb,
    'migration'
  ),
  (
    'dataRetention',
    '{"quizGenerationLogsDays": 90, "userUploadAndExtractDays": 90}'::jsonb,
    'migration'
  )
ON CONFLICT (key) DO NOTHING
;

CREATE INDEX IF NOT EXISTS admin_audit_logs_action_created_idx
  ON admin_audit_logs (action, created_at DESC, id DESC)
;
