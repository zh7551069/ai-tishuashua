import { Module } from '@nestjs/common';
import { AdminGatewayController } from './admin-gateway.controller';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  controllers: [AdminGatewayController],
  providers: [AdminLoginService, AdminSessionGuard],
})
export class AdminGatewayModule {}
