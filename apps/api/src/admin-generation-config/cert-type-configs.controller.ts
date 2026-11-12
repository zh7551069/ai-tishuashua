import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AdminSummary } from '@tishuashua/shared';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { CertTypeConfigService } from './cert-type-configs.service';
import { runGenerationConfig } from './generation-config.http';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/certificates/:certificateId/question-type-configs')
export class CertTypeConfigController {
  constructor(@Inject(CertTypeConfigService) private readonly configs: CertTypeConfigService) {}

  @Get()
  @ApiOperation({
    summary: '读取证书题型默认参数',
    description: '独立表。响应里的启用子集只读，本接口不能改 enabledQuestionTypeCodes。',
  })
  getOne(@Param('certificateId', uuid) certificateId: string) {
    return runGenerationConfig('cert-type-configs', () => this.configs.get(certificateId));
  }

  @Put()
  @ApiOperation({
    summary: '全量替换证书题型默认参数',
    description: '写入 cert_question_type_configs。不改证书行，也不改启用子集。',
  })
  replace(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Body() body: unknown,
  ) {
    return runGenerationConfig('cert-type-configs', () =>
      this.configs.replace(certificateId, body, admin.username),
    );
  }
}
