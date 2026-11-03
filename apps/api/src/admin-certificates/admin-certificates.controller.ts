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
import { parseAdminCertificateQuery } from './admin-certificates.query';
import { AdminCertificateService } from './admin-certificates.service';
import {
  AdminCertificateScoreDetailDto,
  AdminCertificateScoreListDto,
} from './dto/admin-certificates.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/certificates')
export class AdminCertificateController {
  constructor(
    @Inject(AdminCertificateService) private readonly certificates: AdminCertificateService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管证书与成绩列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。只含已交卷的 quiz_sessions，按交卷时间从新到旧分页。可按 userId、certId、mode 筛选。不改成绩、不删证书、不消灭错题。不是 GET /api/certificates，也不是 GET /api/certificates/scores。',
  })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', ...QUIZ_MODES] })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'certId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminCertificateScoreListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminCertificateQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.certificates.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管证书与成绩详情',
    description:
      '只读。id 是已交卷的 quiz_sessions.id。返回当时写入的分数和题目快照，不重新判分。未交卷或不存在返回 NOT_FOUND。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminCertificateScoreDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.certificates.get(id);
  }
}
