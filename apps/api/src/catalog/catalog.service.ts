import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  ApiErrorCode,
  type CertificateList,
  type DomainList,
  type KnowledgeTree,
} from '@tishuashua/shared';
import { ApiException } from '../common/api.exception';
import { assembleKnowledgeTree } from './catalog-tree';
import { CatalogRepository } from './catalog.repository';

@Injectable()
export class CatalogService {
  constructor(@Inject(CatalogRepository) private readonly catalog: CatalogRepository) {}

  async listDomains(): Promise<DomainList> {
    return { items: await this.catalog.listOnlineDomains() };
  }

  async listCertificates(domainId: string): Promise<CertificateList> {
    const domain = await this.catalog.findDomain(domainId);
    if (!domain || domain.status !== 'online') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '领域不存在或已下架');
    }
    return { items: await this.catalog.listOnlineCertificates(domain.id) };
  }

  async getKnowledgeTree(certificateId: string, userId: string): Promise<KnowledgeTree> {
    const header = await this.catalog.findCertificateHeader(certificateId);
    if (!header || header.status !== 'online' || header.domainStatus !== 'online') {
      throw new ApiException(HttpStatus.NOT_FOUND, ApiErrorCode.NOT_FOUND, '证书不存在或已下架');
    }
    const textbooks = await this.catalog.listOnlineTextbooks(header.certificateId, userId);
    const knowledgePoints = await this.catalog.listOnlineKnowledgePoints(
      header.certificateId,
      textbooks.map((textbook) => textbook.id),
      userId,
    );
    return assembleKnowledgeTree({
      certificateId: header.certificateId,
      certificateName: header.certificateName,
      domainId: header.domainId,
      domainName: header.domainName,
      textbooks,
      knowledgePoints,
    });
  }
}
