import { isInviterRewardRef, type EntitlementDb } from '@tishuashua/shared';

export interface TaskState {
  checkinDone: boolean;
  shareClaimed: boolean;
}

export interface ShareTokenRow {
  token: string;
  sharerUserId: string;
  businessDate: string;
  claimedAt: string | null;
}

export interface InviteRelation {
  inviteeUserId: string;
  inviterUserId: string;
  inviteCodeUsed: string | null;
}

export async function lockTaskState(
  db: EntitlementDb,
  userId: string,
  bizDate: string,
): Promise<TaskState> {
  await db.query(
    `
      INSERT INTO growth_task_states (user_id, business_date)
      VALUES ($1, $2::date)
      ON CONFLICT (user_id, business_date) DO NOTHING
    `,
    [userId, bizDate],
  );
  const result = await db.query(
    `
      SELECT checkin_done, share_claimed
      FROM growth_task_states
      WHERE user_id = $1 AND business_date = $2::date
      FOR UPDATE
    `,
    [userId, bizDate],
  );
  const row = result.rows[0] as { checkin_done?: boolean; share_claimed?: boolean } | undefined;
  return {
    checkinDone: row?.checkin_done === true,
    shareClaimed: row?.share_claimed === true,
  };
}

export async function readTaskState(
  db: EntitlementDb,
  userId: string,
  bizDate: string,
): Promise<TaskState> {
  const result = await db.query(
    `
      SELECT checkin_done, share_claimed
      FROM growth_task_states
      WHERE user_id = $1 AND business_date = $2::date
    `,
    [userId, bizDate],
  );
  const row = result.rows[0] as { checkin_done?: boolean; share_claimed?: boolean } | undefined;
  return {
    checkinDone: row?.checkin_done === true,
    shareClaimed: row?.share_claimed === true,
  };
}

export async function markCheckin(
  db: EntitlementDb,
  userId: string,
  bizDate: string,
): Promise<void> {
  await db.query(
    `
      UPDATE growth_task_states
      SET checkin_done = true, updated_at = now()
      WHERE user_id = $1 AND business_date = $2::date
    `,
    [userId, bizDate],
  );
}

export async function markShareClaimed(
  db: EntitlementDb,
  userId: string,
  bizDate: string,
): Promise<void> {
  await db.query(
    `
      UPDATE growth_task_states
      SET share_claimed = true, updated_at = now()
      WHERE user_id = $1 AND business_date = $2::date
    `,
    [userId, bizDate],
  );
}

export async function findShareToken(
  db: EntitlementDb,
  sharerUserId: string,
  bizDate: string,
): Promise<string | null> {
  const result = await db.query(
    `
      SELECT token
      FROM growth_share_tokens
      WHERE sharer_user_id = $1 AND business_date = $2::date
    `,
    [sharerUserId, bizDate],
  );
  const token = (result.rows[0] as { token?: string } | undefined)?.token;
  return typeof token === 'string' ? token : null;
}

export async function insertShareToken(
  db: EntitlementDb,
  token: string,
  sharerUserId: string,
  bizDate: string,
): Promise<void> {
  await db.query(
    `
      INSERT INTO growth_share_tokens (token, sharer_user_id, business_date)
      VALUES ($1, $2, $3::date)
      ON CONFLICT (sharer_user_id, business_date) DO NOTHING
    `,
    [token, sharerUserId, bizDate],
  );
}

export async function lockShareToken(
  db: EntitlementDb,
  token: string,
): Promise<ShareTokenRow | null> {
  const result = await db.query(
    `
      SELECT
        token,
        sharer_user_id,
        business_date::text AS business_date,
        claimed_at
      FROM growth_share_tokens
      WHERE token = $1
      FOR UPDATE
    `,
    [token],
  );
  const row = result.rows[0] as
    | {
        token?: string;
        sharer_user_id?: string;
        business_date?: string;
        claimed_at?: unknown;
      }
    | undefined;
  if (!row?.token || !row.sharer_user_id || !row.business_date) {
    return null;
  }
  return {
    token: row.token,
    sharerUserId: row.sharer_user_id,
    businessDate: row.business_date,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
  };
}

export async function markTokenOpened(db: EntitlementDb, token: string): Promise<void> {
  await db.query(
    `
      UPDATE growth_share_tokens
      SET first_open_at = COALESCE(first_open_at, now())
      WHERE token = $1
    `,
    [token],
  );
}

export async function markTokenClaimed(db: EntitlementDb, token: string): Promise<void> {
  await db.query(
    `
      UPDATE growth_share_tokens
      SET first_open_at = COALESCE(first_open_at, now()),
          claimed_at = COALESCE(claimed_at, now())
      WHERE token = $1
    `,
    [token],
  );
}

export async function findInviteCode(db: EntitlementDb, userId: string): Promise<string | null> {
  const result = await db.query(`SELECT code FROM user_invite_codes WHERE user_id = $1`, [userId]);
  const code = (result.rows[0] as { code?: string } | undefined)?.code;
  return typeof code === 'string' ? code : null;
}

export async function insertInviteCode(
  db: EntitlementDb,
  userId: string,
  code: string,
): Promise<boolean> {
  const result = await db.query(
    `
      INSERT INTO user_invite_codes (user_id, code)
      VALUES ($1, $2)
      ON CONFLICT (user_id) DO NOTHING
    `,
    [userId, code],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findUserIdByInviteCode(
  db: EntitlementDb,
  code: string,
): Promise<string | null> {
  const result = await db.query(`SELECT user_id FROM user_invite_codes WHERE code = $1`, [code]);
  const userId = (result.rows[0] as { user_id?: string } | undefined)?.user_id;
  return typeof userId === 'string' ? userId : null;
}

export async function userExists(db: EntitlementDb, userId: string): Promise<boolean> {
  const result = await db.query(`SELECT 1 FROM users WHERE id = $1`, [userId]);
  return result.rows.length > 0;
}

export async function findInviteRelation(
  db: EntitlementDb,
  inviteeUserId: string,
): Promise<InviteRelation | null> {
  const result = await db.query(
    `
      SELECT invitee_user_id, inviter_user_id, invite_code_used
      FROM invite_relations
      WHERE invitee_user_id = $1
    `,
    [inviteeUserId],
  );
  const row = result.rows[0] as
    | { invitee_user_id?: string; inviter_user_id?: string; invite_code_used?: string | null }
    | undefined;
  if (!row?.invitee_user_id || !row.inviter_user_id) {
    return null;
  }
  return {
    inviteeUserId: row.invitee_user_id,
    inviterUserId: row.inviter_user_id,
    inviteCodeUsed: row.invite_code_used ?? null,
  };
}

export async function insertInviteRelation(
  db: EntitlementDb,
  input: { inviteeUserId: string; inviterUserId: string; inviteCodeUsed: string | null },
): Promise<void> {
  await db.query(
    `
      INSERT INTO invite_relations (invitee_user_id, inviter_user_id, invite_code_used)
      VALUES ($1, $2, $3)
    `,
    [input.inviteeUserId, input.inviterUserId, input.inviteCodeUsed],
  );
}

export async function countSubmittedSessions(db: EntitlementDb, userId: string): Promise<number> {
  const result = await db.query(
    `
      SELECT count(*)::int AS count
      FROM quiz_sessions
      WHERE user_id = $1 AND status = 'submitted'
    `,
    [userId],
  );
  return Number((result.rows[0] as { count?: number } | undefined)?.count ?? 0);
}

export async function hasGrant(
  db: EntitlementDb,
  refId: string,
  reason: 'task_grant' | 'inventory_grant',
  bucket: 'daily_task' | 'inventory',
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM entitlement_ledger
      WHERE ref_type = 'grant' AND ref_id = $1 AND reason = $2 AND bucket = $3
      LIMIT 1
    `,
    [refId, reason, bucket],
  );
  return result.rows.length > 0;
}

export async function hasPendingRef(
  db: EntitlementDb,
  userId: string,
  relatedRef: string,
): Promise<boolean> {
  const result = await db.query(
    `
      SELECT 1
      FROM entitlement_pending_grants
      WHERE user_id = $1 AND related_ref = $2
      LIMIT 1
    `,
    [userId, relatedRef],
  );
  return result.rows.length > 0;
}

/** 邀请人已入账场次。只计 invite_reg_inviter / invite_fs_inviter，不含被邀请人欢迎奖。 */
export async function sumInviterGrantedSessions(
  db: EntitlementDb,
  inviterUserId: string,
  fromDate: string,
  toDate: string,
): Promise<number> {
  const result = await db.query(
    `
      SELECT COALESCE(SUM(delta), 0)::int AS used
      FROM entitlement_ledger
      WHERE user_id = $1
        AND bucket = 'inventory'
        AND reason = 'inventory_grant'
        AND ref_type = 'grant'
        AND biz_date >= $2::date
        AND biz_date <= $3::date
        AND (
          ref_id LIKE 'invite_reg_inviter:%'
          OR ref_id LIKE 'invite_fs_inviter:%'
        )
    `,
    [inviterUserId, fromDate, toDate],
  );
  const used = Number((result.rows[0] as { used?: number } | undefined)?.used ?? 0);
  return Number.isFinite(used) ? used : 0;
}

export async function insertPendingGrant(
  db: EntitlementDb,
  input: {
    id: string;
    userId: string;
    qty: number;
    source: string;
    riskCode: string;
    riskText: string;
    relatedRef: string;
  },
): Promise<void> {
  if (!isInviterRewardRef(input.relatedRef) && !input.relatedRef.startsWith('invite_')) {
    throw new Error('pending related_ref 不属于增长发奖');
  }
  await db.query(
    `
      INSERT INTO entitlement_pending_grants (
        id, user_id, qty, source, risk_code, risk_text, status, related_ref
      )
      VALUES ($1, $2, $3, $4, $5, $6, 'pending', $7)
      ON CONFLICT (user_id, related_ref) WHERE related_ref IS NOT NULL DO NOTHING
    `,
    [
      input.id,
      input.userId,
      input.qty,
      input.source,
      input.riskCode,
      input.riskText,
      input.relatedRef,
    ],
  );
}
