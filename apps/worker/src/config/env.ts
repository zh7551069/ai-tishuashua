import { ConfigService } from '@nestjs/config';

export interface WorkerEnv {
  port: number;
  redisUrl: string;
  databaseUrl: string;
  ossMode: 's3' | 'local';
  llmProvider: string;
  llmConfigured: boolean;
  llmMock: boolean;
}

function read(config: ConfigService, key: string): string {
  return config.get<string>(key)?.trim() ?? '';
}

export function loadWorkerEnv(config: ConfigService): WorkerEnv {
  const rawPort = Number(read(config, 'WORKER_PORT') || read(config, 'PORT') || '3001');
  return {
    port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3001,
    redisUrl: read(config, 'REDIS_URL'),
    databaseUrl: read(config, 'DATABASE_URL'),
    ossMode:
      read(config, 'OSS_ENDPOINT') &&
      read(config, 'OSS_BUCKET') &&
      read(config, 'OSS_ACCESS_KEY_ID') &&
      read(config, 'OSS_ACCESS_KEY_SECRET')
        ? 's3'
        : 'local',
    llmProvider: read(config, 'LLM_PROVIDER'),
    llmConfigured: Boolean(read(config, 'LLM_API_KEY')),
    llmMock: ['true', '1'].includes(read(config, 'LLM_MOCK').toLowerCase()),
  };
}
