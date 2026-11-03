import { Controller, Get, Inject, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { UserSummary } from '@tishuashua/shared';
import { CurrentUser } from '../common/current-user';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { CatalogService } from './catalog.service';
import { CertificateListDto, DomainListDto, KnowledgeTreeDto } from './dto/catalog.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(SessionAuthGuard)
@Controller('catalog')
export class CatalogController {
  constructor(@Inject(CatalogService) private readonly catalog: CatalogService) {}

  @Get('domains')
  @ApiOperation({ summary: '上架领域列表' })
  @ApiOkResponse({ type: DomainListDto })
  listDomains(@CurrentUser() _user: UserSummary) {
    return this.catalog.listDomains();
  }

  @Get('domains/:domainId/certificates')
  @ApiOperation({ summary: '领域下的上架证书' })
  @ApiOkResponse({ type: CertificateListDto })
  listCertificates(@CurrentUser() _user: UserSummary, @Param('domainId', uuid) domainId: string) {
    return this.catalog.listCertificates(domainId);
  }

  @Get('certificates/:certificateId/knowledge-tree')
  @ApiOperation({
    summary: '证书的教材 / 知识点二级树',
    description: '只返回上架教材和可入包的知识点。半选由客户端根据勾选计算。分组节点不会出现。',
  })
  @ApiOkResponse({ type: KnowledgeTreeDto })
  knowledgeTree(
    @CurrentUser() user: UserSummary,
    @Param('certificateId', uuid) certificateId: string,
  ) {
    return this.catalog.getKnowledgeTree(certificateId, user.id);
  }
}
