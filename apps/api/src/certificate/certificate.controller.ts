import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder } from '@tishuashua/shared';

@ApiTags('certificate')
@Controller('certificates')
export class CertificateController {
  @Get()
  @ApiOperation({ summary: '证书列表（占位）' })
  list() {
    return scaffoldPlaceholder('certificate', 'list');
  }

  @Get('scores')
  @ApiOperation({ summary: '成绩列表（占位）' })
  scores() {
    return scaffoldPlaceholder('certificate', 'scores');
  }
}
