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
import { ApiErrorCode } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminWrongBookQuery } from './admin-wrong-book.query';
import { AdminWrongBookService } from './admin-wrong-book.service';
import { AdminWrongBookDetailDto, AdminWrongBookListDto } from './dto/admin-wrong-book.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/wrong-book')
export class AdminWrongBookController {
  constructor(@Inject(AdminWrongBookService) private readonly book: AdminWrongBookService) {}

  @Get()
  @ApiOperation({
    summary: '后管错题列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。默认 status=all，按更新时间从新到旧分页。可按 userId、certId 筛选。不提供消灭或删除。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['pending', 'cleared', 'all'] })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'certId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminWrongBookListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminWrongBookQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.book.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管错题详情',
    description:
      '只读。返回题干、选项、正确答案、解析、分值和知识点 id。不限本人。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminWrongBookDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.book.get(id);
  }
}
