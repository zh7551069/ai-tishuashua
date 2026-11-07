import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BUSINESS_TZ, COMMERCE_AUDIT_ACTIONS } from '@tishuashua/shared';
import { readDailyFreeSessions } from '@tishuashua/shared/commerce';
import {
  EntitlementAdminError,
  grantEntitlement,
  readEntitlement,
  revokeInventoryLot,
  type EntitlementDb,
} from '@tishuashua/shared/entitlement';
import { insertAudit } from '../admin-commerce/commerce.repository';
import { DatabaseService } from '../db/database.service';
import {
  entitlementSourceLabel,
  isUuid,
  likeContains,
  maskOpenId,
  parseAdminGrant,
  parseAdminRevoke,
  parseAuditQuery,
  parseLookupQuery,
  type AdminGrantInput,
} from './entitlement-ops.parse';

export class EntitlementOpsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementOpsValidationError';
  }
}

export class EntitlementOpsNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementOpsNotFoundError';
  }
}

export interface OpsUser {
  userId: string;
  nick: string | null;
  phoneMasked: string | null;
  openIdMasked: string;
  status: string;
}

export interface OpsBalances {
  dailyFreeRemain: number;
  dailyFreeQuota: number;
  dailyTaskRemain: number;
  inventoryRemain: number;
  pendingQty: number;
}

export interface OpsEntry {
  kind: 'pending' | 'lot' | 'daily_task';
  id: string;
  sourceLabel: string;
  bucket: 'inventory' | 'daily_task' | null;
  qty: number;
  remain: number;
  status: string;
  riskText: string | null;
  expiresAt: string | null;
  expiresLabel?: string;
  actions: Array<'grant' | 'void'>;
}

export interface OpsMembership {
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  skuCode: string | null;
  skuName: string | null;
}

export interface OpsDetail {
  user: OpsUser;
  membership: OpsMembership;
  businessDate: string;
  timezone: typeof BUSINESS_TZ;
  balances: OpsBalances;
  entries: OpsEntry[];
}

export interface GrantOpsResult {
  applied: boolean;
  lotId: string | null;
  balances: OpsBalances;
  entry: OpsEntry | null;
}

export interface RevokeOpsResult {
  revoked: Array<
    | { kind: 'lot'; id: string; beforeRemain: number; afterRemain: 0 }
    | { kind: 'pending'; id: string; qty: number; status: 'voided' }
  >;
  balances: OpsBalances;
}

export interface AuditItem {
  id: number;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface PendingRow {
  id: string;
  userId: string;
  qty: number;
  source: string;
  status: string;
  grantLotId: string | null;
  riskText: string;
}

@Injectable()
export class EntitlementOpsService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  lookup(qRaw: unknown, limitRaw: unknown): Promise<{ items: OpsUser[] }> {
    const parsed = parseLookupQuery(qRaw, limitRaw);
    if (!parsed.ok) {
      throw new EntitlementOpsValidationError(parsed.message);
    }
    return this.transaction(async (db) => {
      const pattern = likeContains(parsed.value.q);
      const result = await db.query(
        `
          SELECT id, nick, phone_masked, wx_open_id, status
          FROM users
          WHERE ($1::uuid IS NOT NULL AND id = $1::uuid)
             OR wx_open_id = $2
             OR phone_masked ILIKE $3 ESCAPE '\\'
             OR nick ILIKE $3 ESCAPE '\\'
          ORDER BY created_at DESC, id ASC
          LIMIT $4
        `,
        [parsed.value.userId, parsed.value.q, pattern, parsed.value.limit],
      );
      return { items: result.rows.map(mapUser) };
    });
  }

  detail(userId: string): Promise<OpsDetail> {
    return this.transaction((db) => this.requireDetail(db, userId));
  }

  grant(userId: string, body: unknown, actor: string): Promise<GrantOpsResult> {
    const parsed = parseAdminGrant(body);
    if (!parsed.ok) {
      throw new EntitlementOpsValidationError(parsed.message);
    }
    return this.transaction(async (db) => {
      await this.requireUser(db, userId);
      const pending = await this.lockedPendingForGrant(db, userId, parsed.value);
      if (pending?.status === 'granted') {
        const detail = await this.requireDetail(db, userId);
        return {
          applied: false,
          lotId: pending.grantLotId,
          balances: detail.balances,
          entry: findEntry(detail.entries, pending.grantLotId),
        };
      }
      const refId = parsed.value.idempotencyKey ?? defaultRefId(actor);
      const source = (pending?.source ?? 'admin_grant').trim();
      if (!source || source.length > 64) {
        throw new EntitlementOpsValidationError('库存来源不正确');
      }
      const granted = await grantEntitlement(db, userId, {
        type: 'inventory',
        qty: parsed.value.qty,
        source,
        refId,
        ...(parsed.value.expiresAt ? { expiresAt: parsed.value.expiresAt } : {}),
      });
      let lotId = granted.lotId;
      if (!lotId) {
        lotId = await findGrantLotId(db, refId);
      }
      if (lotId) {
        await assertLotOwner(db, lotId, userId);
      }
      if (pending) {
        if (!lotId) {
          throw new EntitlementAdminError('conflict', '补发没有产生库存批次');
        }
        const updated = await db.query(
          `
            UPDATE entitlement_pending_grants
            SET status = 'granted', grant_lot_id = $2, resolved_by = $3, resolved_at = now()
            WHERE id = $1 AND user_id = $4 AND status = 'pending'
          `,
          [pending.id, lotId, actor, userId],
        );
        if ((updated.rowCount ?? 0) < 1) {
          throw new EntitlementAdminError('conflict', '待发放已处理');
        }
      }
      if (granted.applied) {
        await insertAudit(db, {
          actor,
          action: COMMERCE_AUDIT_ACTIONS.entitlementGrant,
          target: `user:${userId}`,
          before: null,
          after: {
            qty: parsed.value.qty,
            bucket: 'inventory',
            lotId,
            reason: parsed.value.reason,
            ...(pending ? { pendingId: pending.id } : {}),
          },
        });
      }
      const detail = await this.requireDetail(db, userId);
      this.log(actor, userId, COMMERCE_AUDIT_ACTIONS.entitlementGrant, {
        lotId,
        pendingId: pending?.id ?? null,
        qty: parsed.value.qty,
        applied: granted.applied,
      });
      return {
        applied: granted.applied,
        lotId,
        balances: detail.balances,
        entry: findEntry(detail.entries, lotId),
      };
    });
  }

  revoke(userId: string, body: unknown, actor: string): Promise<RevokeOpsResult> {
    const parsed = parseAdminRevoke(body);
    if (!parsed.ok) {
      throw new EntitlementOpsValidationError(parsed.message);
    }
    return this.transaction(async (db) => {
      await this.requireUser(db, userId);
      const revoked: RevokeOpsResult['revoked'] = [];
      for (const target of parsed.value.targets) {
        if (target.kind === 'lot') {
          const result = await revokeInventoryLot(db, userId, target.id);
          await insertAudit(db, {
            actor,
            action: COMMERCE_AUDIT_ACTIONS.entitlementRevokeLot,
            target: `lot:${target.id}`,
            before: { userId, remain: result.beforeRemain },
            after: {
              userId,
              beforeRemain: result.beforeRemain,
              afterRemain: 0,
              reason: parsed.value.reason,
            },
          });
          revoked.push({
            kind: 'lot',
            id: target.id,
            beforeRemain: result.beforeRemain,
            afterRemain: 0,
          });
        } else {
          const pending = await lockPending(db, target.id);
          if (!pending || pending.userId !== userId) {
            throw new EntitlementOpsNotFoundError('待发放不存在');
          }
          if (pending.status !== 'pending') {
            throw new EntitlementAdminError('conflict', '待发放已处理');
          }
          const updated = await db.query(
            `
              UPDATE entitlement_pending_grants
              SET status = 'voided', resolved_by = $2, resolved_at = now()
              WHERE id = $1 AND user_id = $3 AND status = 'pending'
            `,
            [pending.id, actor, userId],
          );
          if ((updated.rowCount ?? 0) < 1) {
            throw new EntitlementAdminError('conflict', '待发放已处理');
          }
          await insertAudit(db, {
            actor,
            action: COMMERCE_AUDIT_ACTIONS.entitlementVoidPending,
            target: `pending:${pending.id}`,
            before: { userId, qty: pending.qty, status: 'pending' },
            after: { userId, qty: pending.qty, reason: parsed.value.reason },
          });
          revoked.push({ kind: 'pending', id: pending.id, qty: pending.qty, status: 'voided' });
        }
      }
      const detail = await this.requireDetail(db, userId);
      for (const item of revoked) {
        this.log(actor, userId, item.kind === 'lot' ? COMMERCE_AUDIT_ACTIONS.entitlementRevokeLot : COMMERCE_AUDIT_ACTIONS.entitlementVoidPending, {
          lotId: item.kind === 'lot' ? item.id : null,
          pendingId: item.kind === 'pending' ? item.id : null,
          qty: item.kind === 'lot' ? item.beforeRemain : item.qty,
        });
      }
      return { revoked, balances: detail.balances };
    });
  }

  listAudit(query: {
    page?: unknown;
    pageSize?: unknown;
    actor?: unknown;
    actionPrefix?: unknown;
    userId?: unknown;
    from?: unknown;
    to?: unknown;
  }): Promise<{ items: AuditItem[]; page: number; pageSize: number; total: number }> {
    const parsed = parseAuditQuery(query);
    if (!parsed.ok) {
      throw new EntitlementOpsValidationError(parsed.message);
    }
    const value = parsed.value;
    return this.transaction(async (db) => {
      const params = [
        likePrefix(value.actionPrefix),
        value.actor,
        value.userId,
        value.userId ? likeContains(`user:${value.userId}`) : null,
        value.from,
        value.to,
      ];
      const where = `
        WHERE action LIKE $1 ESCAPE '\\'
          AND ($2::text IS NULL OR actor = $2)
          AND (
            $3::text IS NULL
            OR target LIKE $4 ESCAPE '\\'
            OR after->>'userId' = $3
          )
          AND ($5::timestamptz IS NULL OR created_at >= $5::timestamptz)
          AND ($6::timestamptz IS NULL OR created_at <= $6::timestamptz)
      `;
      const total = await db.query(
        `SELECT COUNT(*)::int AS total FROM admin_audit_logs ${where}`,
        params,
      );
      const rows = await db.query(
        `
          SELECT id, actor, action, target, before, after, created_at
          FROM admin_audit_logs
          ${where}
          ORDER BY created_at DESC, id DESC
          LIMIT $7 OFFSET $8
        `,
        [...params, value.pageSize, (value.page - 1) * value.pageSize],
      );
      return {
        items: rows.rows.map(mapAudit),
        page: value.page,
        pageSize: value.pageSize,
        total: Number((total.rows[0] as { total?: number } | undefined)?.total ?? 0),
      };
    });
  }

  private async lockedPendingForGrant(
    db: EntitlementDb,
    userId: string,
    input: AdminGrantInput,
  ): Promise<PendingRow | null> {
    if (!input.pendingId) {
      return null;
    }
    const pending = await lockPending(db, input.pendingId);
    if (!pending || pending.userId !== userId) {
      throw new EntitlementOpsNotFoundError('待发放不存在');
    }
    if (pending.status === 'granted') {
      return pending;
    }
    if (pending.status !== 'pending') {
      throw new EntitlementAdminError('conflict', '待发放已处理');
    }
    if (input.qty !== pending.qty) {
      throw new EntitlementOpsValidationError('补发数量必须与待发放一致');
    }
    return pending;
  }

  private async requireUser(db: EntitlementDb, userId: string): Promise<OpsUser> {
    if (!isUuid(userId)) {
      throw new EntitlementOpsNotFoundError('用户不存在');
    }
    const result = await db.query(
      `SELECT id, nick, phone_masked, wx_open_id, status FROM users WHERE id = $1`,
      [userId],
    );
    const user = result.rows[0] ? mapUser(result.rows[0]) : null;
    if (!user) {
      throw new EntitlementOpsNotFoundError('用户不存在');
    }
    return user;
  }

  private async requireDetail(db: EntitlementDb, userId: string, now = new Date()): Promise<OpsDetail> {
    const user = await this.requireUser(db, userId);
    const view = await readEntitlement(db, userId, now);
    const quota = await readDailyFreeSessions(db, null);
    const pendingQty = await sumPending(db, userId);
    const skuName = view.membership.skuCode
      ? await readSkuName(db, view.membership.skuCode)
      : null;
    const entries = [
      ...(await listPendingEntries(db, userId)),
      ...(await listLotEntries(db, userId, now)),
    ];
    if (view.balances.dailyTaskRemain > 0) {
      entries.push({
        kind: 'daily_task',
        id: 'synthetic:daily_task',
        sourceLabel: '今日任务奖',
        bucket: 'daily_task',
        qty: view.balances.dailyTaskRemain,
        remain: view.balances.dailyTaskRemain,
        status: 'today',
        riskText: null,
        expiresAt: null,
        expiresLabel: '今日 24:00 清零',
        actions: [],
      });
    }
    return {
      user,
      membership: { ...view.membership, skuName },
      businessDate: view.businessDate,
      timezone: BUSINESS_TZ,
      balances: {
        dailyFreeRemain: view.balances.dailyFreeRemain,
        dailyFreeQuota: quota,
        dailyTaskRemain: view.balances.dailyTaskRemain,
        inventoryRemain: view.balances.inventoryRemain,
        pendingQty,
      },
      entries,
    };
  }

  private async transaction<T>(fn: (db: EntitlementDb) => Promise<T>): Promise<T> {
    const client = await this.database.requirePool().connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private log(
    actor: string,
    userId: string,
    action: string,
    extra: { lotId?: string | null; pendingId?: string | null; qty?: number; applied?: boolean },
  ): void {
    console.info(
      JSON.stringify({
        scope: 'admin-entitlement',
        actor,
        userId,
        action,
        lotId: extra.lotId ?? null,
        pendingId: extra.pendingId ?? null,
        qty: extra.qty ?? null,
        applied: extra.applied ?? null,
      }),
    );
  }
}

async function listPendingEntries(db: EntitlementDb, userId: string): Promise<OpsEntry[]> {
  const result = await db.query(
    `
      SELECT id, qty, source, risk_text, status
      FROM entitlement_pending_grants
      WHERE user_id = $1 AND status = 'pending'
      ORDER BY created_at DESC, id DESC
    `,
    [userId],
  );
  return result.rows.map((value) => {
    const row = value as Record<string, unknown>;
    const qty = Number(row.qty ?? 0);
    return {
      kind: 'pending' as const,
      id: String(row.id),
      sourceLabel: entitlementSourceLabel(String(row.source ?? ''), null),
      bucket: null,
      qty,
      remain: qty,
      status: 'pending',
      riskText: textOrNull(row.risk_text),
      expiresAt: null,
      actions: ['grant', 'void'],
    };
  });
}

async function listLotEntries(db: EntitlementDb, userId: string, now: Date): Promise<OpsEntry[]> {
  const result = await db.query(
    `
      SELECT
        l.id, l.qty, l.remain, l.source, l.expires_at, l.order_id, s.name AS sku_name
      FROM entitlement_lots l
      LEFT JOIN commerce_skus s ON s.code = l.source
      WHERE l.user_id = $1 AND l.bucket = 'inventory' AND l.remain > 0
      ORDER BY
        CASE WHEN l.expires_at IS NOT NULL AND l.expires_at <= $2::timestamptz THEN 1 ELSE 0 END,
        l.created_at DESC,
        l.id DESC
    `,
    [userId, now.toISOString()],
  );
  return result.rows.map((value) => {
    const row = value as Record<string, unknown>;
    const remain = Number(row.remain ?? 0);
    const expiresAt = toIso(row.expires_at);
    const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= now.getTime());
    const status = expired ? 'expired' : remain > 0 ? 'available' : 'exhausted';
    return {
      kind: 'lot' as const,
      id: String(row.id),
      sourceLabel: entitlementSourceLabel(String(row.source ?? ''), textOrNull(row.sku_name)),
      bucket: 'inventory' as const,
      qty: Number(row.qty ?? 0),
      remain,
      status,
      riskText: textOrNull(row.order_id),
      expiresAt,
      actions: status === 'available' ? ['void'] : [],
    };
  });
}

async function sumPending(db: EntitlementDb, userId: string): Promise<number> {
  const result = await db.query(
    `
      SELECT COALESCE(SUM(qty), 0)::int AS qty
      FROM entitlement_pending_grants
      WHERE user_id = $1 AND status = 'pending'
    `,
    [userId],
  );
  return Number((result.rows[0] as { qty?: number } | undefined)?.qty ?? 0);
}

async function readSkuName(db: EntitlementDb, code: string): Promise<string | null> {
  const result = await db.query(`SELECT name FROM commerce_skus WHERE code = $1`, [code]);
  return textOrNull((result.rows[0] as { name?: unknown } | undefined)?.name);
}

async function lockPending(db: EntitlementDb, id: string): Promise<PendingRow | null> {
  const result = await db.query(
    `
      SELECT id, user_id, qty, source, status, grant_lot_id, risk_text
      FROM entitlement_pending_grants
      WHERE id = $1
      FOR UPDATE
    `,
    [id],
  );
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (!row || typeof row.id !== 'string' || typeof row.user_id !== 'string') {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    qty: Number(row.qty ?? 0),
    source: String(row.source ?? ''),
    status: String(row.status ?? ''),
    grantLotId: typeof row.grant_lot_id === 'string' ? row.grant_lot_id : null,
    riskText: String(row.risk_text ?? ''),
  };
}

async function findGrantLotId(db: EntitlementDb, refId: string): Promise<string | null> {
  const result = await db.query(
    `
      SELECT lot_id
      FROM entitlement_ledger
      WHERE ref_type = 'grant' AND ref_id = $1 AND reason = 'inventory_grant' AND bucket = 'inventory'
    `,
    [refId],
  );
  const lotId = (result.rows[0] as { lot_id?: unknown } | undefined)?.lot_id;
  return typeof lotId === 'string' ? lotId : null;
}

async function assertLotOwner(db: EntitlementDb, lotId: string, userId: string): Promise<void> {
  const result = await db.query(`SELECT user_id FROM entitlement_lots WHERE id = $1`, [lotId]);
  const owner = (result.rows[0] as { user_id?: unknown } | undefined)?.user_id;
  if (owner !== userId) {
    throw new EntitlementAdminError('conflict', '幂等键已被使用');
  }
}

function mapUser(value: unknown): OpsUser {
  const row = value as Record<string, unknown>;
  return {
    userId: String(row.id),
    nick: textOrNull(row.nick),
    phoneMasked: textOrNull(row.phone_masked),
    openIdMasked: maskOpenId(String(row.wx_open_id ?? '')),
    status: String(row.status ?? ''),
  };
}

function mapAudit(value: unknown): AuditItem {
  const row = value as Record<string, unknown>;
  return {
    id: Number(row.id),
    actor: String(row.actor ?? ''),
    action: String(row.action ?? ''),
    target: String(row.target ?? ''),
    before: row.before ?? null,
    after: row.after ?? null,
    createdAt: toIso(row.created_at) ?? new Date(0).toISOString(),
  };
}

function findEntry(entries: OpsEntry[], lotId: string | null): OpsEntry | null {
  if (!lotId) {
    return null;
  }
  return entries.find((entry) => entry.kind === 'lot' && entry.id === lotId) ?? null;
}

function defaultRefId(actor: string): string {
  const safe = actor.trim().replace(/\s+/g, '_').slice(0, 40);
  return `admin:${safe || 'admin'}:${randomUUID()}`;
}

function likePrefix(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const text = value.trim();
  return text ? text : null;
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
