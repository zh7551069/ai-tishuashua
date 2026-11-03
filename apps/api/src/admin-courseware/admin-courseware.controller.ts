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
import { ApiErrorCode, EXTRACT_JOB_STATUSES } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { ApiException } from '../common/api.exception';
import { parseAdminCoursewareQuery } from './admin-courseware.query';
import { AdminCoursewareService } from './admin-courseware.service';
import { AdminCoursewareDetailDto, AdminCoursewareListDto } from './dto/admin-courseware.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/courseware')
export class AdminCoursewareController {
  constructor(
    @Inject(AdminCoursewareService) private readonly courseware: AdminCoursewareService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管课件上传列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。默认 status=all，按最近更新从新到旧分页。可按 userId、certId、status 筛选。不重新上传、不取消任务、不改提炼配额。',
  })
  @ApiQuery({ name: 'status', required: false, enum: ['all', ...EXTRACT_JOB_STATUSES] })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'certId', required: false })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminCoursewareListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminCoursewareQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.courseware.list(parsed.query);
  }

  @Get(':id')
  @ApiOperation({
    summary: '后管课件上传详情',
    description:
      '只读。id 是上传 id。返回提炼进度、草稿、错误和已写回的知识点 id。不返回对象存储键。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminCoursewareDetailDto })
  getOne(@Param('id', uuid) id: string) {
    return this.courseware.get(id);
  }
}
