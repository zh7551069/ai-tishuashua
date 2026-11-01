-- 本地与 CI 的目录种子。没有后管时也能选领域并保存刷题包。
-- 固定 id，重复执行不会改已有行。小学与中学共用「综合素质」，用来覆盖教材多证。

INSERT INTO domains (id, code, name, status, sort_order)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'teacher', '教师资格', 'online', 1),
  ('22222222-2222-4222-8222-222222222222', 'finance', '财会金融', 'online', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO certificates (
  id, domain_id, code, name, status, total_score, pass_score, enabled_question_type_codes, sort_order
)
VALUES
  (
    '11111111-1111-4111-8111-111111111201',
    '11111111-1111-4111-8111-111111111111',
    'teacher-secondary',
    '中学教师资格',
    'online',
    120,
    70,
    ARRAY['single', 'multi', 'judge']::text[],
    1
  ),
  (
    '11111111-1111-4111-8111-111111111202',
    '11111111-1111-4111-8111-111111111111',
    'teacher-primary',
    '小学教师资格',
    'online',
    120,
    70,
    ARRAY['single', 'multi', 'judge']::text[],
    2
  ),
  (
    '22222222-2222-4222-8222-222222222201',
    '22222222-2222-4222-8222-222222222222',
    'junior-accountant',
    '初级会计职称',
    'online',
    100,
    60,
    ARRAY['single', 'multi', 'judge']::text[],
    1
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO textbooks (id, code, name, status, sort_order)
VALUES
  ('11111111-1111-4111-8111-111111111301', 'quality-comp', '综合素质', 'online', 1),
  ('11111111-1111-4111-8111-111111111302', 'edu-ability', '教育知识与能力', 'online', 2),
  ('11111111-1111-4111-8111-111111111303', 'primary-edu', '小学教育教学知识', 'online', 1),
  ('22222222-2222-4222-8222-222222222301', 'accounting-practice', '初级会计实务', 'online', 1),
  ('22222222-2222-4222-8222-222222222302', 'economic-law', '经济法基础', 'online', 2)
ON CONFLICT (code) DO NOTHING;

INSERT INTO textbook_certificates (textbook_id, certificate_id)
VALUES
  ('11111111-1111-4111-8111-111111111301', '11111111-1111-4111-8111-111111111201'),
  ('11111111-1111-4111-8111-111111111301', '11111111-1111-4111-8111-111111111202'),
  ('11111111-1111-4111-8111-111111111302', '11111111-1111-4111-8111-111111111201'),
  ('11111111-1111-4111-8111-111111111303', '11111111-1111-4111-8111-111111111202'),
  ('22222222-2222-4222-8222-222222222301', '22222222-2222-4222-8222-222222222201'),
  ('22222222-2222-4222-8222-222222222302', '22222222-2222-4222-8222-222222222201')
ON CONFLICT DO NOTHING;

INSERT INTO knowledge_points (
  id, textbook_id, parent_id, code, name, kind, prompt_hint, source_ref, level, status, sort_order
)
VALUES
  (
    '11111111-1111-4111-8111-111111111401',
    '11111111-1111-4111-8111-111111111301',
    NULL,
    'career-view',
    '职业理念',
    'knowledge_point',
    '围绕教育观、学生观、教师观出选择题与判断题',
    '综合素质·职业理念',
    1,
    'online',
    1
  ),
  (
    '11111111-1111-4111-8111-111111111402',
    '11111111-1111-4111-8111-111111111301',
    NULL,
    'edu-law',
    '教育法律法规',
    'knowledge_point',
    '依据教育法、义务教育法、教师法等常见法条出题',
    '综合素质·法律法规',
    1,
    'online',
    2
  ),
  (
    '11111111-1111-4111-8111-111111111403',
    '11111111-1111-4111-8111-111111111301',
    NULL,
    'teacher-ethics',
    '教师职业道德',
    'knowledge_point',
    '围绕师德规范与职业行为出情境题',
    NULL,
    1,
    'online',
    3
  ),
  (
    '11111111-1111-4111-8111-111111111480',
    '11111111-1111-4111-8111-111111111301',
    NULL,
    'quality-group',
    '综合素质章节',
    'group',
    NULL,
    NULL,
    1,
    'online',
    4
  ),
  (
    '11111111-1111-4111-8111-111111111499',
    '11111111-1111-4111-8111-111111111301',
    NULL,
    'teaching-eval-offline',
    '教学评价',
    'knowledge_point',
    '已下架示例，不应出现在选知识点树',
    NULL,
    1,
    'offline',
    9
  ),
  (
    '11111111-1111-4111-8111-111111111404',
    '11111111-1111-4111-8111-111111111302',
    NULL,
    'edu-base',
    '教育基础',
    'knowledge_point',
    '覆盖教育起源、制度与基本规律',
    NULL,
    1,
    'online',
    1
  ),
  (
    '11111111-1111-4111-8111-111111111405',
    '11111111-1111-4111-8111-111111111302',
    NULL,
    'mid-course',
    '中学课程',
    'knowledge_point',
    '围绕课程类型、课程实施与评价出题',
    NULL,
    1,
    'online',
    2
  ),
  (
    '11111111-1111-4111-8111-111111111406',
    '11111111-1111-4111-8111-111111111302',
    NULL,
    'mid-psych',
    '中学生学习心理',
    'knowledge_point',
    '围绕学习动机、迁移与学习策略出题',
    NULL,
    1,
    'online',
    3
  ),
  (
    '11111111-1111-4111-8111-111111111407',
    '11111111-1111-4111-8111-111111111303',
    NULL,
    'child-dev',
    '小学生发展',
    'knowledge_point',
    '围绕小学生认知与人格发展出题',
    NULL,
    1,
    'online',
    1
  ),
  (
    '11111111-1111-4111-8111-111111111408',
    '11111111-1111-4111-8111-111111111303',
    NULL,
    'primary-course',
    '小学课程',
    'knowledge_point',
    '围绕小学课程特点与综合实践活动出题',
    NULL,
    1,
    'online',
    2
  ),
  (
    '22222222-2222-4222-8222-222222222401',
    '22222222-2222-4222-8222-222222222301',
    NULL,
    'accounting-intro',
    '会计概述',
    'knowledge_point',
    '围绕会计职能、要素与等式出题',
    NULL,
    1,
    'online',
    1
  ),
  (
    '22222222-2222-4222-8222-222222222402',
    '22222222-2222-4222-8222-222222222301',
    NULL,
    'assets',
    '资产',
    'knowledge_point',
    '围绕存货、固定资产与无形资产的确认出题',
    NULL,
    1,
    'online',
    2
  ),
  (
    '22222222-2222-4222-8222-222222222403',
    '22222222-2222-4222-8222-222222222302',
    NULL,
    'legal-base',
    '法律基础',
    'knowledge_point',
    '围绕法的分类、法律关系与法律事实出题',
    NULL,
    1,
    'online',
    1
  ),
  (
    '22222222-2222-4222-8222-222222222404',
    '22222222-2222-4222-8222-222222222302',
    NULL,
    'vat',
    '增值税',
    'knowledge_point',
    '围绕增值税征税范围、税率与进项税额出题',
    NULL,
    1,
    'online',
    2
  ),
  (
    '11111111-1111-4111-8111-111111111490',
    NULL,
    NULL,
    'culture-literacy',
    '文化素养',
    'knowledge_point',
    '综合文化常识，贴合教师资格综合素质',
    NULL,
    1,
    'online',
    1
  )
ON CONFLICT (code) DO NOTHING;

INSERT INTO knowledge_points (
  id, textbook_id, parent_id, code, name, kind, prompt_hint, source_ref, level, status, sort_order
)
VALUES (
  '11111111-1111-4111-8111-111111111481',
  '11111111-1111-4111-8111-111111111301',
  '11111111-1111-4111-8111-111111111480',
  'logic-thinking',
  '逻辑思维',
  'knowledge_point',
  '考查概念关系、命题判断与简单推理',
  '综合素质·逻辑',
  2,
  'online',
  5
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO knowledge_point_certificates (knowledge_point_id, certificate_id)
VALUES ('11111111-1111-4111-8111-111111111490', '11111111-1111-4111-8111-111111111201')
ON CONFLICT DO NOTHING;
