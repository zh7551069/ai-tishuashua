import {
  Inject,
  Injectable,
  type OnModuleDestroy,
  type OnModuleInit,
  HttpStatus,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  GROWTH_INVITE_CODE_ALPHABET,
  GROWTH_INVITE_INVENTORY_EXPIRE_DAYS,
  GROWTH_LOT_SOURCE,
  GROWTH_MEMBER_SKIP_REASON,
  GROWTH_PENDING_SOURCE,
  businessDate,
  growthRef,
  growthSharePath,
  growthShareStatus,
  growthWeekStart,
  parseInviteBindBody,
  parseShareOpenBody,
  type GrowthCheckinResult,
  type GrowthConfig,
  type GrowthInvite,
  type GrowthInviteBindResult,
  type GrowthRewardOutcome,
  type GrowthShareOpenResult,
  type GrowthShareTokenResult,
  type GrowthView,
} from '@tishuashua/shared';
import { readGrowthConfig, type SettingsCache } from '@tishuashua/shared/commerce';
import {
  ensureEntitlementDay,
  grantEntitlement,
  isMemberActive,
  readEntitlement,
  type EntitlementDb,
} from '@tishuashua/shared/entitlement';
import { randomBytes, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { ApiException, logServerError } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import { loadApiEnv } from '../config/env';
import { DatabaseService } from '../db/database.service';
import {
  countSubmittedSessions,
  findInviteCode,
  findInviteRelation,
  findShareToken,
  findUserIdByInviteCode,
  hasGrant,
  hasPendingRef,
  insertInviteCode,
  insertInviteRelation,
  insertPendingGrant,
  insertShareToken,
  lockShareToken,
  lockTaskState,
  markCheckin,
  markShareClaimed,
  markTokenClaimed,
  markTokenOpened,
  readTaskState,
  sumInviterGrantedSessions,
  userExists,
} from './growth.repository';

const GROWTH_LOCK_KEY = 861029;

@Injectable()
export class GrowthService implements OnModuleInit, OnModuleDestroy {
  private redis: Redis | null = null;
  private cacheReady = false;

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const env = loadApiEnv(this.configService);
    if (!env.redisUrl) {
      return;
    }
    const redis = new Redis(env.redisUrl, {
      connectTimeout: 3000,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
      retryStrategy: () => null,
    });
    redis.on('error', (error: Error) => {
      this.cacheReady = false;
      logServerError('growth', error);
    });
    this.redis = redis;
    try {
      await redis.connect();
      this.cacheReady = (await redis.ping()) === 'PONG';
    } catch (error) {
      this.cacheReady = false;
      logServerError('growth', error);
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.redis?.disconnect();
    this.redis = null;
    this.cacheReady = false;
  }

  view(userId: string): Promise<GrowthView> {
    return this.transaction(async (db) => {
      const now = new Date();
      const today = businessDate(now);
      const config = await this.loadConfig(db);
      const state = await readTaskState(db, userId, today);
      const membershipActive = await isMemberActive(db, userId, now);
      const issuedToken = await findShareToken(db, userId, today);
      const share = growthShareStatus({
        enabled: config.share.enabled,
        claimed: state.shareClaimed,
        membershipActive,
        awaitingOpen: Boolean(issuedToken),
      });
      const weekStart = growthWeekStart(today);
      const relation = await findInviteRelation(db, userId);
      return {
        businessDate: today,
        checkin: {
          enabled: config.checkin.enabled,
          done: state.checkinDone,
          rewardSessions: config.checkin.rewardSessions,
        },
        share: {
          enabled: config.share.enabled,
          claimed: state.shareClaimed,
          rewardSessions: config.share.rewardSessions,
          memberSkip: share.memberSkip,
          awaitingOpen: share.awaitingOpen,
          statusText: share.statusText,
        },
        invite: {
          code: await this.ensureInviteCode(db, userId),
          boundInviterId: relation?.inviterUserId ?? null,
          dailyUsed: await sumInviterGrantedSessions(db, userId, today, today),
          dailyCap: config.invite.dailyCapSessions,
          weeklyUsed: await sumInviterGrantedSessions(db, userId, weekStart, today),
          weeklyCap: config.invite.weeklyCapSessions,
          registerEnabled: config.invite.registerEnabled,
          rewards: {
            inviterRegister: config.invite.inviterRegisterSessions,
            inviteeWelcome: config.invite.inviteeWelcomeSessions,
            inviterFirstSubmit: config.invite.inviterFirstSubmitSessions,
            inviteeFirstSubmit: config.invite.inviteeFirstSubmitSessions,
          },
        },
        membershipActive,
      };
    });
  }

  checkin(userId: string): Promise<GrowthCheckinResult> {
    return this.transaction(async (db) => {
      const now = new Date();
      const config = await this.loadConfig(db);
      if (!config.checkin.enabled) {
        throw disabled('签到未开启');
      }
      const today = businessDate(now);
      const state = await lockTaskState(db, userId, today);
      if (state.checkinDone) {
        const current = await readEntitlement(db, userId, now);
        return {
          applied: false,
          rewardSessions: config.checkin.rewardSessions,
          balances: current.balances,
        };
      }
      const qty = config.checkin.rewardSessions;
      let applied = false;
      if (qty >= 1) {
        const granted = await grantEntitlement(
          db,
          userId,
          { type: 'daily_task', qty, refId: growthRef.checkin(userId, today) },
          now,
        );
        applied = granted.applied;
      }
      await markCheckin(db, userId, today);
      const after = await readEntitlement(db, userId, now);
      return { applied, rewardSessions: qty, balances: after.balances };
    });
  }

  shareToken(userId: string): Promise<GrowthShareTokenResult> {
    return this.transaction(async (db) => {
      const config = await this.loadConfig(db);
      if (!config.share.enabled) {
        throw disabled('分享未开启');
      }
      const today = businessDate(new Date());
      const existing = await findShareToken(db, userId, today);
      if (existing) {
        return tokenResult(existing, today);
      }
      const created = newShareToken();
      await insertShareToken(db, created, userId, today);
      const stored = (await findShareToken(db, userId, today)) ?? created;
      return tokenResult(stored, today);
    });
  }

  shareOpen(openerUserId: string, body: unknown): Promise<GrowthShareOpenResult> {
    const parsed = parseShareOpenBody(body);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.transaction(async (db) => {
      const now = new Date();
      const today = businessDate(now);
      const config = await this.loadConfig(db);
      const token = await lockShareToken(db, parsed.value.shareToken);
      if (!token || token.businessDate !== today) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.GROWTH_INVALID_TOKEN,
          '分享链接无效或已过期',
        );
      }
      if (token.sharerUserId === openerUserId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.GROWTH_SELF_INVITE,
          '不能领取自己的分享',
        );
      }
      if (!config.share.enabled) {
        throw disabled('分享未开启');
      }
      const state = await lockTaskState(db, token.sharerUserId, today);
      if (state.shareClaimed || token.claimedAt) {
        await markTokenOpened(db, token.token);
        return { applied: false, sharerRewarded: false, reason: 'already_claimed' };
      }
      if (await isMemberActive(db, token.sharerUserId, now)) {
        await markTokenOpened(db, token.token);
        return {
          applied: false,
          sharerRewarded: false,
          reason: GROWTH_MEMBER_SKIP_REASON,
        };
      }
      const qty = config.share.rewardSessions;
      let applied = false;
      if (qty >= 1) {
        const granted = await grantEntitlement(
          db,
          token.sharerUserId,
          { type: 'daily_task', qty, refId: growthRef.share(token.sharerUserId, today) },
          now,
        );
        applied = granted.applied;
      }
      await markShareClaimed(db, token.sharerUserId, today);
      await markTokenClaimed(db, token.token);
      return { applied, sharerRewarded: applied };
    });
  }

  bindInvite(inviteeUserId: string, body: unknown): Promise<GrowthInviteBindResult> {
    const parsed = parseInviteBindBody(body);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.transaction(async (db) => {
      const now = new Date();
      const config = await this.loadConfig(db);
      const resolved = await this.resolveInviter(db, parsed.value);
      if (resolved.inviterId === inviteeUserId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.GROWTH_SELF_INVITE,
          '不能邀请自己',
        );
      }
      const existing = await findInviteRelation(db, inviteeUserId);
      if (existing) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          ApiErrorCode.GROWTH_ALREADY_BOUND,
          '已经绑定过邀请人',
        );
      }
      try {
        await insertInviteRelation(db, {
          inviteeUserId,
          inviterUserId: resolved.inviterId,
          inviteCodeUsed: resolved.inviteCode,
        });
      } catch (error) {
        if (isPgCode(error, '23505') || isPgCode(error, '23514')) {
          throw new ApiException(
            isPgCode(error, '23514') ? HttpStatus.BAD_REQUEST : HttpStatus.CONFLICT,
            isPgCode(error, '23514')
              ? ApiErrorCode.GROWTH_SELF_INVITE
              : ApiErrorCode.GROWTH_ALREADY_BOUND,
            isPgCode(error, '23514') ? '不能邀请自己' : '已经绑定过邀请人',
          );
        }
        throw error;
      }
      const today = businessDate(now);
      const expiresAt = inventoryExpiresAt(now);
      const invitee = await this.settleInventory(db, {
        userId: inviteeUserId,
        qty: config.invite.inviteeWelcomeSessions,
        refId: growthRef.inviteeWelcome(inviteeUserId),
        source: GROWTH_LOT_SOURCE.inviteRegister,
        expiresAt,
        now,
        cap: null,
      });
      const inviter = config.invite.registerEnabled
        ? await this.settleInventory(db, {
            userId: resolved.inviterId,
            qty: config.invite.inviterRegisterSessions,
            refId: growthRef.inviterRegister(inviteeUserId),
            source: GROWTH_LOT_SOURCE.inviteRegister,
            expiresAt,
            now,
            cap: { config: config.invite, bizDate: today },
          })
        : skipped(config.invite.inviterRegisterSessions, 'register_disabled');
      return {
        bound: true,
        inviterId: resolved.inviterId,
        inviteCode: resolved.inviteCode ?? (await this.ensureInviteCode(db, resolved.inviterId)),
        invitee,
        inviter,
      };
    });
  }

  /**
   * 生涯第一次成功交卷之后调用。没有邀请关系则直接返回。
   * 失败重试一次；仍失败则把未入账的首刷奖写入 pending，不把交卷回滚。
   */
  async onFirstSubmit(userId: string): Promise<void> {
    try {
      await this.transaction((db) => this.applyFirstSubmit(db, userId));
    } catch (error) {
      logServerError('growth', error);
      try {
        await this.transaction((db) => this.applyFirstSubmit(db, userId));
      } catch (retryError) {
        logServerError('growth', retryError);
        await this.recordFirstSubmitFailure(userId).catch((pendingError) => {
          logServerError('growth', pendingError);
        });
      }
    }
  }

  private async applyFirstSubmit(db: EntitlementDb, userId: string): Promise<void> {
    await db.query(`SELECT pg_advisory_xact_lock($1, hashtext($2::text))`, [
      GROWTH_LOCK_KEY,
      userId,
    ]);
    if ((await countSubmittedSessions(db, userId)) < 1) {
      return;
    }
    const relation = await findInviteRelation(db, userId);
    if (!relation) {
      return;
    }
    const config = await this.loadConfig(db);
    if (!config.invite.firstSubmitEnabled) {
      return;
    }
    const now = new Date();
    const today = businessDate(now);
    const expiresAt = inventoryExpiresAt(now);
    await this.settleInventory(db, {
      userId,
      qty: config.invite.inviteeFirstSubmitSessions,
      refId: growthRef.inviteeFirstSubmit(userId),
      source: GROWTH_LOT_SOURCE.inviteFirstSubmit,
      expiresAt,
      now,
      cap: null,
    });
    await this.settleInventory(db, {
      userId: relation.inviterUserId,
      qty: config.invite.inviterFirstSubmitSessions,
      refId: growthRef.inviterFirstSubmit(userId),
      source: GROWTH_LOT_SOURCE.inviteFirstSubmit,
      expiresAt,
      now,
      cap: { config: config.invite, bizDate: today },
    });
  }

  private async recordFirstSubmitFailure(userId: string): Promise<void> {
    await this.transaction(async (db) => {
      const relation = await findInviteRelation(db, userId);
      if (!relation) {
        return;
      }
      const config = await this.loadConfig(db);
      if (!config.invite.firstSubmitEnabled) {
        return;
      }
      await this.pendingIfMissing(db, {
        userId,
        qty: config.invite.inviteeFirstSubmitSessions,
        refId: growthRef.inviteeFirstSubmit(userId),
        source: GROWTH_PENDING_SOURCE.inviteFirstSubmit,
      });
      await this.pendingIfMissing(db, {
        userId: relation.inviterUserId,
        qty: config.invite.inviterFirstSubmitSessions,
        refId: growthRef.inviterFirstSubmit(userId),
        source: GROWTH_PENDING_SOURCE.inviteFirstSubmit,
      });
    });
  }

  private async pendingIfMissing(
    db: EntitlementDb,
    input: { userId: string; qty: number; refId: string; source: string },
  ): Promise<void> {
    if (input.qty < 1) {
      return;
    }
    if (await hasGrant(db, input.refId, 'inventory_grant', 'inventory')) {
      return;
    }
    if (await hasPendingRef(db, input.userId, input.refId)) {
      return;
    }
    await insertPendingGrant(db, {
      id: randomUUID(),
      userId: input.userId,
      qty: input.qty,
      source: input.source,
      riskCode: 'grant_error',
      riskText: '首刷发奖失败，待人工处理',
      relatedRef: input.refId,
    });
  }

  private async settleInventory(
    db: EntitlementDb,
    input: {
      userId: string;
      qty: number;
      refId: string;
      source: string;
      expiresAt: string;
      now: Date;
      cap: { config: GrowthInvite; bizDate: string } | null;
    },
  ): Promise<GrowthRewardOutcome> {
    if (input.qty < 1) {
      return skipped(0, 'zero');
    }
    if (await hasGrant(db, input.refId, 'inventory_grant', 'inventory')) {
      return { applied: false, pending: false, rewardSessions: input.qty, reason: 'already' };
    }
    if (await hasPendingRef(db, input.userId, input.refId)) {
      return { applied: false, pending: true, rewardSessions: input.qty, reason: 'pending' };
    }
    if (input.cap) {
      const blocked = await this.capBlock(db, input.userId, input.qty, input.cap, input.now);
      if (blocked) {
        await insertPendingGrant(db, {
          id: randomUUID(),
          userId: input.userId,
          qty: input.qty,
          source: input.source,
          riskCode: blocked,
          riskText: blocked === 'daily_cap' ? '邀请人日封顶' : '邀请人周封顶',
          relatedRef: input.refId,
        });
        return { applied: false, pending: true, rewardSessions: input.qty, reason: blocked };
      }
    }
    const granted = await grantEntitlement(
      db,
      input.userId,
      {
        type: 'inventory',
        qty: input.qty,
        source: input.source,
        expiresAt: input.expiresAt,
        refId: input.refId,
      },
      input.now,
    );
    return { applied: granted.applied, pending: false, rewardSessions: input.qty };
  }

  /** 先锁邀请人账户再汇总，避免并发绑定时一起钻过封顶。 */
  private async capBlock(
    db: EntitlementDb,
    inviterId: string,
    qty: number,
    cap: { config: GrowthInvite; bizDate: string },
    now: Date,
  ): Promise<'daily_cap' | 'weekly_cap' | null> {
    await ensureEntitlementDay(db, inviterId, now);
    if (cap.config.dailyCapEnabled) {
      const used = await sumInviterGrantedSessions(db, inviterId, cap.bizDate, cap.bizDate);
      if (used + qty > cap.config.dailyCapSessions) {
        return 'daily_cap';
      }
    }
    if (cap.config.weeklyCapEnabled) {
      const weekStart = growthWeekStart(cap.bizDate);
      const used = await sumInviterGrantedSessions(db, inviterId, weekStart, cap.bizDate);
      if (used + qty > cap.config.weeklyCapSessions) {
        return 'weekly_cap';
      }
    }
    return null;
  }

  private async resolveInviter(
    db: EntitlementDb,
    input: { inviteCode: string | null; inviterId: string | null },
  ): Promise<{ inviterId: string; inviteCode: string | null }> {
    if (input.inviteCode) {
      const inviterId = await findUserIdByInviteCode(db, input.inviteCode);
      if (!inviterId) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.GROWTH_CONDITION_NOT_MET,
          '邀请码无效',
        );
      }
      return { inviterId, inviteCode: input.inviteCode };
    }
    if (!input.inviterId || !(await userExists(db, input.inviterId))) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        ApiErrorCode.GROWTH_CONDITION_NOT_MET,
        '邀请码无效',
      );
    }
    return { inviterId: input.inviterId, inviteCode: null };
  }

  private async ensureInviteCode(db: EntitlementDb, userId: string): Promise<string> {
    const existing = await findInviteCode(db, userId);
    if (existing) {
      return existing;
    }
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = newInviteCode();
      try {
        const inserted = await insertInviteCode(db, userId, code);
        if (inserted) {
          return code;
        }
        const raced = await findInviteCode(db, userId);
        if (raced) {
          return raced;
        }
      } catch (error) {
        if (!isPgCode(error, '23505')) {
          throw error;
        }
      }
    }
    throw new Error('邀请码生成失败');
  }

  private async loadConfig(db: EntitlementDb): Promise<GrowthConfig> {
    return readGrowthConfig(db, this.cache());
  }

  private cache(): SettingsCache | null {
    if (!this.redis || !this.cacheReady) {
      return null;
    }
    const redis = this.redis;
    return {
      get: (key) => redis.get(key),
      set: (key, value, expiryMode, ttl) => redis.set(key, value, expiryMode, ttl),
      del: (key) => redis.del(key),
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
      rethrowDatabaseError('growth', error);
    } finally {
      client.release();
    }
  }
}

function disabled(message: string): ApiException {
  return new ApiException(HttpStatus.FORBIDDEN, ApiErrorCode.GROWTH_DISABLED, message);
}

function skipped(rewardSessions: number, reason: string): GrowthRewardOutcome {
  return { applied: false, pending: false, rewardSessions, reason };
}

function tokenResult(shareToken: string, businessDateValue: string): GrowthShareTokenResult {
  return {
    shareToken,
    businessDate: businessDateValue,
    pathHint: growthSharePath(shareToken),
  };
}

function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

function newInviteCode(): string {
  const bytes = randomBytes(6);
  let body = '';
  for (const byte of bytes) {
    body += GROWTH_INVITE_CODE_ALPHABET[byte % GROWTH_INVITE_CODE_ALPHABET.length];
  }
  return `TS-${body}`;
}

function inventoryExpiresAt(now: Date): string {
  const at = new Date(now.getTime());
  at.setUTCDate(at.getUTCDate() + GROWTH_INVITE_INVENTORY_EXPIRE_DAYS);
  return at.toISOString();
}
