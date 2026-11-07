import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { EntitlementController, EntitlementDevController } from './entitlement.controller';
import { EntitlementService } from './entitlement.service';

@Module({
  imports: [UserModule],
  controllers: [EntitlementController, EntitlementDevController],
  providers: [EntitlementService],
  exports: [EntitlementService],
})
export class EntitlementModule {}
