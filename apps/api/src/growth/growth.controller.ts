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
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { GrowthService } from './growth.service';

@ApiTags('growth')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('me/growth')
export class GrowthController {
  constructor(@Inject(GrowthService) private readonly growth: GrowthService) {}

  @Get()
  @ApiOperation({
    summary: '增长任务聚合态',
    description:
      '返回今日签到/分享、邀请码、邀请人封顶进度和 growthConfig 快照。奖额与封顶来自配置，不在客户端写死。',
  })
  @ApiOkResponse({ description: 'GrowthView' })
  view(@CurrentUser() user: UserSummary) {
    return this.growth.view(user.id);
  }

  @Post('checkin')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '每日签到领场',
    description:
      '奖入 daily_task，幂等键 checkin:{userId}:{bizDate}。重复请求 200 且 applied 为 false。关闭时 403 GROWTH_DISABLED。',
  })
  @ApiOkResponse({ description: 'GrowthCheckinResult' })
  checkin(@CurrentUser() user: UserSummary) {
    return this.growth.checkin(user.id);
  }

  @Post('share/token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '领取今日分享 token',
    description: '同一分享者同一业务日返回同一个 token。空点分享不会发奖。',
  })
  shareToken(@CurrentUser() user: UserSummary) {
    return this.growth.shareToken(user.id);
  }

  @Post('share/open')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '被分享者上报冷启动打开',
    description:
      '校验通过后给分享者发 daily_task。会员分享者不发场次也不发提炼次。不给打开者发分享奖。',
  })
  shareOpen(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    return this.growth.shareOpen(user.id, body);
  }

  @Post('invite/bind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '绑定邀请人',
    description:
      '对外使用 inviteCode。一人一个邀请人，禁止自邀。邀请人超额写入 entitlement_pending_grants，不自动发放。',
  })
  bind(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    return this.growth.bindInvite(user.id, body);
  }
}
