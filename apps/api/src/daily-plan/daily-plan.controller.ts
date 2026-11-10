import { Controller, Get, HttpException, HttpStatus, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type UserSummary } from '@tishuashua/shared';
import { ApiException, logServerError } from '../common/api.exception';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { DailyPlanService } from './daily-plan.service';

@ApiTags('daily-plan')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('me/daily-plan')
export class DailyPlanController {
  constructor(@Inject(DailyPlanService) private readonly plans: DailyPlanService) {}

  @Get()
  @ApiOperation({
    summary: '今日练习计划',
    description:
      '必须登录。businessDate 与权益 ensureDay 同一套 Asia/Shanghai 日历日。v1 不接受 ?date=，即使带上也会忽略，仍返回今天。empty 表示 0 个刷题包。summary 只把可用包计入分母。周条 hasCompletion 只看每日计划完成表，不看签到。未预期失败为 500 INTERNAL_ERROR。',
  })
  @ApiOkResponse({ description: 'DailyPlanView' })
  async me(@CurrentUser() user: UserSummary) {
    try {
      return await this.plans.get(user.id);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      logServerError('daily-plan', error);
      throw new ApiException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        ApiErrorCode.INTERNAL_ERROR,
        '加载每日计划失败',
      );
    }
  }
}
