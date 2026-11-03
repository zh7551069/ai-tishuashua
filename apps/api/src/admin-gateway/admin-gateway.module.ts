import { Module } from '@nestjs/common';
import { AdminCatalogController } from '../admin-catalog/admin-catalog.controller';
import { AdminCatalogRepository } from '../admin-catalog/admin-catalog.repository';
import { AdminCatalogService } from '../admin-catalog/admin-catalog.service';
import { AdminGatewayController } from './admin-gateway.controller';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  controllers: [AdminGatewayController, AdminCatalogController],
  providers: [AdminLoginService, AdminSessionGuard, AdminCatalogRepository, AdminCatalogService],
})
export class AdminGatewayModule {}
