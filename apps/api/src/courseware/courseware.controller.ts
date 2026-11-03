import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { COURSEWARE_MAX_BYTES, JOB_EXTRACT_COURSEWARE, type UserSummary } from '@tishuashua/shared';
import type { Request } from 'express';
import { CurrentUser } from '../common/current-user';
import { parseDto } from '../common/parse-dto';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { CoursewareService } from './courseware.service';
import { CommitExtractDto, CommitExtractResultDto } from './dto/courseware.dto';
import { readCoursewareMultipart } from './multipart';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('courseware')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('courseware')
export class CoursewareController {
  constructor(@Inject(CoursewareService) private readonly courseware: CoursewareService) {}

  @Post('uploads')
  @HttpCode(HttpStatus.CREATED)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: '上传课件并登记提炼任务',
    description: `支持 PPT、PPTX、PDF、DOC、DOCX，单文件不超过 ${COURSEWARE_MAX_BYTES} 字节。文件写入对象存储后投递 ${JOB_EXTRACT_COURSEWARE}。未配置模型且未打开 LLM_MOCK 时返回 LLM_NOT_CONFIGURED，不落库。关闭页面不会取消任务。`,
  })
  @ApiCreatedResponse({ description: '提炼任务，初始 stage 为 uploading' })
  async upload(@CurrentUser() user: UserSummary, @Req() req: Request) {
    const file = await readCoursewareMultipart(req);
    return this.courseware.createUpload(user.id, file);
  }

  @Get('jobs/:id')
  @ApiOperation({
    summary: '提炼进度',
    description:
      'pending / running 时看 stage 与 progress。succeeded 返回可勾选草稿。失败带 error.code。',
  })
  getOne(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.courseware.get(user.id, id);
  }

  @Post('jobs/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '取消提炼',
    description:
      '仅 pending 或 running 可取消。已经在跑的模型请求会在当前阶段结束后停住，不写草稿。',
  })
  cancel(@CurrentUser() user: UserSummary, @Param('id', uuid) id: string) {
    return this.courseware.cancel(user.id, id);
  }

  @Post('jobs/:id/commit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '把勾选的知识点加入证书树',
    description:
      '写入当前用户在该证书下的「我的课件」。可选 packId，把这些知识点并进已有刷题包。其他用户看不到。',
  })
  @ApiBody({ type: CommitExtractDto })
  @ApiOkResponse({ type: CommitExtractResultDto })
  async commit(
    @CurrentUser() user: UserSummary,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(CommitExtractDto, body);
    return this.courseware.commit(user.id, id, dto.draftIds, dto.packId);
  }
}
