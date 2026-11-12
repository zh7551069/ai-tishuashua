import { BUSINESS_TZ, DATA_RETENTION_PURGE_CRON, DATA_RETENTION_PURGE_JOB } from '@tishuashua/shared';
import { runDataRetentionPurge } from '@tishuashua/shared/admin-system';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';
import type { Pool } from 'pg';

export { DATA_RETENTION_PURGE_CRON, DATA_RETENTION_PURGE_JOB };

/**
 * 每日 03:00 Asia/Shanghai 清理到期出题日志和用户上传。
 * 与预览接口共用 retentionCutoff。空跑仍写 system.retention.purge。
 */
export async function registerRetentionPurge(
  connection: ConnectionOptions,
  pool: Pool,
  logger: { log: (message: string) => void },
): Promise<{ close: () => Promise<void> }> {
  const queue = new Queue(DATA_RETENTION_PURGE_JOB, { connection });
  const worker = new Worker(
    DATA_RETENTION_PURGE_JOB,
    async () => {
      const client = await pool.connect();
      try {
        const result = await runDataRetentionPurge({
          query: (sql, params) => client.query(sql, params),
        });
        logger.log(
          `${DATA_RETENTION_PURGE_JOB} logs=${result.quizGenerationLogs.count} uploads=${result.userUploads.count} jobs=${result.extractJobs.count}`,
        );
        return result;
      } finally {
        client.release();
      }
    },
    { connection },
  );
  worker.on('error', (error: Error) => {
    logger.log(`${DATA_RETENTION_PURGE_JOB} error ${error.message}`);
  });
  await queue.add(
    DATA_RETENTION_PURGE_JOB,
    {},
    {
      repeat: { pattern: DATA_RETENTION_PURGE_CRON, tz: BUSINESS_TZ },
      jobId: DATA_RETENTION_PURGE_JOB,
    },
  );
  logger.log(
    `registered ${DATA_RETENTION_PURGE_JOB} cron=${DATA_RETENTION_PURGE_CRON} tz=${BUSINESS_TZ}`,
  );
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
