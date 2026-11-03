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
import { ApiErrorCode, QUIZ_MODES } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminScoreQuery } from './admin-certificates.query';
import { AdminScoreService } from './admin-score.service';
import { AdminScoreDetailDto, AdminScoreListDto } from './dto/admin-score.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/scores')
export class AdminScoreController {
  constructor(@Inject(AdminScoreService) private readonly scores: AdminScoreService) {}

  @Get()
  @ApiOperation({
    summary: '后管已交卷成绩列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。全站 status=submitted，按交卷时间从新到旧分页。可按 userId、certId、domainId、mode 和交卷时间筛选。不改成绩、不删会话。不是 GET /api/quiz/sessions，也不是 GET /api/certificates/scores。',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'certId', required: false })
  @ApiQuery({ name: 'domainId', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', ...QUIZ_MODES] })
  @ApiQuery({ name: 'submittedFrom', required: false, description: '交卷时间下界，含该时刻' })
  @ApiQuery({ name: 'submittedTo', required: false, description: '交卷时间上界，含该时刻' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminScoreListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminScoreQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.scores.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管已交卷成绩详情',
    description:
      '只读。id 是 quiz_sessions.id。返回成绩摘要和错题、未作答、少选计数，不含题目。未交卷或不存在时 404。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminScoreDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.scores.get(id);
  }
}
