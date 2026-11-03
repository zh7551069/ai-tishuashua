import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { UserSummaryDto } from '../auth/dto/user-summary.dto';
import { CurrentUser } from '../common/current-user';
import { parseDto } from '../common/parse-dto';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { BindWechatPhoneDto } from './dto/bind-wechat-phone.dto';
import { WechatPhoneService } from './wechat-phone.service';

@ApiTags('user')
@Controller('users')
export class UserController {
  constructor(@Inject(WechatPhoneService) private readonly phones: WechatPhoneService) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '当前用户',
    description:
      '需要微信登录签发的 Bearer token。phoneBound 表示是否已授权手机号，phoneMasked 只含脱敏号码。',
  })
  @ApiOkResponse({ type: UserSummaryDto })
  me(@CurrentUser() user: UserSummary): UserSummary {
    return user;
  }

  @Post('me/phone')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '绑定微信手机号',
    description:
      '在已有微信会话下，用 getPhoneNumber 的 code 向微信换手机号，只把脱敏号码写入当前用户。不是短信登录，也不签发新会话。',
  })
  @ApiBody({ type: BindWechatPhoneDto })
  @ApiOkResponse({ type: UserSummaryDto })
  async bindPhone(@CurrentUser() user: UserSummary, @Body() body: unknown): Promise<UserSummary> {
    const dto = await parseDto(BindWechatPhoneDto, body);
    return this.phones.bind(user.id, dto.code);
  }
}
