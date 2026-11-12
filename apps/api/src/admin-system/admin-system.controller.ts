import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorCode,
  parseAdminRoleMatrixWrite,
  parseDataRetentionWrite,
  parseRetentionPreviewBody,
  parseSystemAuditQuery,
  type AdminSummary,
} from '@tishuashua/shared';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { AdminSystemService } from './admin-system.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/system')
export class AdminSystemController {
  constructor(@Inject(AdminSystemService) private readonly system: AdminSystemService) {}

  @Get('roles')
  @ApiOperation({
    summary: '读取角色矩阵',
    description: '没有配置行时返回默认矩阵。本期不按矩阵拒写，也不改变登录。',
  })
  getRoles() {
    return this.system.getRoles();
  }

  @Put('roles')
  @ApiOperation({
    summary: '保存角色矩阵',
    description: '全量替换。未知能力键或非法枚举返回 400。不提供封禁 API，user.ban 只保存在矩阵里。',
  })
  putRoles(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    const parsed = parseAdminRoleMatrixWrite(body);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.system.putRoles(parsed.value, admin.username);
  }

  @Get('audit')
  @ApiOperation({
    summary: '全站操作审计',
    description: '只读 admin_audit_logs。actionPrefix 默认空，表示全部。分页默认 20，上限 100。',
  })
  listAudit(@Query() query: Record<string, unknown>) {
    const parsed = parseSystemAuditQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.system.listAudit(parsed.value);
  }

  @Get('retention')
  @ApiOperation({
    summary: '读取数据保留周期',
    description: '默认 90/90。练习记录与错题暂不自动删除。',
  })
  getRetention() {
    return this.system.getRetention();
  }

  @Put('retention')
  @ApiOperation({
    summary: '保存数据保留周期',
    description: '只接受两类天数，整数 1 到 3650。未知键或练习记录/错题清理键返回 400。',
  })
  putRetention(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    const parsed = parseDataRetentionWrite(body);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.system.putRetention(parsed.value, admin.username);
  }

  @Post('retention/preview')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '预览将删除的范围',
    description: '只计不删。请求体可临时给出两类天数，不写回配置。到期定义为 created_at 早于 now 减去天数。',
  })
  async previewRetention(@Body() body: unknown) {
    const current = await this.system.getRetention();
    const parsed = parseRetentionPreviewBody(body, current);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.system.previewRetention(parsed.value);
  }
}
