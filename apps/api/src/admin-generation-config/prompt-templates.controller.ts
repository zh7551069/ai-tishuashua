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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorCode, type AdminSummary } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { ApiException } from '../common/api.exception';
import { runGenerationConfig } from './generation-config.http';
import { parseIncludeBody, parsePromptListQuery } from './prompt-templates.query';
import { PromptTemplateService } from './prompt-templates.service';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/prompt-templates')
export class PromptTemplateController {
  constructor(@Inject(PromptTemplateService) private readonly prompts: PromptTemplateService) {}

  @Get('stats')
  @ApiOperation({
    summary: '待发布草稿统计',
    description: 'pendingDraftCount 给工作台。从未发布，或已发布但工作草稿和当前快照不同，都算待发布。',
  })
  stats() {
    return runGenerationConfig('prompt-templates', () => this.prompts.stats());
  }

  @Get()
  @ApiOperation({
    summary: 'Prompt 模板列表',
    description: '不回传模板正文。可按 scope、status、name/code 筛选。分页默认 20，上限 100。',
  })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parsePromptListQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return runGenerationConfig('prompt-templates', () => this.prompts.list(parsed.value));
  }

  @Post()
  @ApiOperation({
    summary: '创建 Prompt 草稿',
    description: '初始 status=draft、version=0。code 创建后不可改。不提供试出题。',
  })
  create(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    return runGenerationConfig('prompt-templates', () => this.prompts.create(body, admin.username));
  }

  @Get(':id/versions')
  @ApiOperation({
    summary: 'Prompt 已发布版本列表',
    description: '默认不回正文。includeBody=true 才返回该版 templates。旧版本行不可改。',
  })
  versions(@Param('id', uuid) id: string, @Query() query: Record<string, unknown>) {
    const parsed = parseIncludeBody(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return runGenerationConfig('prompt-templates', () => this.prompts.versions(id, parsed.value));
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '发布 Prompt 为新版本',
    description: 'INSERT 新的 prompt_template_versions，不改旧版本行。未知占位符 400。锁定中 400。',
  })
  publish(@CurrentAdmin() admin: AdminSummary, @Param('id', uuid) id: string) {
    return runGenerationConfig('prompt-templates', () => this.prompts.publish(id, admin.username));
  }

  @Post(':id/rollback')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '把历史版本复制为新版本',
    description: '新增 max+1，内容等于指定版本。不改旧行，也不把当前指针直接倒回旧号。',
  })
  rollback(
    @CurrentAdmin() admin: AdminSummary,
    @Param('id', uuid) id: string,
    @Body() body: unknown,
  ) {
    return runGenerationConfig('prompt-templates', () =>
      this.prompts.rollback(id, body, admin.username),
    );
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '锁定模板。锁定后不能保存草稿、发布或回滚。' })
  lock(@CurrentAdmin() admin: AdminSummary, @Param('id', uuid) id: string) {
    return runGenerationConfig('prompt-templates', () =>
      this.prompts.setLocked(id, true, admin.username),
    );
  }

  @Post(':id/unlock')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '解锁模板。' })
  unlock(@CurrentAdmin() admin: AdminSummary, @Param('id', uuid) id: string) {
    return runGenerationConfig('prompt-templates', () =>
      this.prompts.setLocked(id, false, admin.username),
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Prompt 模板详情，含工作草稿。出题仍只读已发布快照。' })
  getOne(@Param('id', uuid) id: string) {
    return runGenerationConfig('prompt-templates', () => this.prompts.get(id));
  }

  @Put(':id')
  @ApiOperation({
    summary: '保存 Prompt 草稿',
    description: '不改已发布快照。锁定中拒绝。已发布后不能改 code、scope、scopeRefId。',
  })
  save(@CurrentAdmin() admin: AdminSummary, @Param('id', uuid) id: string, @Body() body: unknown) {
    return runGenerationConfig('prompt-templates', () => this.prompts.save(id, body, admin.username));
  }
}
