import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ApiErrorCode } from '@tishuashua/shared';
import {
  EntitlementFlowError,
  commitEntitlement,
  grantEntitlement,
  isMemberActive as readMemberActive,
  parseGrantCommand,
  parseLedgerQuery,
  readEntitlement,
  readEntitlementLedger,
  releaseEntitlement,
  reserveEntitlement,
  type EntitlementBalances,
  type EntitlementDb,
  type EntitlementLedgerPage,
  type EntitlementView,
  type GrantResult,
} from '@tishuashua/shared/entitlement';
import { ApiException } from '../common/api.exception';
import { rethrowDatabaseError } from '../common/database-error';
import { DatabaseService } from '../db/database.service';

@Injectable()
export class EntitlementService {
  constructor(@Inject(DatabaseService) private readonly database: DatabaseService) {}

  /** 懒日切并返回当前权益。读余额也会滚业务日。 */
  ensureDay(userId: string): Promise<EntitlementView> {
    return this.transaction((db) => readEntitlement(db, userId));
  }

  async getBalances(userId: string): Promise<EntitlementBalances> {
    const view = await this.ensureDay(userId);
    return view.balances;
  }

  async isMemberActive(userId: string): Promise<boolean> {
    try {
      return await readMemberActive(this.database.requirePool(), userId);
    } catch (error) {
      rethrowDatabaseError('entitlement', error);
    }
  }

  reserve(userId: string, input: { sessionId: string; qty: 1 }): Promise<void> {
    return this.transaction(async (db) => {
      await reserveEntitlement(db, userId, input);
    });
  }

  commit(sessionId: string): Promise<void> {
    return this.transaction((db) => commitEntitlement(db, sessionId));
  }

  release(sessionId: string): Promise<void> {
    return this.transaction((db) => releaseEntitlement(db, sessionId));
  }

  grant(userId: string, input: unknown): Promise<GrantResult> {
    const parsed = parseGrantCommand(input);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.transaction((db) => grantEntitlement(db, userId, parsed.command));
  }

  async ledger(
    userId: string,
    limitRaw: unknown,
    cursorRaw: unknown,
  ): Promise<EntitlementLedgerPage> {
    const parsed = parseLedgerQuery(limitRaw, cursorRaw);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    try {
      return await readEntitlementLedger(this.database.requirePool(), userId, parsed);
    } catch (error) {
      rethrowDatabaseError('entitlement', error);
    }
  }

  /** 把账本错误译成 API 错误。供已有事务里的调用方使用。 */
  rethrow(error: unknown): never {
    if (error instanceof EntitlementFlowError) {
      throw toApiException(error);
    }
    throw error;
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
      if (error instanceof EntitlementFlowError) {
        throw toApiException(error);
      }
      rethrowDatabaseError('entitlement', error);
    } finally {
      client.release();
    }
  }
}

function toApiException(error: EntitlementFlowError): ApiException {
  if (error.code === 'ENTITLEMENT_EXHAUSTED') {
    return new ApiException(
      HttpStatus.PAYMENT_REQUIRED,
      ApiErrorCode.ENTITLEMENT_EXHAUSTED,
      error.message,
      error.details,
    );
  }
  return new ApiException(HttpStatus.CONFLICT, ApiErrorCode.ENTITLEMENT_CONFLICT, error.message);
}
