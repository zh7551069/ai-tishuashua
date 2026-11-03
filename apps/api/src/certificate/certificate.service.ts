import { Inject, Injectable } from '@nestjs/common';
import type { CertificateQueryList } from '@tishuashua/shared';
import { CertificateRepository } from './certificate.repository';

@Injectable()
export class CertificateService {
  constructor(
    @Inject(CertificateRepository) private readonly certificates: CertificateRepository,
  ) {}

  listForUser(userId: string): Promise<CertificateQueryList> {
    return this.certificates.listForUser(userId);
  }
}
