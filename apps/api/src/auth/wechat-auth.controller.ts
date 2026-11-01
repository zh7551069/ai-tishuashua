import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { parseDto } from '../common/parse-dto';
import { WechatLoginResponseDto } from './dto/user-summary.dto';
import { WechatLoginDto } from './dto/wechat-login.dto';
import { WechatLoginService } from './wechat-login.service';

@ApiTags('auth')
@Controller('auth/wechat')
export class WechatAuthController {
  constructor(@Inject(WechatLoginService) private readonly wechatLogin: WechatLoginService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '微信登录',
    description:
      '用小程序 wx.login 的 code 调用微信 jscode2session，按 openId 注册或登录，并在 Redis 签发会话。没有 AppId/Secret 且未打开 WECHAT_LOGIN_MOCK 时返回 WECHAT_NOT_CONFIGURED。',
  })
  @ApiBody({ type: WechatLoginDto })
  @ApiOkResponse({ type: WechatLoginResponseDto })
  async login(@Body() body: unknown) {
    const dto = await parseDto(WechatLoginDto, body);
    return this.wechatLogin.login(dto);
  }
}
