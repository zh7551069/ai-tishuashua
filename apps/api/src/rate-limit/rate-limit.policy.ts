import { createHash } from 'node:crypto';

/** 固定窗口默认 60 秒。非法环境变量回落到这些数字，进程不因此起不来。 */
export const RATE_LIMIT_DEFAULTS = {
  windowSeconds: 60,
  /** POST /api/auth/wechat/login，按来源 IP。 */
  wechatLoginMax: 60,
  /** POST /api/admin/login。来源 IP 和帐号各有一份，互不占用。 */
  adminLoginMax: 30,
  /** 已通过微信会话的小程序接口，按 userId。 */
  wechatApiMax: 300,
  /** 已通过微信会话的小程序接口，按来源 IP。和登录额度不是同一把钥匙。 */
  wechatIpMax: 600,
  /** 已通过后管会话的接口，按用户名。 */
  adminApiMax: 120,
  /** 已通过后管会话的接口，按来源 IP。 */
  adminIpMax: 240,
  /** 没有单独归类的 /api 路径。按来源 IP。 */
  publicMax: 120,
  /** POST /api/quiz/sessions。交卷、保存答案和成绩列表不走这档。 */
  quizCreateMax: 60,
  /** POST /api/courseware/uploads。进度、取消、勾选不走这档。 */
  coursewareUploadMax: 40,
} as const;

export const RATE_LIMIT_KEY_PREFIX = 'tishuashua:ratelimit:';
export const RATE_LIMIT_MESSAGE = '请求过于频繁，请稍后再试';

export interface RateLimitSettings {
  enabled: boolean;
  windowSeconds: number;
  keyPrefix: string;
  wechatLoginMax: number;
  adminLoginMax: number;
  wechatApiMax: number;
  wechatIpMax: number;
  adminApiMax: number;
  adminIpMax: number;
  publicMax: number;
  quizCreateMax: number;
  coursewareUploadMax: number;
}

export type RateRouteKind =
  'skip' | 'wechat-login' | 'admin-login' | 'wechat-api' | 'admin-api' | 'public';

export type ExpensiveRoute = 'quiz-create' | 'courseware-upload' | null;

export interface RateRoute {
  kind: RateRouteKind;
  expensive: ExpensiveRoute;
}

export interface RateBucket {
  scope: string;
  subject: string;
  limit: number;
}

export interface RateHit {
  current: number;
  ttlSeconds: number;
  limit: number;
}

/** 不填则开启。只有 false 或 0 关闭，大小写不敏感。 */
export function rateLimitEnabled(raw: string): boolean {
  if (!raw) {
    return true;
  }
  return !['false', '0'].includes(raw.toLowerCase());
}

export function parseRateLimitSettings(read: (key: string) => string): RateLimitSettings {
  return {
    enabled: rateLimitEnabled(read('RATE_LIMIT_ENABLED')),
    windowSeconds: readPositiveInt(
      read('RATE_LIMIT_WINDOW_SECONDS'),
      RATE_LIMIT_DEFAULTS.windowSeconds,
      86_400,
    ),
    keyPrefix: parseKeyPrefix(read('RATE_LIMIT_KEY_PREFIX')),
    wechatLoginMax: readPositiveInt(
      read('RATE_LIMIT_WECHAT_LOGIN_MAX'),
      RATE_LIMIT_DEFAULTS.wechatLoginMax,
      1_000_000,
    ),
    adminLoginMax: readPositiveInt(
      read('RATE_LIMIT_ADMIN_LOGIN_MAX'),
      RATE_LIMIT_DEFAULTS.adminLoginMax,
      1_000_000,
    ),
    wechatApiMax: readPositiveInt(
      read('RATE_LIMIT_WECHAT_API_MAX'),
      RATE_LIMIT_DEFAULTS.wechatApiMax,
      1_000_000,
    ),
    wechatIpMax: readPositiveInt(
      read('RATE_LIMIT_WECHAT_IP_MAX'),
      RATE_LIMIT_DEFAULTS.wechatIpMax,
      1_000_000,
    ),
    adminApiMax: readPositiveInt(
      read('RATE_LIMIT_ADMIN_API_MAX'),
      RATE_LIMIT_DEFAULTS.adminApiMax,
      1_000_000,
    ),
    adminIpMax: readPositiveInt(
      read('RATE_LIMIT_ADMIN_IP_MAX'),
      RATE_LIMIT_DEFAULTS.adminIpMax,
      1_000_000,
    ),
    publicMax: readPositiveInt(
      read('RATE_LIMIT_PUBLIC_MAX'),
      RATE_LIMIT_DEFAULTS.publicMax,
      1_000_000,
    ),
    quizCreateMax: readPositiveInt(
      read('RATE_LIMIT_QUIZ_CREATE_MAX'),
      RATE_LIMIT_DEFAULTS.quizCreateMax,
      1_000_000,
    ),
    coursewareUploadMax: readPositiveInt(
      read('RATE_LIMIT_COURSEWARE_UPLOAD_MAX'),
      RATE_LIMIT_DEFAULTS.coursewareUploadMax,
      1_000_000,
    ),
  };
}

/** 第 limit 次放行，第 limit+1 次拒绝。retry 取已超限桶里最长的剩余秒数，至少 1。 */
export function rateLimitExceeded(hits: RateHit[]): { retryAfterSeconds: number } | null {
  let retryAfterSeconds = 0;
  let exceeded = false;
  for (const hit of hits) {
    if (hit.current > hit.limit) {
      exceeded = true;
      retryAfterSeconds = Math.max(retryAfterSeconds, hit.ttlSeconds);
    }
  }
  if (!exceeded) {
    return null;
  }
  return { retryAfterSeconds: Math.max(1, Math.ceil(retryAfterSeconds)) };
}

export function rateLimitKey(
  prefix: string,
  bucket: Pick<RateBucket, 'scope' | 'subject'>,
): string {
  return `${prefix}${bucket.scope}:${bucket.subject}`;
}

export function normalizeApiPath(url: string): string {
  const withoutQuery = url.split('?')[0] ?? '';
  const withSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  const trimmed = withSlash.length > 1 ? withSlash.replace(/\/+$/, '') : withSlash;
  if (trimmed === '/api') {
    return '/';
  }
  if (trimmed.startsWith('/api/')) {
    return trimmed.slice(4);
  }
  return trimmed;
}

export function classifyRoute(url: string, method: string): RateRoute {
  if (method.toUpperCase() === 'OPTIONS') {
    return { kind: 'skip', expensive: null };
  }
  const path = normalizeApiPath(url);
  if (path === '/health' || path.startsWith('/health/')) {
    return { kind: 'skip', expensive: null };
  }
  if (
    path === '/docs' ||
    path.startsWith('/docs/') ||
    path === '/docs-json' ||
    path === '/docs-yaml'
  ) {
    return { kind: 'skip', expensive: null };
  }
  if (path === '/auth/wechat/login') {
    return { kind: 'wechat-login', expensive: null };
  }
  if (path === '/admin/login') {
    return { kind: 'admin-login', expensive: null };
  }
  if (path === '/admin' || path.startsWith('/admin/')) {
    return { kind: 'admin-api', expensive: null };
  }
  if (path === '/certificates' || path.startsWith('/certificates/')) {
    return { kind: 'wechat-api', expensive: null };
  }

  const verb = method.toUpperCase();
  let expensive: ExpensiveRoute = null;
  if (verb === 'POST' && path === '/quiz/sessions') {
    expensive = 'quiz-create';
  } else if (verb === 'POST' && path === '/courseware/uploads') {
    expensive = 'courseware-upload';
  }

  if (
    path.startsWith('/users') ||
    path.startsWith('/catalog') ||
    path.startsWith('/packs') ||
    path.startsWith('/quiz') ||
    path.startsWith('/wrong-book') ||
    path.startsWith('/courseware') ||
    path.startsWith('/auth/') ||
    path.startsWith('/commerce') ||
    path.startsWith('/orders')
  ) {
    return { kind: 'wechat-api', expensive };
  }
  return { kind: 'public', expensive: null };
}

export function normalizeIp(ip: string | undefined): string {
  const value = (ip ?? '').trim().replace(/^::ffff:/i, '');
  if (!value || value.length > 64 || !/^[0-9a-fA-F:.]+$/.test(value)) {
    return 'unknown';
  }
  return value;
}

/**
 * 后管登录按帐号分桶。键里只放哈希，不放用户名。
 * 先去掉首尾空白，再取前 64 个字符，和登录字段上限一致。空字符串不计这一档。
 */
export function accountSubject(username: unknown): string | null {
  if (typeof username !== 'string') {
    return null;
  }
  const trimmed = username.trim().slice(0, 64);
  if (!trimmed) {
    return null;
  }
  const digest = createHash('sha256').update(trimmed).digest('hex').slice(0, 24);
  return `account:${digest}`;
}

export function buildBuckets(input: {
  route: RateRoute;
  ip: string;
  userId?: string;
  adminUsername?: string;
  loginUsername?: unknown;
  limits: RateLimitSettings;
}): RateBucket[] {
  const ipSubject = `ip:${input.ip}`;
  switch (input.route.kind) {
    case 'skip':
      return [];
    case 'wechat-login':
      return [{ scope: 'wechat-login', subject: ipSubject, limit: input.limits.wechatLoginMax }];
    case 'admin-login': {
      const buckets: RateBucket[] = [
        { scope: 'admin-login', subject: ipSubject, limit: input.limits.adminLoginMax },
      ];
      const account = accountSubject(input.loginUsername);
      if (account) {
        buckets.push({ scope: 'admin-login', subject: account, limit: input.limits.adminLoginMax });
      }
      return buckets;
    }
    case 'admin-api': {
      const buckets: RateBucket[] = [
        { scope: 'admin-api', subject: ipSubject, limit: input.limits.adminIpMax },
      ];
      if (input.adminUsername) {
        buckets.push({
          scope: 'admin-api',
          subject: `admin:${input.adminUsername}`,
          limit: input.limits.adminApiMax,
        });
      }
      return buckets;
    }
    case 'public':
      return [{ scope: 'public', subject: ipSubject, limit: input.limits.publicMax }];
    case 'wechat-api': {
      const buckets: RateBucket[] = [
        { scope: 'wechat-api', subject: ipSubject, limit: input.limits.wechatIpMax },
      ];
      if (input.userId) {
        buckets.push({
          scope: 'wechat-api',
          subject: `user:${input.userId}`,
          limit: input.limits.wechatApiMax,
        });
      }
      if (input.route.expensive === 'quiz-create' && input.userId) {
        buckets.push({
          scope: 'quiz-create',
          subject: `user:${input.userId}`,
          limit: input.limits.quizCreateMax,
        });
      }
      if (input.route.expensive === 'courseware-upload' && input.userId) {
        buckets.push({
          scope: 'courseware-upload',
          subject: `user:${input.userId}`,
          limit: input.limits.coursewareUploadMax,
        });
      }
      return buckets;
    }
    default:
      return [];
  }
}

function readPositiveInt(raw: string, fallback: number, max: number): number {
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > max) {
    return fallback;
  }
  return value;
}

function parseKeyPrefix(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || !/^[A-Za-z0-9:_-]{1,80}$/.test(trimmed)) {
    return RATE_LIMIT_KEY_PREFIX;
  }
  return trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
}
