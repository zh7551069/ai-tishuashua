import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type AdminSummary } from '@tishuashua/shared';
import { EntitlementAdminError, EntitlementFlowError } from '@tishuashua/shared/entitlement';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { ApiException } from '../common/api.exception';
import { rethrowDatabaseError } from '../common/database-error';
import {
  EntitlementOpsNotFoundError,
  EntitlementOpsService,
  EntitlementOpsValidationError,
} from './entitlement-ops.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/commerce')
export class EntitlementOpsController {
  constructor(@Inject(EntitlementOpsService) private readonly ops: EntitlementOpsService) {}

  @Get('entitlements/lookup')
  @ApiOperation({
    summary: '按昵称、脱敏手机、openId 或 userId 查找用户',
    description: '精确匹配 userId 与 openId，昵称和脱敏手机为包含匹配。响应里的 openId 已掩码。',
  })
  lookup(@Query('q') q?: string, @Query('limit') limit?: string) {
    return this.run(() => this.ops.lookup(q, limit));
  }

  @Get('audit')
  @ApiOperation({
    summary: '商业化审计列表',
    description: '只读。默认只列 commerce. 前缀。没有更新或删除接口。',
  })
  audit(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('actor') actor?: string,
    @Query('actionPrefix') actionPrefix?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.run(() =>
      this.ops.listAudit({ page, pageSize, actor, actionPrefix, userId, from, to }),
    );
  }

  @Get('entitlements/:userId')
  @ApiOperation({
    summary: '用户权益详情',
    description: '允许懒日切。会员到期只读。余额来自账本，没有直接改余额的字段。',
  })
  detail(@Param('userId') userId: string) {
    return this.run(() => this.ops.detail(userId));
  }

  @Post('entitlements/:userId/grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '补发场次到跨日库存并记审计',
    description: 'bucket 只能是 inventory。原因必填。相同 idempotencyKey 不重复入账。',
  })
  grant(@CurrentAdmin() admin: AdminSummary, @Param('userId') userId: string, @Body() body: unknown) {
    return this.run(() => this.ops.grant(userId, body, admin.username));
  }

  @Post('entitlements/:userId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '作废库存批次或待发放并记审计',
    description: '整单事务。日免和当日任务奖不能作废。原因必填。',
  })
  revoke(@CurrentAdmin() admin: AdminSummary, @Param('userId') userId: string, @Body() body: unknown) {
    return this.run(() => this.ops.revoke(userId, body, admin.username));
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof EntitlementOpsValidationError) {
        throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof EntitlementOpsNotFoundError) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof EntitlementAdminError) {
        throw new ApiException(
          error.kind === 'not_found' ? HttpStatus.NOT_FOUND : HttpStatus.CONFLICT,
          error.kind === 'not_found' ? ApiErrorCode.NOT_FOUND : ApiErrorCode.ENTITLEMENT_CONFLICT,
          error.message,
        );
      }
      if (error instanceof EntitlementFlowError) {
        if (error.code === 'ENTITLEMENT_EXHAUSTED') {
          throw new ApiException(
            HttpStatus.PAYMENT_REQUIRED,
            ApiErrorCode.ENTITLEMENT_EXHAUSTED,
            error.message,
            error.details,
          );
        }
        throw new ApiException(HttpStatus.CONFLICT, ApiErrorCode.ENTITLEMENT_CONFLICT, error.message);
      }
      rethrowDatabaseError('admin-entitlement', error);
    }
  }
}
