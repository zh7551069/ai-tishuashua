import { Module } from '@nestjs/common';
import { AdminGatewayController } from './admin-gateway.controller';

@Module({
  controllers: [AdminGatewayController],
})
export class AdminGatewayModule {}
