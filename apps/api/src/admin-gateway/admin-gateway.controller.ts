import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminLogoutResponse, AdminPingResponse, AdminSummary } from '@tishuashua/shared';
import { parseDto } from '../common/parse-dto';
import { SessionService } from '../session/session.service';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard, PublicAdmin, type AdminRequest } from './admin-session.guard';
import { CurrentAdmin } from './current-admin';
import { AdminLoginDto } from './dto/admin-login.dto';
import {
  AdminLoginResponseDto,
  AdminLogoutResponseDto,
  AdminPingResponseDto,
} from './dto/admin-session.dto';

@ApiTags('admin')
@Controller('admin')
@UseGuards(AdminSessionGuard)
export class AdminGatewayController {
  constructor(
    @Inject(AdminLoginService) private readonly adminLogin: AdminLoginService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Post('login')
  @PublicAdmin()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '管理后台帐密登录',
    description:
      '独立于微信登录。校验 ADMIN_USERNAME / ADMIN_PASSWORD 后，在 Redis 签发不透明 token。未配置时返回 ADMIN_NOT_CONFIGURED。',
  })
  @ApiBody({ type: AdminLoginDto })
  @ApiOkResponse({ type: AdminLoginResponseDto })
  async login(@Body() body: unknown): Promise<AdminLoginResponseDto> {
    const dto = await parseDto(AdminLoginDto, body);
    return this.adminLogin.login(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '注销后管会话',
    description: '删除当前后管 token。微信用户 token 不能调用，也不会被删掉。',
  })
  @ApiOkResponse({ type: AdminLogoutResponseDto })
  async logout(@Req() request: AdminRequest): Promise<AdminLogoutResponse> {
    await this.sessions.revokeAdmin(request.adminToken);
    return { ok: true };
  }

  @Get('ping')
  @ApiBearerAuth()
  @ApiOperation({
    summary: '管理端连通性',
    description: '需要后管会话。缺少会话、失效会话和微信用户 token 都返回 UNAUTHORIZED。',
  })
  @ApiOkResponse({ type: AdminPingResponseDto })
  ping(@CurrentAdmin() admin: AdminSummary): AdminPingResponse {
    return { ok: true, admin };
  }
}
