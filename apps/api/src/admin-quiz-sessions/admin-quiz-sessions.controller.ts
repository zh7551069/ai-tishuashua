import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ADMIN_QUIZ_SESSION_STATUSES, ApiErrorCode, QUIZ_MODES } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminQuizSessionQuery } from './admin-quiz-sessions.query';
import { AdminQuizSessionService } from './admin-quiz-sessions.service';
import { AdminQuizSessionDetailDto, AdminQuizSessionListDto } from './dto/admin-quiz-sessions.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/quiz-sessions')
export class AdminQuizSessionController {
  constructor(
    @Inject(AdminQuizSessionService) private readonly sessions: AdminQuizSessionService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管出题会话列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。只含未交卷的 quiz_sessions，按创建时间从新到旧分页。可按 userId、mode、status 筛选。不看出题结果、题目、答案和分数。已交卷请用 GET /api/admin/certificates。不是 GET /api/quiz/sessions。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['all', ...ADMIN_QUIZ_SESSION_STATUSES] })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', ...QUIZ_MODES] })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminQuizSessionListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminQuizSessionQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.sessions.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管出题会话详情',
    description:
      '只读。id 是未交卷的 quiz_sessions.id。返回进度、错误和能读出的出题设置，不返回题目、答案、分数或 run_token。已交卷或不存在返回 NOT_FOUND。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminQuizSessionDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.sessions.get(id);
  }
}
