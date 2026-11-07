import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, isEntitlementDevGrantEnabled, type UserSummary } from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { EntitlementService } from './entitlement.service';

@ApiTags('entitlement')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('me/entitlement')
export class EntitlementController {
  constructor(@Inject(EntitlementService) private readonly entitlement: EntitlementService) {}

  @Get()
  @ApiOperation({
    summary: '当前权益',
    description:
      '返回业务日、会员、日免、任务奖、未过期库存和终身提炼计数。允许顺带做 Asia/Shanghai 懒日切。',
  })
  @ApiOkResponse({ description: 'EntitlementView' })
  me(@CurrentUser() user: UserSummary) {
    return this.entitlement.ensureDay(user.id);
  }

  @Get('ledger')
  @ApiOperation({
    summary: '权益流水',
    description:
      '只追加流水，从新到旧。limit 默认 20，最大 50。cursor 为上一页最后一条。不含支付订单。',
  })
  @ApiOkResponse({ description: 'LedgerPage' })
  ledger(
    @CurrentUser() user: UserSummary,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.entitlement.ledger(user.id, limit, cursor);
  }
}

@ApiTags('entitlement')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('dev/entitlement')
export class EntitlementDevController {
  constructor(@Inject(EntitlementService) private readonly entitlement: EntitlementService) {}

  @Post('grant')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '本地灌权益',
    description:
      '仅测试或本地。生产返回 404。非生产还需 ENTITLEMENT_SEED=1 或 WECHAT_LOGIN_MOCK。不是支付回调。',
  })
  async grant(@CurrentUser() user: UserSummary, @Body() body: unknown) {
    if (!isEntitlementDevGrantEnabled()) {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, 'Not Found');
    }
    return this.entitlement.grant(user.id, body);
  }
}
