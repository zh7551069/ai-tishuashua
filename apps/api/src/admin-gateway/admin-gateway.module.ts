import { Module } from '@nestjs/common';
import { AdminCatalogController } from '../admin-catalog/admin-catalog.controller';
import { AdminCatalogRepository } from '../admin-catalog/admin-catalog.repository';
import { AdminCatalogService } from '../admin-catalog/admin-catalog.service';
import { AdminWrongBookController } from '../admin-wrong-book/admin-wrong-book.controller';
import { AdminWrongBookRepository } from '../admin-wrong-book/admin-wrong-book.repository';
import { AdminWrongBookService } from '../admin-wrong-book/admin-wrong-book.service';
import { AdminGatewayController } from './admin-gateway.controller';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  controllers: [AdminGatewayController, AdminCatalogController, AdminWrongBookController],
  providers: [
    AdminLoginService,
    AdminSessionGuard,
    AdminCatalogRepository,
    AdminCatalogService,
    AdminWrongBookRepository,
    AdminWrongBookService,
  ],
})
export class AdminGatewayModule {}
