import { Body, Controller, Get, HttpStatus, Inject, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, SettingsCacheError, type AdminSummary } from '@tishuashua/shared';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseDto } from '../common/parse-dto';
import { FreeUserBankFirstDto, UpdateFreeUserBankFirstDto } from './dto/free-user-bank-first.dto';
import { SystemSettingsService } from './system-settings.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/system-settings')
export class SystemSettingsController {
  constructor(@Inject(SystemSettingsService) private readonly settings: SystemSettingsService) {}

  @Get('freeUserBankFirst')
  @ApiOperation({
    summary: '读取免费用户题库优先开关',
    description:
      '后管会话。微信用户 token 返回 UNAUTHORIZED。没有配置行时 enabled 为 false。不向小程序下发。',
  })
  @ApiOkResponse({ type: FreeUserBankFirstDto })
  getFreeUserBankFirst(): Promise<FreeUserBankFirstDto> {
    return this.settings.getFreeUserBankFirst();
  }

  @Put('freeUserBankFirst')
  @ApiOperation({
    summary: '更新免费用户题库优先开关',
    description:
      '只接受 { enabled: boolean }。写入后删除缓存键 sysset:freeUserBankFirst。缓存删除失败返回 REDIS_UNAVAILABLE，数据库里的新值仍然保留，可以再 PUT 一次。',
  })
  @ApiBody({ type: UpdateFreeUserBankFirstDto })
  @ApiOkResponse({ type: FreeUserBankFirstDto })
  async putFreeUserBankFirst(
    @CurrentAdmin() admin: AdminSummary,
    @Body() body: unknown,
  ): Promise<FreeUserBankFirstDto> {
    const dto = await parseDto(UpdateFreeUserBankFirstDto, body);
    try {
      return await this.settings.putFreeUserBankFirst(dto.enabled, admin.username);
    } catch (error) {
      if (error instanceof SettingsCacheError) {
        throw new ApiException(
          HttpStatus.SERVICE_UNAVAILABLE,
          ApiErrorCode.REDIS_UNAVAILABLE,
          'Redis 不可用',
        );
      }
      throw error;
    }
  }
}
