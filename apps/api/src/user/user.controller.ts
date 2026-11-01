import {
  Controller,
  createParamDecorator,
  Get,
  UseGuards,
  type ExecutionContext,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { UserSummaryDto } from '../auth/dto/user-summary.dto';
import { SessionAuthGuard, type AuthenticatedRequest } from '../session/session-auth.guard';

const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): UserSummary => {
  return context.switchToHttp().getRequest<AuthenticatedRequest>().user;
});

@ApiTags('user')
@Controller('users')
export class UserController {
  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '当前用户', description: '需要微信登录签发的 Bearer token。' })
  @ApiOkResponse({ type: UserSummaryDto })
  me(@CurrentUser() user: UserSummary): UserSummary {
    return user;
  }
}
