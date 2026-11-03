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
import { parseAdminCertificateLinkQuery } from './admin-certificates.query';
import { AdminCertificateLinkService } from './admin-certificate-link.service';
import {
  AdminCertificateLinkDetailDto,
  AdminCertificateLinkListDto,
} from './dto/admin-certificate-link.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/certificate-links')
export class AdminCertificateLinkController {
  constructor(
    @Inject(AdminCertificateLinkService) private readonly links: AdminCertificateLinkService,
  ) {}

  @Get()
  @ApiOperation({
    summary: '后管用户与证书关联列表',
    description:
      '只读。需要后管会话，微信用户 token 返回 UNAUTHORIZED。按最近关联从新到旧分页。可按 userId、certId、domainId 和关联时间筛选。不改关联、不改及格线。不是目录维护，也不是 GET /api/certificates。',
  })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'certId', required: false })
  @ApiQuery({ name: 'domainId', required: false })
  @ApiQuery({ name: 'touchedFrom', required: false, description: '关联时间下界，含该时刻' })
  @ApiQuery({ name: 'touchedTo', required: false, description: '关联时间上界，含该时刻' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'pageSize', required: false })
  @ApiOkResponse({ type: AdminCertificateLinkListDto })
  list(@Query() query: Record<string, unknown>) {
    const parsed = parseAdminCertificateLinkQuery(query);
    if (!parsed.ok) {
      throw new ApiException(HttpStatus.BAD_REQUEST, ApiErrorCode.VALIDATION_ERROR, parsed.message);
    }
    return this.links.list(parsed.query);
  }

  @Get(':userId/:certId')
  @ApiOperation({
    summary: '后管用户与证书关联详情',
    description:
      '只读。userId 与 certId 组成一行。返回证书卡字段和四个来源的最近时间。没有这组关联时 404。微信用户 token 不能调用。',
  })
  @ApiOkResponse({ type: AdminCertificateLinkDetailDto })
  getOne(@Param('userId', uuid) userId: string, @Param('certId', uuid) certId: string) {
    return this.links.get(userId, certId);
  }
}
