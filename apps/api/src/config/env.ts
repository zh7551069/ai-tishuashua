import { ConfigService } from '@nestjs/config';

export interface ApiEnv {
  port: number;
  databaseUrl: string;
  redisUrl: string;
  wechatAppId: string;
  wechatAppSecret: string;
  /** 仅当值为 true 或 1 时启用。默认关闭，不请求微信。 */
  wechatLoginMock: boolean;
  adminOrigins: string[];
  ossEndpoint: string;
  ossBucket: string;
  ossAccessKeyId: string;
  ossAccessKeySecret: string;
  llmProvider: string;
  llmApiKey: string;
  llmBaseUrl: string;
  /** 仅当值为 true 或 1 时启用。默认关闭，不请求模型。 */
  llmMock: boolean;
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
    ossEndpoint: read(config, 'OSS_ENDPOINT'),
    ossBucket: read(config, 'OSS_BUCKET'),
    ossAccessKeyId: read(config, 'OSS_ACCESS_KEY_ID'),
    ossAccessKeySecret: read(config, 'OSS_ACCESS_KEY_SECRET'),
    llmProvider: read(config, 'LLM_PROVIDER'),
    llmApiKey: read(config, 'LLM_API_KEY'),
    llmBaseUrl: read(config, 'LLM_BASE_URL'),
    llmMock: ['true', '1'].includes(read(config, 'LLM_MOCK').toLowerCase()),
  };
}

/** 只报告是否已配置，避免把密钥打进日志。 */
export function describeConfiguredServices(env: ApiEnv): string {
  const wechat = env.wechatLoginMock
    ? 'mock'
    : env.wechatAppId && env.wechatAppSecret
      ? 'configured'
      : 'missing';
  const oss = env.ossBucket && env.ossAccessKeyId ? 'configured' : 'missing';
  const llm = env.llmMock ? 'mock' : env.llmApiKey ? 'configured' : 'missing';
  return `wechat=${wechat} oss=${oss} llm=${llm}`;
}
