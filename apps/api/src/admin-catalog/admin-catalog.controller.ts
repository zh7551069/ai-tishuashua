import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AdminSummary } from '@tishuashua/shared';
import { CurrentAdmin } from '../admin-gateway/current-admin';
import { AdminSessionGuard } from '../admin-gateway/admin-session.guard';
import { parseDto } from '../common/parse-dto';
import { AdminCatalogService } from './admin-catalog.service';
import {
  AdminCatalogDeleteResultDto,
  AdminCatalogTreeDto,
  AdminCertificateDto,
  AdminCertificateListDto,
  AdminCertificatePatchDto,
  AdminCertificateWriteDto,
  AdminDomainDto,
  AdminDomainListDto,
  AdminDomainPatchDto,
  AdminDomainWriteDto,
  AdminKnowledgeNodeDto,
  AdminKnowledgePatchDto,
  AdminKnowledgeWriteDto,
  AdminTextbookLinkDto,
  AdminTextbookPatchDto,
  AdminTextbookSummaryDto,
  AdminTextbookWriteDto,
} from './dto/admin-catalog.dto';

const uuid = new ParseUUIDPipe({ version: '4' });

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AdminSessionGuard)
@Controller('admin/catalog')
export class AdminCatalogController {
  constructor(@Inject(AdminCatalogService) private readonly catalog: AdminCatalogService) {}

  @Get('domains')
  @ApiOperation({ summary: '全部领域', description: '含下架。小程序目录只读上架项。' })
  @ApiOkResponse({ type: AdminDomainListDto })
  listDomains() {
    return this.catalog.listDomains();
  }

  @Post('domains')
  @ApiOperation({ summary: '新建领域' })
  @ApiBody({ type: AdminDomainWriteDto })
  @ApiCreatedResponse({ type: AdminDomainDto })
  async createDomain(@CurrentAdmin() admin: AdminSummary, @Body() body: unknown) {
    const dto = await parseDto(AdminDomainWriteDto, body);
    return this.catalog.createDomain(dto, admin.username);
  }

  @Put('domains/:domainId')
  @ApiOperation({
    summary: '修改领域',
    description: '下架后小程序选不到该领域，也不能在其中新建刷题包。',
  })
  @ApiBody({ type: AdminDomainPatchDto })
  @ApiOkResponse({ type: AdminDomainDto })
  async updateDomain(
    @CurrentAdmin() admin: AdminSummary,
    @Param('domainId', uuid) domainId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminDomainPatchDto, body);
    return this.catalog.updateDomain(domainId, dto, admin.username);
  }

  @Delete('domains/:domainId')
  @ApiOperation({
    summary: '删除领域',
    description: '领域下还有证书时返回 CATALOG_IN_USE。可以改为下架。',
  })
  @ApiOkResponse({ type: AdminCatalogDeleteResultDto })
  deleteDomain(@CurrentAdmin() admin: AdminSummary, @Param('domainId', uuid) domainId: string) {
    return this.catalog.deleteDomain(domainId, admin.username);
  }

  @Get('domains/:domainId/certificates')
  @ApiOperation({ summary: '领域下的全部证书', description: '含下架。' })
  @ApiOkResponse({ type: AdminCertificateListDto })
  listCertificates(@Param('domainId', uuid) domainId: string) {
    return this.catalog.listCertificates(domainId);
  }

  @Post('domains/:domainId/certificates')
  @ApiOperation({ summary: '新建证书' })
  @ApiBody({ type: AdminCertificateWriteDto })
  @ApiCreatedResponse({ type: AdminCertificateDto })
  async createCertificate(
    @CurrentAdmin() admin: AdminSummary,
    @Param('domainId', uuid) domainId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminCertificateWriteDto, body);
    return this.catalog.createCertificate(domainId, dto, admin.username);
  }

  @Put('certificates/:certificateId')
  @ApiOperation({
    summary: '修改证书',
    description: 'status 改为 offline 后，已有刷题包只能删除，规则与小程序一致。',
  })
  @ApiBody({ type: AdminCertificatePatchDto })
  @ApiOkResponse({ type: AdminCertificateDto })
  async updateCertificate(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminCertificatePatchDto, body);
    return this.catalog.updateCertificate(certificateId, dto, admin.username);
  }

  @Delete('certificates/:certificateId')
  @ApiOperation({
    summary: '删除证书',
    description: '仍被刷题包、错题或课件引用时返回 CATALOG_IN_USE。请改为下架。',
  })
  @ApiOkResponse({ type: AdminCatalogDeleteResultDto })
  deleteCertificate(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
  ) {
    return this.catalog.deleteCertificate(certificateId, admin.username);
  }

  @Get('certificates/:certificateId/tree')
  @ApiOperation({
    summary: '证书的官方教材和知识点',
    description:
      '含下架、分组和空教材。用户课件不出现。linkableTextbooks 是尚未挂到这张证书的官方教材。',
  })
  @ApiOkResponse({ type: AdminCatalogTreeDto })
  getTree(@Param('certificateId', uuid) certificateId: string) {
    return this.catalog.getTree(certificateId);
  }

  @Post('certificates/:certificateId/textbooks')
  @ApiOperation({ summary: '新建教材并挂到证书' })
  @ApiBody({ type: AdminTextbookWriteDto })
  @ApiCreatedResponse({ type: AdminTextbookSummaryDto })
  async createTextbook(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminTextbookWriteDto, body);
    return this.catalog.createTextbook(certificateId, dto, admin.username);
  }

  @Post('certificates/:certificateId/textbooks/link')
  @ApiOperation({
    summary: '把已有官方教材挂到证书',
    description: '一本教材可以挂多张证书。重复挂接没有副作用。',
  })
  @ApiBody({ type: AdminTextbookLinkDto })
  @ApiCreatedResponse({ type: AdminTextbookSummaryDto })
  async linkTextbook(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminTextbookLinkDto, body);
    return this.catalog.linkTextbook(certificateId, dto.textbookId, admin.username);
  }

  @Delete('certificates/:certificateId/textbooks/:textbookId')
  @ApiOperation({
    summary: '从证书卸下教材',
    description: '不删除教材本身。卸下后，小程序这张证书的树里不再出现它。',
  })
  @ApiOkResponse({ type: AdminCatalogDeleteResultDto })
  unlinkTextbook(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Param('textbookId', uuid) textbookId: string,
  ) {
    return this.catalog.unlinkTextbook(certificateId, textbookId, admin.username);
  }

  @Put('textbooks/:textbookId')
  @ApiOperation({
    summary: '修改教材',
    description: '教材可能挂在多张证书上，名称和上下架会一起生效。',
  })
  @ApiBody({ type: AdminTextbookPatchDto })
  @ApiOkResponse({ type: AdminTextbookSummaryDto })
  async updateTextbook(
    @CurrentAdmin() admin: AdminSummary,
    @Param('textbookId', uuid) textbookId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminTextbookPatchDto, body);
    return this.catalog.updateTextbook(textbookId, dto, admin.username);
  }

  @Delete('textbooks/:textbookId')
  @ApiOperation({
    summary: '删除教材',
    description: '知识点仍在刷题包里，或下面还有用户课件知识点时，返回 CATALOG_IN_USE。',
  })
  @ApiOkResponse({ type: AdminCatalogDeleteResultDto })
  deleteTextbook(@CurrentAdmin() admin: AdminSummary, @Param('textbookId', uuid) textbookId: string) {
    return this.catalog.deleteTextbook(textbookId, admin.username);
  }

  @Post('textbooks/:textbookId/nodes')
  @ApiOperation({
    summary: '在教材下新建知识点或分组',
    description: '分组不会出现在小程序树上。分组下的已上架知识点会挂在这本教材下。',
  })
  @ApiBody({ type: AdminKnowledgeWriteDto })
  @ApiCreatedResponse({ type: AdminKnowledgeNodeDto })
  async createTextbookNode(
    @CurrentAdmin() admin: AdminSummary,
    @Param('textbookId', uuid) textbookId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminKnowledgeWriteDto, body);
    return this.catalog.createTextbookNode(textbookId, dto, admin.username);
  }

  @Post('certificates/:certificateId/knowledge-points')
  @ApiOperation({ summary: '新建不挂教材的独立知识点' })
  @ApiBody({ type: AdminKnowledgeWriteDto })
  @ApiCreatedResponse({ type: AdminKnowledgeNodeDto })
  async createIndependentPoint(
    @CurrentAdmin() admin: AdminSummary,
    @Param('certificateId', uuid) certificateId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminKnowledgeWriteDto, body);
    return this.catalog.createIndependentPoint(certificateId, dto, admin.username);
  }

  @Put('knowledge-points/:knowledgePointId')
  @ApiOperation({
    summary: '修改知识点或分组',
    description: '下架后小程序树不再返回该知识点，已选进刷题包的记录仍保留。',
  })
  @ApiBody({ type: AdminKnowledgePatchDto })
  @ApiOkResponse({ type: AdminKnowledgeNodeDto })
  async updateKnowledge(
    @CurrentAdmin() admin: AdminSummary,
    @Param('knowledgePointId', uuid) knowledgePointId: string,
    @Body() body: unknown,
  ) {
    const dto = await parseDto(AdminKnowledgePatchDto, body);
    return this.catalog.updateKnowledge(knowledgePointId, dto, admin.username);
  }

  @Delete('knowledge-points/:knowledgePointId')
  @ApiOperation({
    summary: '删除知识点或分组',
    description: '子节点一并删除。仍被刷题包使用时返回 CATALOG_IN_USE。',
  })
  @ApiOkResponse({ type: AdminCatalogDeleteResultDto })
  deleteKnowledge(
    @CurrentAdmin() admin: AdminSummary,
    @Param('knowledgePointId', uuid) knowledgePointId: string,
  ) {
    return this.catalog.deleteKnowledge(knowledgePointId, admin.username);
  }
}
