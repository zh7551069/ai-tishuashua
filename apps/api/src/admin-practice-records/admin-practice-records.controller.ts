import { Controller, Get, Header, HttpStatus, Inject, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, QUIZ_MODES } from '@tishuashua/shared';
import type { Response } from 'express';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parsePracticeDetailQuery, parsePracticeRecordQuery } from './admin-practice-records.query';
import { AdminPracticeRecordService } from './admin-practice-records.service';
import { AdminPracticeRecordDetailDto, AdminPracticeRecordListDto } from './dto/admin-practice-records.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/practice-records')
export class AdminPracticeRecordController {
  constructor(
    @Inject(AdminPracticeRecordService) private readonly records: AdminPracticeRecordService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管练习记录列表',
    description:
      '只读。数据源是已交卷的 quiz_sessions。默认排除 source=wrongSet，includeWrongSet=true 才可见。不返回题目快照，不能改分。不是 GET /api/admin/certificates，也不是 GET /api/admin/quiz-sessions。',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'mode', required: false, enum: ['all', ...QUIZ_MODES] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'includeWrongSet', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminPracticeRecordListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parsePracticeRecordQuery(query, 'list');
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.records.list(parsed.query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: '导出练习记录 CSV',
    description:
      'from 和 to 必填，上海自然日跨度不超过 31 天。超过 10000 行返回 400。默认仍排除 wrongSet。不含题目快照，不含未脱敏手机和 openId。',
  })
  async exportCsv(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const parsed = parsePracticeRecordQuery(query, 'export');
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    res.setHeader('Content-Disposition', 'attachment; filename="practice-records.csv"');
    return this.records.exportCsv(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管练习记录详情',
    description:
      '只读。未交卷、不存在，或 wrongSet 且未带 includeWrongSet=true，都返回 404。不返回题目快照。',
  })
  @ApiQuery({ name: 'includeWrongSet', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: AdminPracticeRecordDetailDto })
  getOne(@Param('id', uuid) id: string, @Query() query: Record<string, unknown>) {
    const parsed = parsePracticeDetailQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.records.get(id, parsed.includeWrongSet);
  }
}
