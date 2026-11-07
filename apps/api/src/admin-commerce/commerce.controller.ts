import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type AdminSummary } from '@tishuashua/shared';
import { SettingsCacheError } from '@tishuashua/shared/commerce';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { ApiException } from '../common/api.exception';
import { isPgCode, rethrowDatabaseError } from '../common/database-error';
import {
  CommerceConflictError,
  CommerceNotFoundError,
  CommerceService,
  CommerceValidationError,
} from './commerce.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/commerce')
export class CommerceController {
  constructor(@Inject(CommerceService) private readonly commerce: CommerceService) {}

  @Get('quota')
  @ApiOperation({
    summary: '读取全局配额',
    description:
      '后管会话。会员日上限 uiLocked 恒为 true，没有写字段。时区、清零说明和扣场顺序是服务端常量。',
  })
  getQuota() {
    return this.run(() => this.commerce.getQuota());
  }

  @Put('quota')
  @ApiOperation({
    summary: '保存全局配额并记审计',
    description:
      '只接受 dailyFreeSessions 与 refineLifetimeLimitFree。改日免不回溯当日已发放余额。写入后删除短缓存。',
  })
  putQuota(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    return this.run(() => this.commerce.putQuota(body, admin.username));
  }

  @Post('quota/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '配额恢复默认 2 / 1，并记审计' })
  resetQuota(@CurrentAdmin() admin: AdminSummary) {
    return this.run(() => this.commerce.resetQuota(admin.username));
  }

  @Get('growth')
  @ApiOperation({ summary: '读取增长任务配置。没有配置行时返回默认包。' })
  getGrowth() {
    return this.run(() => this.commerce.getGrowth());
  }

  @Put('growth')
  @ApiOperation({
    summary: '全量保存增长配置并记审计',
    description: '必须是完整对象。未知字段或缺少字段返回 VALIDATION_ERROR。本接口不发放场次。',
  })
  putGrowth(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    return this.run(() => this.commerce.putGrowth(body, admin.username));
  }

  @Post('growth/reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '增长配置恢复默认包，并记审计' })
  resetGrowth(@CurrentAdmin() admin: AdminSummary) {
    return this.run(() => this.commerce.resetGrowth(admin.username));
  }

  @Get('skus')
  @ApiOperation({ summary: '权益 SKU 列表。可按 type、status 筛选，不分页。' })
  listSkus(@Query('type') type?: string, @Query('status') status?: string) {
    return this.run(() => this.commerce.listSkuQuery(type, status));
  }

  @Get('skus/:code')
  @ApiOperation({ summary: '权益 SKU 详情' })
  getSku(@Param('code') code: string) {
    return this.run(() => this.commerce.getSkuByCode(code));
  }

  @Post('skus')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '新建权益 SKU。code 唯一，创建后不可改。' })
  createSku(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    return this.run(() => this.commerce.createSku(body, admin.username));
  }

  @Put('skus/:code')
  @ApiOperation({
    summary: '更新权益 SKU 并记审计',
    description: '请求体不能包含 code 或 type。改价不影响已有快照；本接口不写订单。',
  })
  updateSku(@CurrentAdmin() admin: AdminSummary, @Param('code') code: string, @Body() body: unknown) {
    return this.run(() => this.commerce.updateSkuByCode(code, body, admin.username));
  }

  @Post('skus/:code/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '停用 SKU。已购权益不在本接口处理。' })
  disableSku(@CurrentAdmin() admin: AdminSummary, @Param('code') code: string) {
    return this.run(() => this.commerce.setEnabled(code, false, admin.username));
  }

  @Post('skus/:code/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '重新启用 SKU' })
  enableSku(@CurrentAdmin() admin: AdminSummary, @Param('code') code: string) {
    return this.run(() => this.commerce.setEnabled(code, true, admin.username));
  }

  private run<T>(fn: () => Promise<T>): Promise<T> {
    return fn().catch((error: unknown) => {
      if (error instanceof CommerceValidationError || isPgCode(error, '23514')) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          ApiErrorCode.VALIDATION_ERROR,
          error instanceof CommerceValidationError ? error.message : 'SKU 字段与类型不匹配',
        );
      }
      if (error instanceof CommerceNotFoundError) {
        throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, error.message);
      }
      if (error instanceof CommerceConflictError) {
        throw new ApiException(HttpStatus.CONFLICT, ApiErrorCode.VALIDATION_ERROR, error.message);
      }
      if (error instanceof SettingsCacheError) {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ApiErrorCode.REDIS_UNAVAILABLE,
          'Redis 不可用',
        );
      }
      rethrowDatabaseError('commerce', error);
    });
  }
}
