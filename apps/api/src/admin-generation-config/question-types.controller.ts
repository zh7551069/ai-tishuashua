import { Body, Controller, Get, Inject, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { QUESTION_TYPE_CODE_PATTERN, type AdminSummary } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { runGenerationConfig } from './generation-config.http';
import { GenerationConfigValidationError } from './generation-config.errors';
import { QuestionTypeService } from './question-types.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/question-types')
export class QuestionTypeController {
  constructor(@Inject(QuestionTypeService) private readonly types: QuestionTypeService) {}

  @Get()
  @ApiOperation({
    summary: '题型列表',
    description: '含未启用题型。rendererSupported 表示 appRendererKey 是否在本期 single/multi/judge 集合内。',
  })
  list() {
    return runGenerationConfig('question-types', () => this.types.list());
  }

  @Post()
  @ApiOperation({
    summary: '登记题型',
    description: 'enabled 默认 false。创建时启用未登记渲染器返回 400。code 写入后不可改。',
  })
  create(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    return runGenerationConfig('question-types', () => this.types.create(body, admin.username));
  }

  @Put(':code')
  @ApiOperation({
    summary: '修改题型',
    description: '可改 name、enabled、sortOrder、gradingRuleBrief、optionStructure。请求体里的 code 与路径不一致返回 400。',
  })
  update(@CurrentAdmin() admin: AdminSummary, @Param('code') code: string, @Body() body: unknown) {
    if (!QUESTION_TYPE_CODE_PATTERN.test(code)) {
      return runGenerationConfig('question-types', async () => {
        throw new GenerationConfigValidationError('题型 code不正确');
      });
    }
    return runGenerationConfig('question-types', () => this.types.update(code, body, admin.username));
  }
}
