import { Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  COURSEWARE_MAX_BYTES,
  JOB_EXTRACT_COURSEWARE,
  scaffoldPlaceholder,
} from '@tishuashua/shared';

@ApiTags('courseware')
@Controller('courseware')
export class CoursewareController {
  @Get()
  @ApiOperation({ summary: '课件列表（占位）' })
  list() {
    return scaffoldPlaceholder('courseware', 'list');
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '登记课件（占位）',
    description: `对象存储上传尚未实现。大小上限 ${COURSEWARE_MAX_BYTES} 字节（50MB）。后续由队列 ${JOB_EXTRACT_COURSEWARE} 提炼。`,
  })
  create() {
    return scaffoldPlaceholder('courseware', 'create');
  }
}
