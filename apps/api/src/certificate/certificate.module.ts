import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { CertificateController } from './certificate.controller';
import { CertificateRepository } from './certificate.repository';
import { CertificateService } from './certificate.service';

@Module({
  imports: [UserModule],
  controllers: [CertificateController],
  providers: [CertificateRepository, CertificateService],
})
export class CertificateModule {}
