import { ConfigService } from '@nestjs/config';

export interface WorkerEnv {
  port: number;
  redisUrl: string;
  ossBucket: string;
  llmProvider: string;
  llmConfigured: boolean;
}

function read(config: ConfigService, key: string): string {
  return config.get<string>(key)?.trim() ?? '';
}

export function loadWorkerEnv(config: ConfigService): WorkerEnv {
  const rawPort = Number(read(config, 'WORKER_PORT') || read(config, 'PORT') || '3001');
  return {
    port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3001,
    redisUrl: read(config, 'REDIS_URL'),
    ossBucket: read(config, 'OSS_BUCKET'),
    llmProvider: read(config, 'LLM_PROVIDER'),
    llmConfigured: Boolean(read(config, 'LLM_API_KEY')),
  };
}
