import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder } from '@tishuashua/shared';
import { WechatLoginDto } from './dto/wechat-login.dto';

@ApiTags('auth')
@Controller('auth/wechat')
export class WechatAuthController {
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '微信登录（占位）',
    description: '后续用 code 向微信换会话，并把会话放在 Redis。本期不实现。',
  })
  login(@Body() _body: WechatLoginDto) {
    return scaffoldPlaceholder('auth', 'wechatLogin');
  }
}
