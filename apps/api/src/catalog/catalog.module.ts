import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { CatalogController } from './catalog.controller';
import { CatalogRepository } from './catalog.repository';
import { CatalogService } from './catalog.service';

@Module({
  imports: [UserModule],
  controllers: [CatalogController],
  providers: [CatalogRepository, CatalogService],
})
export class CatalogModule {}
