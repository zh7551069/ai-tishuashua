import { Module } from '@nestjs/common';
import { CertificateController } from './certificate.controller';

@Module({
  controllers: [CertificateController],
})
export class CertificateModule {}
