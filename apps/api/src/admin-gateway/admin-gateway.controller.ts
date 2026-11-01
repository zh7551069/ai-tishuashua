import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder } from '@tishuashua/shared';
import { AdminLoginDto } from './dto/admin-login.dto';

@ApiTags('admin')
@Controller('admin')
export class AdminGatewayController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '管理后台帐密登录（占位）',
    description: '与微信登录分离。不校验账号，也不签发会话。',
  })
  login(@Body() _body: AdminLoginDto) {
    return scaffoldPlaceholder('admin-gateway', 'login');
  }

  @Get('ping')
  @ApiOperation({ summary: '管理端连通性（占位）' })
  ping() {
    return scaffoldPlaceholder('admin-gateway', 'ping');
  }
}
