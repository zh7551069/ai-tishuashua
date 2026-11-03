import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { scaffoldPlaceholder, type UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { CertificateService } from './certificate.service';
import { CertificateQueryListDto } from './dto/certificate.dto';

@ApiTags('certificate')
@Controller('certificates')
export class CertificateController {
  constructor(@Inject(CertificateService) private readonly certificates: CertificateService) {}

  @Get()
  @UseGuards(SessionAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '查询我关联过的证书',
    description:
      '需要微信登录。只返回当前用户有刷题包、错题、课件，或能对上证书的已交卷会话。不是目录里的上架证书，也不是后管目录。最近一次分数来自该会话已落库的 pass_snapshot。',
  })
  @ApiOkResponse({ type: CertificateQueryListDto })
  list(@CurrentUser() user: UserSummary) {
    return this.certificates.listForUser(user.id);
  }

  @Get('scores')
  @ApiOperation({
    summary: '成绩列表（占位）',
    description:
      '仍是脚手架占位。已交卷的逐次成绩在 GET /api/quiz/sessions，小程序成绩页读那个接口。这里不重复那份列表，也不做证书维度的另一套成绩。',
  })
  scores() {
    return scaffoldPlaceholder('certificate', 'scores');
  }
}
