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
import { ADMIN_QUESTION_BANK_RANGES, ApiErrorCode } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminQuestionBankQuery } from './admin-question-bank.query';
import { AdminQuestionBankService } from './admin-question-bank.service';
import {
  AdminQuestionBankDetailDto,
  AdminQuestionBankListDto,
} from './dto/admin-question-bank.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

/** 只读。没有 POST / PUT / PATCH / DELETE。 */
@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/question-bank')
export class AdminQuestionBankController {
  constructor(@Inject(AdminQuestionBankService) private readonly bank: AdminQuestionBankService) {}

  @Get()
  @ApiOperation({
    summary: '后管题库只读列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。默认 range=30d，按入库时间从新到旧分页。可按 domainId、certificateId、knowledgePointId（别名 kpId）筛选。包含 online 与 offline，不能改状态。不提供写入。',
  })
  @ApiQuery({ name: 'range', required: false, enum: ADMIN_QUESTION_BANK_RANGES })
  @ApiQuery({ name: 'domainId', required: false })
  @ApiQuery({ name: 'certificateId', required: false })
  @ApiQuery({ name: 'knowledgePointId', required: false })
  @ApiQuery({
    name: 'kpId',
    required: false,
    description: 'knowledgePointId 的别名。两者不一致时 400。',
  })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminQuestionBankListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminQuestionBankQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.bank.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管题库只读详情',
    description: '只读。返回题干、选项、答案和解析。不提供编辑、删除或审核。',
  })
  @ApiOkResponse({ type: AdminQuestionBankDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.bank.get(id);
  }
}
