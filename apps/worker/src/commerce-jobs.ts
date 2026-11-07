import {
  BUSINESS_TZ,
  ENTITLEMENT_DAY_RECONCILE_CRON,
  ENTITLEMENT_DAY_RECONCILE_JOB,
  runEntitlementDayReconcile,
  type DayReconcileResult,
} from '@tishuashua/shared';
import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export {
  ENTITLEMENT_DAY_RECONCILE_CRON,
  ENTITLEMENT_DAY_RECONCILE_JOB,
  runEntitlementDayReconcile,
};
export type { DayReconcileResult };

/**
 * 注册 entitlement.day-reconcile。
 * 约 00:05 Asia/Shanghai 触发，处理函数只打指标，不改余额，也不做支付对账。
 */
export async function registerEntitlementDayReconcile(
  connection: ConnectionOptions,
  logger: { log: (message: string) => void },
): Promise<{ close: () => Promise<void> }> {
  const queue = new Queue(ENTITLEMENT_DAY_RECONCILE_JOB, { connection });
  const worker = new Worker(
    ENTITLEMENT_DAY_RECONCILE_JOB,
    async () => {
      const result = runEntitlementDayReconcile();
      logger.log(
        `${result.job} job ran scanned=${result.scanned} ok=${result.ok} businessDate=${result.businessDate}`,
      );
      return result;
    },
    { connection },
  );
  worker.on('error', (error: Error) => {
    logger.log(`${ENTITLEMENT_DAY_RECONCILE_JOB} error ${error.message}`);
  });
  await queue.add(
    ENTITLEMENT_DAY_RECONCILE_JOB,
    {},
    {
      repeat: { pattern: ENTITLEMENT_DAY_RECONCILE_CRON, tz: BUSINESS_TZ },
      jobId: ENTITLEMENT_DAY_RECONCILE_JOB,
    },
  );
  logger.log(
    `registered ${ENTITLEMENT_DAY_RECONCILE_JOB} cron=${ENTITLEMENT_DAY_RECONCILE_CRON} tz=${BUSINESS_TZ}`,
  );
  return {
    close: async () => {
      await worker.close();
      await queue.close();
    },
  };
}
