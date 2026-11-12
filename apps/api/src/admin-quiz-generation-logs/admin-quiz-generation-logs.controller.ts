import { Controller, Get, Header, HttpStatus, Inject, Param, ParseUUIDPipe, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiProduces, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode } from '@tishuashua/shared';
import type { Response } from 'express';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import {
  parseQuizGenerationLogQuery,
  parseQuizGenerationStatsQuery,
} from './admin-quiz-generation-logs.query';
import { AdminQuizGenerationLogService } from './admin-quiz-generation-logs.service';
import {
  AdminQuizGenerationLogDetailDto,
  AdminQuizGenerationLogListDto,
  AdminQuizGenerationLogStatsDto,
} from './dto/admin-quiz-generation-logs.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/quiz-generation-logs')
export class AdminQuizGenerationLogController {
  constructor(
    @Inject(AdminQuizGenerationLogService) private readonly logs: AdminQuizGenerationLogService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管出题日志列表',
    description:
      '只读 quiz_generation_logs。不回传 Prompt 正文。回落内置用 usedBuiltin 表示，不是失败原因。',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'success', required: false, enum: ['all', 'true', 'false'] })
  @ApiQuery({ name: 'usedBuiltin', required: false, enum: ['all', 'true', 'false'] })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiQuery({ name: 'errorCode', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminQuizGenerationLogListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseQuizGenerationLogQuery(query, 'list');
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.logs.list(parsed.query);
  }

  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: '导出出题日志 CSV',
    description: 'from 和 to 必填，上海自然日跨度不超过 31 天。超过 10000 行返回 400。不含 Prompt 正文。',
  })
  async exportCsv(@Query() query: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const parsed = parseQuizGenerationLogQuery(query, 'export');
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    res.setHeader('Content-Disposition', 'attachment; filename="quiz-generation-logs.csv"');
    return this.logs.exportCsv(parsed.query);
  }

  @Get('stats')
  @ApiOperation({
    summary: '近 N 日出题失败率',
    description:
      'days 默认 7，只允许 1 到 31。分母是尝试次数。success=false 才计入分子。回落内置且出题成功不算失败。没有尝试时 failureRate 为 null。',
  })
  @ApiQuery({ name: 'days', required: false })
  @ApiOkResponse({ type: AdminQuizGenerationLogStatsDto })
  stats(@Query() query: Record<string, unknown>) {
    const parsed = parseQuizGenerationStatsQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.logs.stats(parsed.stats.days, parsed.stats.since);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管出题日志详情',
    description: '含 requestSummary 和已截断的 errorMessage。不返回 Prompt 正文和模型密钥。',
  })
  @ApiOkResponse({ type: AdminQuizGenerationLogDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.logs.get(id);
  }
}
