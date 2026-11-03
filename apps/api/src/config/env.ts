import { ConfigService } from '@nestjs/config';
import { parseRateLimitSettings, type RateLimitSettings } from '../rate-limit/rate-limit.policy';

export interface ApiEnv {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  wechatAppId: string;
  wechatAppSecret: string;
  /** 仅当值为 true 或 1 时启用。默认关闭，不请求微信。 */
  wechatLoginMock: boolean;
  adminOrigins: string[];
  /** 后管唯一操作者。两项都非空才算已配置，代码里没有默认口令。 */
  adminUsername: string;
  adminPassword: string;
  ossEndpoint: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl: string;
  /** 仅当值为 true 或 1 时启用。默认关闭，不请求模型。 */
  llmMock: boolean;
  /** 仅当值为 true 或 1 时信任反向代理传来的客户端 IP。默认关闭。 */
  trustProxy: boolean;
  rateLimit: RateLimitSettings;
}

function read(config: ConfigService, key: string): string {
  return config.get<string>(key)?.trim() ?? '';
}

export function loadApiEnv(config: ConfigService): ApiEnv {
  const rawPort = Number(read(config, 'PORT') || '3000');
  const origins = read(config, 'ADMIN_ORIGIN');

  return {
    port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000,
    databaseUrl: read(config, 'DATABASE_URL'),
    redisUrl: read(config, 'REDIS_URL'),
    wechatAppId: read(config, 'WECHAT_APP_ID'),
    wechatAppSecret: read(config, 'WECHAT_APP_SECRET'),
    wechatLoginMock: ['true', '1'].includes(read(config, 'WECHAT_LOGIN_MOCK').toLowerCase()),
    adminOrigins: origins
      ? origins
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean)
      : ['http://127.0.0.1:5173', 'http://localhost:5173'],
    adminUsername: read(config, 'ADMIN_USERNAME'),
    adminPassword: read(config, 'ADMIN_PASSWORD'),
    ossEndpoint: read(config, 'OSS_ENDPOINT'),
    ossBucket: read(config, 'OSS_BUCKET'),
    ossAccessKeyId: read(config, 'OSS_ACCESS_KEY_ID'),
    ossAccessKeySecret: read(config, 'OSS_ACCESS_KEY_SECRET'),
    llmProvider: read(config, 'LLM_PROVIDER'),
    llmApiKey: read(config, 'LLM_API_KEY'),
    llmBaseUrl: read(config, 'LLM_BASE_URL'),
    llmMock: ['true', '1'].includes(read(config, 'LLM_MOCK').toLowerCase()),
    trustProxy: ['true', '1'].includes(read(config, 'TRUST_PROXY').toLowerCase()),
    rateLimit: parseRateLimitSettings((key) => read(config, key)),
  };
}

/** 只报告是否已配置，避免把密钥打进日志。 */
export function describeConfiguredServices(env: ApiEnv): string {
  const wechat = env.wechatLoginMock
    ? 'mock'
    : env.wechatAppId && env.wechatAppSecret
      ? 'configured'
      : 'missing';
  const oss =
    env.ossEndpoint && env.ossBucket && env.ossAccessKeyId && env.ossAccessKeySecret
      ? 's3'
      : 'local';
  const llm = env.llmMock ? 'mock' : env.llmApiKey ? 'configured' : 'missing';
  const admin = env.adminUsername && env.adminPassword ? 'configured' : 'missing';
  const rateLimit = env.rateLimit.enabled ? 'on' : 'off';
  return `wechat=${wechat} oss=${oss} llm=${llm} admin=${admin} rateLimit=${rateLimit}`;
}
