import {
  priceYuanFromFen,
  type CommerceSku,
  type SkuDraft,
  type SkuPatch,
  type SkuType,
} from '@tishuashua/shared';
import type { SettingsDb } from '@tishuashua/shared/commerce';

const SKU_COLUMNS = `
  code,
  type,
  name,
  price_fen,
  duration_days,
  sessions,
  inventory_expire_days,
  summary,
  enabled,
  recommended,
  sort_order,
  updated_at,
  updated_by
`;

export async function listSkus(
  db: SettingsDb,
  filter: { type: SkuType | null; status: 'all' | 'enabled' | 'disabled' },
): Promise<CommerceSku[]> {
  const result = await db.query(
    `
      SELECT ${SKU_COLUMNS}
      FROM commerce_skus
      WHERE ($1::text IS NULL OR type = $1)
        AND (
          $2::text = 'all'
          OR ($2::text = 'enabled' AND enabled)
          OR ($2::text = 'disabled' AND NOT enabled)
        )
      ORDER BY sort_order ASC, code ASC
    `,
    [filter.type, filter.status],
  );
  return result.rows.map(mapSku);
}

export async function getSku(db: SettingsDb, code: string): Promise<CommerceSku | null> {
  const result = await db.query(
    `
      SELECT ${SKU_COLUMNS}
      FROM commerce_skus
      WHERE code = $1
    `,
    [code],
  );
  const row = result.rows[0];
  return row ? mapSku(row) : null;
}

export async function insertSku(
  db: SettingsDb,
  draft: SkuDraft,
  updatedBy: string,
): Promise<CommerceSku> {
  const result = await db.query(
    `
      INSERT INTO commerce_skus (
        code, type, name, price_fen, duration_days, sessions, inventory_expire_days,
        summary, enabled, recommended, sort_order, updated_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${SKU_COLUMNS}
    `,
    [
      draft.code,
      draft.type,
      draft.name,
      draft.priceFen,
      draft.durationDays,
      draft.sessions,
      draft.inventoryExpireDays,
      draft.summary,
      draft.enabled,
      draft.recommended,
      draft.sortOrder,
      updatedBy,
    ],
  );
  return mapSku(result.rows[0]);
}

export async function updateSku(
  db: SettingsDb,
  code: string,
  patch: SkuPatch,
  updatedBy: string,
): Promise<CommerceSku | null> {
  const sets = ['updated_at = now()', 'updated_by = $1'];
  const params: unknown[] = [updatedBy];
  const columns: Array<[keyof SkuPatch, string]> = [
    ['name', 'name'],
    ['priceFen', 'price_fen'],
    ['durationDays', 'duration_days'],
    ['sessions', 'sessions'],
    ['inventoryExpireDays', 'inventory_expire_days'],
    ['summary', 'summary'],
    ['enabled', 'enabled'],
    ['recommended', 'recommended'],
    ['sortOrder', 'sort_order'],
  ];
  for (const [key, column] of columns) {
    if (key in patch) {
      params.push(patch[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }
  params.push(code);
  const result = await db.query(
    `
      UPDATE commerce_skus
      SET ${sets.join(', ')}
      WHERE code = $${params.length}
      RETURNING ${SKU_COLUMNS}
    `,
    params,
  );
  const row = result.rows[0];
  return row ? mapSku(row) : null;
}

export async function setSkuEnabled(
  db: SettingsDb,
  code: string,
  enabled: boolean,
  updatedBy: string,
): Promise<CommerceSku | null> {
  const result = await db.query(
    `
      UPDATE commerce_skus
      SET enabled = $2, updated_at = now(), updated_by = $3
      WHERE code = $1
      RETURNING ${SKU_COLUMNS}
    `,
    [code, enabled, updatedBy],
  );
  const row = result.rows[0];
  return row ? mapSku(row) : null;
}

export async function insertAudit(
  db: SettingsDb,
  input: {
    actor: string;
    action: string;
    target: string;
    before: unknown;
    after: unknown;
  },
): Promise<void> {
  await db.query(
    `
      INSERT INTO admin_audit_logs (actor, action, target, before, after)
      VALUES ($1, $2, $3, $4::jsonb, $5::jsonb)
    `,
    [
      input.actor,
      input.action,
      input.target,
      JSON.stringify(input.before ?? null),
      JSON.stringify(input.after ?? null),
    ],
  );
}

function mapSku(value: unknown): CommerceSku {
  const row = value as Record<string, unknown>;
  const priceFen = Number(row.price_fen ?? 0);
  return {
    code: String(row.code),
    type: row.type === 'session_pack' ? 'session_pack' : 'member',
    name: String(row.name),
    priceFen,
    priceYuan: priceYuanFromFen(priceFen),
    durationDays: row.duration_days === null || row.duration_days === undefined ? null : Number(row.duration_days),
    sessions: row.sessions === null || row.sessions === undefined ? null : Number(row.sessions),
    inventoryExpireDays:
      row.inventory_expire_days === null || row.inventory_expire_days === undefined
        ? null
        : Number(row.inventory_expire_days),
    summary: String(row.summary),
    enabled: row.enabled === true,
    recommended: row.recommended === true,
    sortOrder: Number(row.sort_order ?? 0),
    updatedAt: toIso(row.updated_at),
    updatedBy: typeof row.updated_by === 'string' && row.updated_by.trim() ? row.updated_by : null,
  };
}

function toIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}
