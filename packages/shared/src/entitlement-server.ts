import { randomUUID } from 'node:crypto';
import {
  BUSINESS_TZ,
  DEFAULT_DAILY_FREE_SESSIONS,
  type EntitlementBalances,
  type EntitlementBucket,
  type EntitlementDb,
  EntitlementFlowError,
  type EntitlementLedgerItem,
  type EntitlementLedgerPage,
  type EntitlementLedgerReason,
  type EntitlementMembership,
  type EntitlementReservation,
  ENTITLEMENT_EXHAUSTED_CTA,
  type EntitlementView,
  type GrantCommand,
  type GrantResult,
  businessDate,
  parseDailyFreeQuota,
  refineAccess,
  reserveIdempotencyKey,
  sessionConsumesEntitlement,
} from './entitlement-types';

export {
  BUSINESS_TZ,
  DEFAULT_DAILY_FREE_SESSIONS,
  ENTITLEMENT_BUCKETS,
  ENTITLEMENT_CTA_TYPES,
  ENTITLEMENT_DAY_RECONCILE_CRON,
  ENTITLEMENT_DAY_RECONCILE_JOB,
  ENTITLEMENT_EXHAUSTED_CTA,
  ENTITLEMENT_LEDGER_REASONS,
  REFINE_LIFETIME_LIMIT_FREE,
  EntitlementFlowError,
  businessDate,
  isEntitlementDevGrantEnabled,
  parseDailyFreeQuota,
  parseGrantCommand,
  parseLedgerQuery,
  refineAccess,
  reserveIdempotencyKey,
  runEntitlementDayReconcile,
  sessionConsumesEntitlement,
} from './entitlement-types';
export type {
  DayReconcileResult,
  EntitlementBalances,
  EntitlementBucket,
  EntitlementCtaType,
  EntitlementDb,
  EntitlementExhaustedDetails,
  EntitlementLedgerItem,
  EntitlementLedgerPage,
  EntitlementLedgerReason,
  EntitlementMembership,
  EntitlementReservation,
  EntitlementView,
  GrantCommand,
  GrantResult,
} from './entitlement-types';

/**
 * 仅 API / Worker。含 node:crypto 和账本 SQL。
 * 不要从 packages/shared 的 barrel（index.ts）再导出本文件。
 */

const USER_LOCK_KEY = 861022;
const DAILY_FREE_SETTING_KEY = 'dailyFreeSessions';

interface AccountRow {
  userId: string;
  businessDate: string;
  dailyFreeRemain: number;
  dailyTaskRemain: number;
  refineLifetimeUsed: number;
}

/**
 * 免费用户才抽题库。会员生效（memberships.ends_at 晚于现在）返回 false。
 * 只读会员态，不扣场，也不改抽题顺序。
 */
export async function isFreeUser(user: { id: string }, db: EntitlementDb): Promise<boolean> {
  return !(await isMemberActive(db, user.id));
}

/** 会员生效只看 ends_at 绝对时间。没有行视为未开通。 */
export async function isMemberActive(
  db: EntitlementDb,
  userId: string,
  now = new Date(),
): Promise<boolean> {
  const result = await db.query(`SELECT ends_at FROM memberships WHERE user_id = $1`, [userId]);
  const ends = (result.rows[0] as { ends_at?: unknown } | undefined)?.ends_at;
  if (!ends) {
    return false;
  }
  const time = ends instanceof Date ? ends.getTime() : new Date(String(ends)).getTime();
  return Number.isFinite(time) && time > now.getTime();
}

/**
 * 出题门禁。wrongSet 直接跳过，不读账户、不写预扣。
 * 调用方必须已经处在事务里。
 */
export async function holdSessionEntitlement(
  db: EntitlementDb,
  userId: string,
  source: string,
  sessionId: string,
  now = new Date(),
): Promise<'skipped' | EntitlementReservation> {
  if (!sessionConsumesEntitlement(source)) {
    return 'skipped';
  }
  return reserveEntitlement(db, userId, { sessionId, qty: 1 }, now);
}

/** 懒日切。调用方必须已经处在事务里。 */
export async function ensureEntitlementDay(
  db: EntitlementDb,
  userId: string,
  now = new Date(),
): Promise<AccountRow> {
  const today = businessDate(now);
  await db.query(`SELECT pg_advisory_xact_lock($1, hashtext($2::text))`, [USER_LOCK_KEY, userId]);
  const quota = await dailyFreeQuota(db);
  let account = await lockAccount(db, userId);
  if (!account) {
    await db.query(
      `
        INSERT INTO entitlement_accounts (
          user_id, business_date, daily_free_remain, daily_task_remain, refine_lifetime_used
        )
        VALUES ($1, $2::date, $3, 0, 0)
      `,
      [userId, today, quota],
    );
    await insertLedger(db, {
      userId,
      delta: quota,
      bucket: 'daily_free',
      reason: 'daily_grant',
      refType: 'day_roll',
      refId: `${userId}:${today}`,
      bizDate: today,
      lotId: null,
    });
    account = await lockAccount(db, userId);
    if (!account) {
      throw new Error('权益账户创建后读不到');
    }
    return account;
  }
  if (account.businessDate >= today) {
    return account;
  }
  if (account.dailyFreeRemain > 0) {
    await insertLedger(db, {
      userId,
      delta: -account.dailyFreeRemain,
      bucket: 'daily_free',
      reason: 'daily_expire',
      refType: 'day_roll',
      refId: `${userId}:${today}:daily_free`,
      bizDate: today,
      lotId: null,
    });
  }
  if (account.dailyTaskRemain > 0) {
    await insertLedger(db, {
      userId,
      delta: -account.dailyTaskRemain,
      bucket: 'daily_task',
      reason: 'daily_expire',
      refType: 'day_roll',
      refId: `${userId}:${today}:daily_task`,
      bizDate: today,
      lotId: null,
    });
  }
  await db.query(
    `
      UPDATE entitlement_accounts
      SET daily_free_remain = $2,
          daily_task_remain = 0,
          business_date = $3::date,
          updated_at = now()
      WHERE user_id = $1
    `,
    [userId, quota, today],
  );
  await insertLedger(db, {
    userId,
    delta: quota,
    bucket: 'daily_free',
    reason: 'daily_grant',
    refType: 'day_roll',
    refId: `${userId}:${today}`,
    bizDate: today,
    lotId: null,
  });
  const rolled = await lockAccount(db, userId);
  if (!rolled) {
    throw new Error('日切后读不到权益账户');
  }
  return rolled;
}

export async function readEntitlement(
  db: EntitlementDb,
  userId: string,
  now = new Date(),
): Promise<EntitlementView> {
  const account = await ensureEntitlementDay(db, userId, now);
  const membership = await readMembership(db, userId, now);
  const inventoryRemain = await sumInventory(db, userId);
  const refine = refineAccess({
    membershipActive: membership.active,
    lifetimeUsed: account.refineLifetimeUsed,
  });
  return {
    businessDate: account.businessDate,
    timezone: BUSINESS_TZ,
    membership,
    balances: {
      dailyFreeRemain: account.dailyFreeRemain,
      dailyTaskRemain: account.dailyTaskRemain,
      inventoryRemain,
    },
    refine: {
      lifetimeUsed: account.refineLifetimeUsed,
      lifetimeLimitFree: refine.lifetimeLimitFree,
      unlimited: refine.unlimited,
    },
  };
}

/**
 * 即时扣余额并记 reserve_hold（delta=-1）。
 * 重复同一会话返回已有预扣，不双扣。
 * 会员仍建预扣行，但不改三桶。
 */
export async function reserveEntitlement(
  db: EntitlementDb,
  userId: string,
  input: { sessionId: string; qty: number },
  now = new Date(),
): Promise<EntitlementReservation> {
  if (input.qty !== 1) {
    throw new EntitlementFlowError('ENTITLEMENT_CONFLICT', '每次只能预扣 1 场');
  }
  const account = await ensureEntitlementDay(db, userId, now);
  const key = reserveIdempotencyKey(input.sessionId);
  const existing = await db.query(
    `
      SELECT
        id, user_id, session_id, idempotency_key, status, bucket_spent, lot_id, qty,
        biz_date::text AS biz_date
      FROM entitlement_reservations
      WHERE session_id = $1 OR idempotency_key = $2
      FOR UPDATE
    `,
    [input.sessionId, key],
  );
  const found = mapReservation(existing.rows[0]);
  if (found) {
    if (found.userId !== userId) {
      throw new EntitlementFlowError('ENTITLEMENT_CONFLICT', '会话权益预扣冲突');
    }
    return found;
  }

  const member = await isMemberActive(db, userId, now);
  const id = randomUUID();
  if (member) {
    await insertReservation(db, {
      id,
      userId,
      sessionId: input.sessionId,
      idempotencyKey: key,
      bucketSpent: null,
      lotId: null,
      bizDate: account.businessDate,
    });
    const created = mapReservation(
      (
        await db.query(
          `
            SELECT
              id, user_id, session_id, idempotency_key, status, bucket_spent, lot_id, qty,
              biz_date::text AS biz_date
            FROM entitlement_reservations
            WHERE id = $1
          `,
          [id],
        )
      ).rows[0],
    );
    if (!created) {
      throw new Error('会员预扣写入后读不到');
    }
    return created;
  }

  const spent = await spendOne(db, userId);
  if (!spent) {
    const balances = await readBalances(db, userId);
    throw new EntitlementFlowError('ENTITLEMENT_EXHAUSTED', '今日免费场次已用完', {
      reason: 'exhausted',
      businessDate: account.businessDate,
      membershipActive: false,
      balances,
      cta: ENTITLEMENT_EXHAUSTED_CTA.map((item) => ({ type: item.type, label: item.label })),
    });
  }

  await insertReservation(db, {
    id,
    userId,
    sessionId: input.sessionId,
    idempotencyKey: key,
    bucketSpent: spent.bucket,
    lotId: spent.lotId,
    bizDate: account.businessDate,
  });
  await insertLedger(db, {
    userId,
    delta: -1,
    bucket: spent.bucket,
    reason: 'reserve_hold',
    refType: 'reservation',
    refId: id,
    bizDate: account.businessDate,
    lotId: spent.lotId,
  });
  const created = mapReservation(
    (
      await db.query(
        `
          SELECT
            id, user_id, session_id, idempotency_key, status, bucket_spent, lot_id, qty,
            biz_date::text AS biz_date
          FROM entitlement_reservations
          WHERE id = $1
        `,
        [id],
      )
    ).rows[0],
  );
  if (!created) {
    throw new Error('预扣写入后读不到');
  }
  return created;
}

/**
 * 成卷确认。余额已在预扣时减过，这里只追加 deduct。
 * delta 为 0，避免和 reserve_hold 双计。会员场同样写 0，桶为 membership。
 */
export async function commitEntitlement(
  db: EntitlementDb,
  sessionId: string,
  now = new Date(),
): Promise<void> {
  const row = await lockReservation(db, sessionId);
  if (!row || row.status !== 'held') {
    return;
  }
  const bucket: EntitlementBucket = row.bucketSpent ?? 'membership';
  await insertLedger(db, {
    userId: row.userId,
    delta: 0,
    bucket,
    reason: 'deduct',
    refType: 'session',
    refId: sessionId,
    bizDate: row.bizDate || businessDate(now),
    lotId: row.lotId,
  });
  await db.query(
    `
      UPDATE entitlement_reservations
      SET status = 'committed', updated_at = now()
      WHERE id = $1
    `,
    [row.id],
  );
}

/** 取消或失败退回。已确认或已退回的再次调用不改余额。 */
export async function releaseEntitlement(db: EntitlementDb, sessionId: string): Promise<void> {
  const row = await lockReservation(db, sessionId);
  if (!row || row.status !== 'held') {
    return;
  }
  if (row.bucketSpent === 'daily_free' || row.bucketSpent === 'daily_task') {
    const account = await lockAccount(db, row.userId);
    const sameDay = account?.businessDate === row.bizDate;
    if (sameDay) {
      const column = row.bucketSpent === 'daily_free' ? 'daily_free_remain' : 'daily_task_remain';
      await db.query(
        `
          UPDATE entitlement_accounts
          SET ${column} = ${column} + $2, updated_at = now()
          WHERE user_id = $1
        `,
        [row.userId, row.qty],
      );
    }
    await insertLedger(db, {
      userId: row.userId,
      delta: sameDay ? row.qty : 0,
      bucket: row.bucketSpent,
      reason: 'release_restore',
      refType: 'reservation',
      refId: row.id,
      bizDate: row.bizDate,
      lotId: null,
    });
  } else if (row.bucketSpent === 'inventory' && row.lotId) {
    await db.query(
      `UPDATE entitlement_lots SET remain = remain + 1 WHERE id = $1 AND remain < qty`,
      [row.lotId],
    );
    await insertLedger(db, {
      userId: row.userId,
      delta: row.qty,
      bucket: 'inventory',
      reason: 'release_restore',
      refType: 'reservation',
      refId: row.id,
      bizDate: row.bizDate,
      lotId: row.lotId,
    });
  }
  await db.query(
    `
      UPDATE entitlement_reservations
      SET status = 'released', updated_at = now()
      WHERE id = $1
    `,
    [row.id],
  );
}

/** 同 refId + 类型只入账一次。支付回调不得调用。 */
export async function grantEntitlement(
  db: EntitlementDb,
  userId: string,
  command: GrantCommand,
  now = new Date(),
): Promise<GrantResult> {
  await ensureEntitlementDay(db, userId, now);
  const spec = grantSpec(command);
  const existing = await db.query(
    `
      SELECT lot_id
      FROM entitlement_ledger
      WHERE ref_type = 'grant' AND ref_id = $1 AND reason = $2 AND bucket = $3
    `,
    [command.refId, spec.reason, spec.bucket],
  );
  const prior = existing.rows[0] as { lot_id: string | null } | undefined;
  if (prior) {
    return { applied: false, lotId: prior.lot_id };
  }

  const today = businessDate(now);
  await db.query('SAVEPOINT entitlement_grant');
  try {
    const lotId = await applyGrant(db, userId, command, today);
    await db.query('RELEASE SAVEPOINT entitlement_grant');
    return { applied: true, lotId };
  } catch (error) {
    await db.query('ROLLBACK TO SAVEPOINT entitlement_grant');
    if (isUniqueViolation(error)) {
      return { applied: false, lotId: null };
    }
    throw error;
  }
}

export async function readEntitlementLedger(
  db: EntitlementDb,
  userId: string,
  query: { limit: number; cursor: { createdAt: string; id: string } | null },
): Promise<EntitlementLedgerPage> {
  const result = await db.query(
    `
      SELECT
        id, delta, bucket, reason, ref_type, ref_id, biz_date::text AS biz_date, created_at
      FROM entitlement_ledger
      WHERE user_id = $1
        AND (
          $2::timestamptz IS NULL
          OR (created_at, id) < ($2::timestamptz, $3::uuid)
        )
      ORDER BY created_at DESC, id DESC
      LIMIT $4
    `,
    [userId, query.cursor?.createdAt ?? null, query.cursor?.id ?? null, query.limit + 1],
  );
  const rows = result.rows.map(mapLedgerItem);
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor:
      rows.length > query.limit && last ? encodeLedgerCursor(last.createdAt, last.id) : null,
  };
}

async function applyGrant(
  db: EntitlementDb,
  userId: string,
  command: GrantCommand,
  today: string,
): Promise<string | null> {
  if (command.type === 'daily_task') {
    await db.query(
      `
        UPDATE entitlement_accounts
        SET daily_task_remain = daily_task_remain + $2, updated_at = now()
        WHERE user_id = $1
      `,
      [userId, command.qty],
    );
    await insertLedger(db, {
      userId,
      delta: command.qty,
      bucket: 'daily_task',
      reason: 'task_grant',
      refType: 'grant',
      refId: command.refId,
      bizDate: today,
      lotId: null,
    });
    return null;
  }
  if (command.type === 'inventory') {
    const lotId = randomUUID();
    await db.query(
      `
        INSERT INTO entitlement_lots (id, user_id, bucket, qty, remain, source, expires_at)
        VALUES ($1, $2, 'inventory', $3, $3, $4, $5)
      `,
      [lotId, userId, command.qty, command.source, command.expiresAt ?? null],
    );
    await insertLedger(db, {
      userId,
      delta: command.qty,
      bucket: 'inventory',
      reason: 'inventory_grant',
      refType: 'grant',
      refId: command.refId,
      bizDate: today,
      lotId,
    });
    return lotId;
  }
  await db.query(
    `
      INSERT INTO memberships (user_id, status, starts_at, ends_at, sku_code, updated_at)
      VALUES ($1, CASE WHEN $2::timestamptz > now() THEN 'active' ELSE 'expired' END, now(), $2, $3, now())
      ON CONFLICT (user_id) DO UPDATE
      SET ends_at = GREATEST(memberships.ends_at, EXCLUDED.ends_at),
          starts_at = COALESCE(memberships.starts_at, now()),
          sku_code = COALESCE(EXCLUDED.sku_code, memberships.sku_code),
          status = CASE
            WHEN GREATEST(memberships.ends_at, EXCLUDED.ends_at) > now() THEN 'active'
            ELSE 'expired'
          END,
          updated_at = now()
    `,
    [userId, command.endsAt, command.skuCode ?? null],
  );
  await insertLedger(db, {
    userId,
    delta: 0,
    bucket: 'membership',
    reason: 'membership_grant',
    refType: 'grant',
    refId: command.refId,
    bizDate: today,
    lotId: null,
  });
  return null;
}

async function spendOne(
  db: EntitlementDb,
  userId: string,
): Promise<{ bucket: 'daily_free' | 'daily_task' | 'inventory'; lotId: string | null } | null> {
  const dailyFree = await db.query(
    `
      UPDATE entitlement_accounts
      SET daily_free_remain = daily_free_remain - 1, updated_at = now()
      WHERE user_id = $1 AND daily_free_remain >= 1
    `,
    [userId],
  );
  if ((dailyFree.rowCount ?? 0) > 0) {
    return { bucket: 'daily_free', lotId: null };
  }
  const dailyTask = await db.query(
    `
      UPDATE entitlement_accounts
      SET daily_task_remain = daily_task_remain - 1, updated_at = now()
      WHERE user_id = $1 AND daily_task_remain >= 1
    `,
    [userId],
  );
  if ((dailyTask.rowCount ?? 0) > 0) {
    return { bucket: 'daily_task', lotId: null };
  }
  const picked = await db.query(
    `
      SELECT id
      FROM entitlement_lots
      WHERE user_id = $1
        AND bucket = 'inventory'
        AND remain > 0
        AND (expires_at IS NULL OR expires_at > now())
      ORDER BY expires_at ASC NULLS LAST, created_at ASC, id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [userId],
  );
  const lotId = (picked.rows[0] as { id: string } | undefined)?.id;
  if (!lotId) {
    return null;
  }
  await db.query(`UPDATE entitlement_lots SET remain = remain - 1 WHERE id = $1 AND remain > 0`, [
    lotId,
  ]);
  return { bucket: 'inventory', lotId };
}

async function dailyFreeQuota(db: EntitlementDb): Promise<number> {
  const result = await db.query(`SELECT value FROM system_settings WHERE key = $1`, [
    DAILY_FREE_SETTING_KEY,
  ]);
  const value = (result.rows[0] as { value?: unknown } | undefined)?.value;
  return parseDailyFreeQuota(value) ?? DEFAULT_DAILY_FREE_SESSIONS;
}

async function lockAccount(db: EntitlementDb, userId: string): Promise<AccountRow | null> {
  const result = await db.query(
    `
      SELECT
        user_id,
        business_date::text AS business_date,
        daily_free_remain,
        daily_task_remain,
        refine_lifetime_used
      FROM entitlement_accounts
      WHERE user_id = $1
      FOR UPDATE
    `,
    [userId],
  );
  return mapAccount(result.rows[0]);
}

async function readBalances(db: EntitlementDb, userId: string): Promise<EntitlementBalances> {
  const account = await lockAccount(db, userId);
  return {
    dailyFreeRemain: account?.dailyFreeRemain ?? 0,
    dailyTaskRemain: account?.dailyTaskRemain ?? 0,
    inventoryRemain: await sumInventory(db, userId),
  };
}

async function sumInventory(db: EntitlementDb, userId: string): Promise<number> {
  const result = await db.query(
    `
      SELECT COALESCE(SUM(remain), 0)::int AS remain
      FROM entitlement_lots
      WHERE user_id = $1
        AND bucket = 'inventory'
        AND remain > 0
        AND (expires_at IS NULL OR expires_at > now())
    `,
    [userId],
  );
  return Number((result.rows[0] as { remain?: number } | undefined)?.remain ?? 0);
}

async function readMembership(
  db: EntitlementDb,
  userId: string,
  now: Date,
): Promise<EntitlementMembership> {
  const result = await db.query(
    `
      SELECT starts_at, ends_at, sku_code
      FROM memberships
      WHERE user_id = $1
    `,
    [userId],
  );
  const row = result.rows[0] as
    { starts_at?: unknown; ends_at?: unknown; sku_code?: string | null } | undefined;
  if (!row) {
    return { active: false, startsAt: null, endsAt: null, skuCode: null };
  }
  return {
    active: await isMemberActive(db, userId, now),
    startsAt: toIso(row.starts_at),
    endsAt: toIso(row.ends_at),
    skuCode: row.sku_code ?? null,
  };
}

async function lockReservation(
  db: EntitlementDb,
  sessionId: string,
): Promise<EntitlementReservation | null> {
  const result = await db.query(
    `
      SELECT
        id, user_id, session_id, idempotency_key, status, bucket_spent, lot_id, qty,
        biz_date::text AS biz_date
      FROM entitlement_reservations
      WHERE session_id = $1
      FOR UPDATE
    `,
    [sessionId],
  );
  return mapReservation(result.rows[0]);
}

async function insertReservation(
  db: EntitlementDb,
  input: {
    id: string;
    userId: string;
    sessionId: string;
    idempotencyKey: string;
    bucketSpent: 'daily_free' | 'daily_task' | 'inventory' | null;
    lotId: string | null;
    bizDate: string;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO entitlement_reservations (
        id, user_id, session_id, idempotency_key, status, bucket_spent, lot_id, qty, biz_date
      )
      VALUES ($1, $2, $3, $4, 'held', $5, $6, 1, $7::date)
    `,
    [
      input.id,
      input.userId,
      input.sessionId,
      input.idempotencyKey,
      input.bucketSpent,
      input.lotId,
      input.bizDate,
    ],
  );
}

async function insertLedger(
  db: EntitlementDb,
  input: {
    userId: string;
    delta: number;
    bucket: EntitlementBucket;
    reason: EntitlementLedgerReason;
    refType: string;
    refId: string;
    bizDate: string;
    lotId: string | null;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO entitlement_ledger (
        id, user_id, delta, bucket, reason, ref_type, ref_id, biz_date, lot_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9)
    `,
    [
      randomUUID(),
      input.userId,
      input.delta,
      input.bucket,
      input.reason,
      input.refType,
      input.refId,
      input.bizDate,
      input.lotId,
    ],
  );
}

function grantSpec(command: GrantCommand): {
  reason: EntitlementLedgerReason;
  bucket: EntitlementBucket;
} {
  if (command.type === 'daily_task') {
    return { reason: 'task_grant', bucket: 'daily_task' };
  }
  if (command.type === 'inventory') {
    return { reason: 'inventory_grant', bucket: 'inventory' };
  }
  return { reason: 'membership_grant', bucket: 'membership' };
}

function mapAccount(value: unknown): AccountRow | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (typeof row.user_id !== 'string' || typeof row.business_date !== 'string') {
    return null;
  }
  return {
    userId: row.user_id,
    businessDate: row.business_date.slice(0, 10),
    dailyFreeRemain: Number(row.daily_free_remain ?? 0),
    dailyTaskRemain: Number(row.daily_task_remain ?? 0),
    refineLifetimeUsed: Number(row.refine_lifetime_used ?? 0),
  };
}

function mapReservation(value: unknown): EntitlementReservation | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const row = value as Record<string, unknown>;
  if (
    typeof row.id !== 'string' ||
    typeof row.user_id !== 'string' ||
    typeof row.session_id !== 'string' ||
    typeof row.idempotency_key !== 'string' ||
    typeof row.biz_date !== 'string' ||
    (row.status !== 'held' && row.status !== 'committed' && row.status !== 'released')
  ) {
    return null;
  }
  const bucket =
    row.bucket_spent === 'daily_free' ||
    row.bucket_spent === 'daily_task' ||
    row.bucket_spent === 'inventory'
      ? row.bucket_spent
      : null;
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    idempotencyKey: row.idempotency_key,
    status: row.status,
    bucketSpent: bucket,
    lotId: typeof row.lot_id === 'string' ? row.lot_id : null,
    qty: 1,
    bizDate: row.biz_date.slice(0, 10),
  };
}

function mapLedgerItem(value: unknown): EntitlementLedgerItem {
  const row = value as Record<string, unknown>;
  const createdAt = toIso(row.created_at) ?? new Date(0).toISOString();
  return {
    id: String(row.id),
    delta: Number(row.delta ?? 0),
    bucket: row.bucket as EntitlementBucket,
    reason: row.reason as EntitlementLedgerReason,
    refType: String(row.ref_type),
    refId: String(row.ref_id),
    bizDate: String(row.biz_date).slice(0, 10),
    createdAt,
  };
}

function encodeLedgerCursor(createdAt: string, id: string): string {
  return Buffer.from(`${createdAt}|${id}`, 'utf8').toString('base64url');
}

function toIso(value: unknown): string | null {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  const time = new Date(String(value));
  if (Number.isNaN(time.getTime())) {
    return null;
  }
  return time.toISOString();
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}
