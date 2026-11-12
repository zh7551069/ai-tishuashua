/** TB-13 角色矩阵、全站审计查询与保留周期。纯函数，不含 SQL。 */

export const ADMIN_ROLE_MATRIX_KEY = 'adminRoleMatrix';
export const DATA_RETENTION_KEY = 'dataRetention';

export const ADMIN_ROLE_KEYS = ['research', 'ops', 'superadmin'] as const;
export type AdminRoleKey = (typeof ADMIN_ROLE_KEYS)[number];

export const ROLE_LEVELS = ['read', 'write', 'none'] as const;
export type RoleLevel = (typeof ROLE_LEVELS)[number];

export const ROLE_CAPABILITIES = [
  'catalog.domain.write',
  'catalog.certificate.scoring',
  'catalog.knowledge.write',
  'prompt.write',
  'prompt.lock',
  'questionType.write',
  'user.ban',
  'learning.read',
  'roles.write',
] as const;
export type RoleCapability = (typeof ROLE_CAPABILITIES)[number];

export const DATA_RETENTION_NOTICE = '练习记录与错题暂不自动删除';
export const DEFAULT_RETENTION_DAYS = 90;
export const RETENTION_MIN_DAYS = 1;
export const RETENTION_MAX_DAYS = 3650;
export const RETENTION_DAY_MS = 86_400_000;

export const DATA_RETENTION_PURGE_JOB = 'system.retention.purge';
/** 每日 03:00 Asia/Shanghai。与 preview 共用 retentionCutoff。 */
export const DATA_RETENTION_PURGE_CRON = '0 3 * * *';

export const SYSTEM_AUDIT_DEFAULT_PAGE_SIZE = 20;
export const SYSTEM_AUDIT_MAX_PAGE_SIZE = 100;
export const SYSTEM_AUDIT_MAX_PAGE = 10_000;

const RETENTION_KEYS = ['quizGenerationLogsDays', 'userUploadAndExtractDays'] as const;

/** 出现这些键表示要把练习记录或错题纳入自动清理，一律拒绝。 */
const FORBIDDEN_RETENTION_KEYS = new Set([
  'practiceRecordsDays',
  'practiceRecordDays',
  'quizSessionsDays',
  'wrongItemsDays',
  'wrongBookDays',
  'wrongSetDays',
  'certificateScoresDays',
  'questionBankDays',
  'autoDeletePracticeRecords',
  'autoDeleteWrongItems',
]);

const DEFAULT_LEVELS: Record<RoleCapability, Record<AdminRoleKey, RoleLevel>> = {
  'catalog.domain.write': { research: 'read', ops: 'write', superadmin: 'write' },
  'catalog.certificate.scoring': { research: 'read', ops: 'write', superadmin: 'write' },
  'catalog.knowledge.write': { research: 'write', ops: 'read', superadmin: 'write' },
  'prompt.write': { research: 'write', ops: 'read', superadmin: 'write' },
  'prompt.lock': { research: 'none', ops: 'none', superadmin: 'write' },
  'questionType.write': { research: 'read', ops: 'read', superadmin: 'write' },
  'user.ban': { research: 'none', ops: 'none', superadmin: 'write' },
  'learning.read': { research: 'read', ops: 'read', superadmin: 'read' },
  'roles.write': { research: 'none', ops: 'none', superadmin: 'write' },
};

export const ROLE_CAPABILITY_LABELS: Record<RoleCapability, string> = {
  'catalog.domain.write': '领域 CRUD / 上下架',
  'catalog.certificate.scoring': '证书及格线/总分/题型子集',
  'catalog.knowledge.write': '教材 / 知识点 / promptHint',
  'prompt.write': 'Prompt 模板编辑发布',
  'prompt.lock': 'Prompt 锁定',
  'questionType.write': '题型全局 code / enabled',
  'user.ban': '用户封禁（仅展示，本刀不提供封禁 API）',
  'learning.read': '练习/错题查询导出',
  'roles.write': '角色分配',
};

export interface AdminRoleMatrix {
  roles: AdminRoleKey[];
  capabilities: Record<RoleCapability, Record<AdminRoleKey, RoleLevel>>;
}

export interface DataRetention {
  quizGenerationLogsDays: number;
  userUploadAndExtractDays: number;
}

export interface RetentionWindowCount {
  count: number;
  oldestAt: string | null;
  newestAt: string | null;
}

export interface RetentionPreview {
  quizGenerationLogs: RetentionWindowCount;
  userUploads: RetentionWindowCount;
  extractJobs: { count: number };
}

export interface SystemAuditQuery {
  page: number;
  pageSize: number;
  actor: string | null;
  actionPrefix: string | null;
  q: string | null;
  from: string | null;
  to: string | null;
}

export type AdminSystemParsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function defaultAdminRoleMatrix(): AdminRoleMatrix {
  const capabilities = {} as AdminRoleMatrix['capabilities'];
  for (const key of ROLE_CAPABILITIES) {
    capabilities[key] = { ...DEFAULT_LEVELS[key] };
  }
  return { roles: [...ADMIN_ROLE_KEYS], capabilities };
}

export function defaultDataRetention(): DataRetention {
  return {
    quizGenerationLogsDays: DEFAULT_RETENTION_DAYS,
    userUploadAndExtractDays: DEFAULT_RETENTION_DAYS,
  };
}

export function roleLevelLabel(capability: RoleCapability, level: RoleLevel): string {
  if (level === 'none') {
    return '无';
  }
  if (level === 'write') {
    return '读写';
  }
  if (capability === 'learning.read') {
    return '读';
  }
  if (capability === 'catalog.certificate.scoring') {
    return '只读（可建议）';
  }
  return '只读';
}

export function parseAdminRoleMatrixWrite(body: unknown): AdminSystemParsed<AdminRoleMatrix> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: '角色矩阵格式不正确' };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== 'roles' && key !== 'capabilities') {
      return { ok: false, message: '不能包含未知字段' };
    }
  }
  if (!Array.isArray(record.roles) || record.roles.length !== ADMIN_ROLE_KEYS.length) {
    return { ok: false, message: '角色列表不正确' };
  }
  const roles = [...record.roles];
  for (const role of ADMIN_ROLE_KEYS) {
    if (!roles.includes(role)) {
      return { ok: false, message: '角色列表不正确' };
    }
  }
  if (roles.some((role) => typeof role !== 'string')) {
    return { ok: false, message: '角色列表不正确' };
  }
  const capabilities = record.capabilities;
  if (!capabilities || typeof capabilities !== 'object' || Array.isArray(capabilities)) {
    return { ok: false, message: '能力矩阵格式不正确' };
  }
  const source = capabilities as Record<string, unknown>;
  for (const key of Object.keys(source)) {
    if (!ROLE_CAPABILITIES.includes(key as RoleCapability)) {
      return { ok: false, message: '未知能力键' };
    }
  }
  const next = {} as AdminRoleMatrix['capabilities'];
  for (const capability of ROLE_CAPABILITIES) {
    const cell = source[capability];
    if (!cell || typeof cell !== 'object' || Array.isArray(cell)) {
      return { ok: false, message: '能力矩阵格式不正确' };
    }
    const levels = cell as Record<string, unknown>;
    for (const key of Object.keys(levels)) {
      if (!ADMIN_ROLE_KEYS.includes(key as AdminRoleKey)) {
        return { ok: false, message: '未知能力键' };
      }
    }
    const parsed = {} as Record<AdminRoleKey, RoleLevel>;
    for (const role of ADMIN_ROLE_KEYS) {
      const level = levels[role];
      if (level !== 'read' && level !== 'write' && level !== 'none') {
        return { ok: false, message: '权限取值只能是 read、write 或 none' };
      }
      parsed[role] = level;
    }
    next[capability] = parsed;
  }
  return { ok: true, value: { roles: [...ADMIN_ROLE_KEYS], capabilities: next } };
}

export function parseDataRetentionWrite(body: unknown): AdminSystemParsed<DataRetention> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: '保留周期格式不正确' };
  }
  const record = body as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_RETENTION_KEYS.has(key)) {
      return { ok: false, message: '不能自动清理练习记录或错题' };
    }
    if (!RETENTION_KEYS.includes(key as (typeof RETENTION_KEYS)[number])) {
      return { ok: false, message: '不能包含未知字段' };
    }
  }
  for (const key of RETENTION_KEYS) {
    if (!Object.hasOwn(record, key)) {
      return { ok: false, message: '请同时填写两类保留天数' };
    }
  }
  const quizGenerationLogsDays = readRetentionDays(record.quizGenerationLogsDays);
  if (!quizGenerationLogsDays.ok) {
    return quizGenerationLogsDays;
  }
  const userUploadAndExtractDays = readRetentionDays(record.userUploadAndExtractDays);
  if (!userUploadAndExtractDays.ok) {
    return userUploadAndExtractDays;
  }
  return {
    ok: true,
    value: {
      quizGenerationLogsDays: quizGenerationLogsDays.value,
      userUploadAndExtractDays: userUploadAndExtractDays.value,
    },
  };
}

/** 空对象沿用当前天数。给出天数时必须两类都合法，且不写入数据库。 */
export function parseRetentionPreviewBody(
  body: unknown,
  current: DataRetention,
): AdminSystemParsed<DataRetention> {
  if (body === undefined || body === null) {
    return { ok: true, value: { ...current } };
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, message: '保留周期格式不正确' };
  }
  if (Object.keys(body as Record<string, unknown>).length === 0) {
    return { ok: true, value: { ...current } };
  }
  return parseDataRetentionWrite(body);
}

/**
 * 到期线：created_at 必须早于该时刻。等于截止瞬时的行不删。
 * days 已由写入校验限制在 1…3650。
 */
export function retentionCutoff(now: Date, days: number): Date {
  return new Date(now.getTime() - days * RETENTION_DAY_MS);
}

export function isRetentionExpired(createdAt: Date | string, cutoff: Date): boolean {
  const time = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  return Number.isFinite(time) && time < cutoff.getTime();
}

export function selectExpiredRows<T extends { createdAt: Date | string }>(
  rows: readonly T[],
  now: Date,
  days: number,
): T[] {
  const cutoff = retentionCutoff(now, days);
  return rows.filter((row) => isRetentionExpired(row.createdAt, cutoff));
}

export function summarizeRetentionPreview(input: {
  logs: readonly { createdAt: Date | string }[];
  uploads: readonly { createdAt: Date | string }[];
  jobs: readonly { uploadCreatedAt: Date | string }[];
  now: Date;
  retention: DataRetention;
}): RetentionPreview {
  const logs = selectExpiredRows(input.logs, input.now, input.retention.quizGenerationLogsDays);
  const uploads = selectExpiredRows(
    input.uploads,
    input.now,
    input.retention.userUploadAndExtractDays,
  );
  const uploadCutoff = retentionCutoff(input.now, input.retention.userUploadAndExtractDays);
  const jobs = input.jobs.filter((job) => isRetentionExpired(job.uploadCreatedAt, uploadCutoff));
  return {
    quizGenerationLogs: windowCount(logs.map((row) => row.createdAt)),
    userUploads: windowCount(uploads.map((row) => row.createdAt)),
    extractJobs: { count: jobs.length },
  };
}

export function windowCount(values: readonly (Date | string)[]): RetentionWindowCount {
  const times = values
    .map((value) => (value instanceof Date ? value.getTime() : new Date(value).getTime()))
    .filter((time) => Number.isFinite(time));
  if (times.length === 0) {
    return { count: 0, oldestAt: null, newestAt: null };
  }
  return {
    count: times.length,
    oldestAt: new Date(Math.min(...times)).toISOString(),
    newestAt: new Date(Math.max(...times)).toISOString(),
  };
}

export function parseSystemAuditQuery(input: unknown): AdminSystemParsed<SystemAuditQuery> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, message: '查询参数格式不正确' };
  }
  const source = input as Record<string, unknown>;
  const page = readBoundedInt(source.page, 1, 1, SYSTEM_AUDIT_MAX_PAGE);
  if (!page.ok) {
    return { ok: false, message: `page 必须是 1 到 ${SYSTEM_AUDIT_MAX_PAGE} 的整数` };
  }
  const pageSize = readBoundedInt(
    source.pageSize,
    SYSTEM_AUDIT_DEFAULT_PAGE_SIZE,
    1,
    SYSTEM_AUDIT_MAX_PAGE_SIZE,
  );
  if (!pageSize.ok) {
    return { ok: false, message: `pageSize 必须是 1 到 ${SYSTEM_AUDIT_MAX_PAGE_SIZE} 的整数` };
  }
  const actor = readOptionalText(source.actor, 64);
  if (!actor.ok) {
    return { ok: false, message: '操作人筛选不正确' };
  }
  const q = readOptionalText(source.q, 80);
  if (!q.ok) {
    return { ok: false, message: '筛选内容不正确' };
  }
  const actionPrefix = readActionPrefix(source.actionPrefix);
  if (!actionPrefix.ok) {
    return actionPrefix;
  }
  const from = readOptionalTime(source.from);
  if (!from.ok) {
    return { ok: false, message: '开始时间不正确' };
  }
  const to = readOptionalTime(source.to);
  if (!to.ok) {
    return { ok: false, message: '结束时间不正确' };
  }
  if (from.value && to.value && from.value > to.value) {
    return { ok: false, message: '结束时间不能早于开始时间' };
  }
  return {
    ok: true,
    value: {
      page: page.value,
      pageSize: pageSize.value,
      actor: actor.value,
      actionPrefix: actionPrefix.value,
      q: q.value,
      from: from.value,
      to: to.value,
    },
  };
}

export function auditLikePrefix(prefix: string): string {
  return `${escapeLike(prefix)}%`;
}

export function auditLikeContains(value: string): string {
  return `%${escapeLike(value)}%`;
}

function readRetentionDays(value: unknown): AdminSystemParsed<number> {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { ok: false, message: '天数必须是 1 到 3650 的整数' };
  }
  if (value < RETENTION_MIN_DAYS || value > RETENTION_MAX_DAYS) {
    return { ok: false, message: '天数必须是 1 到 3650 的整数' };
  }
  return { ok: true, value };
}

function readBoundedInt(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): AdminSystemParsed<number> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    return { ok: false, message: '数值不正确' };
  }
  return { ok: true, value: parsed };
}

function readOptionalText(value: unknown, max: number): AdminSystemParsed<string | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: '文本不正确' };
  }
  const text = value.trim();
  if (!text || text.length > max) {
    return { ok: false, message: '文本不正确' };
  }
  return { ok: true, value: text };
}

function readActionPrefix(value: unknown): AdminSystemParsed<string | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: '动作前缀不正确' };
  }
  const prefix = value.trim();
  if (!prefix || prefix.length > 80 || !/^[A-Za-z][A-Za-z0-9_.]*$/.test(prefix)) {
    return { ok: false, message: '动作前缀不正确' };
  }
  return { ok: true, value: prefix };
}

function readOptionalTime(value: unknown): AdminSystemParsed<string | null> {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: null };
  }
  if (typeof value !== 'string') {
    return { ok: false, message: '时间不正确' };
  }
  const time = new Date(value);
  if (Number.isNaN(time.getTime())) {
    return { ok: false, message: '时间不正确' };
  }
  return { ok: true, value: time.toISOString() };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
