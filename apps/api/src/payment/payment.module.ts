import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import {
  CommerceOrderController,
  PayMockController,
  PayNotifyController,
} from './payment.controller';
import { PaymentService } from './payment.service';

@Module({
  imports: [UserModule],
  controllers: [CommerceOrderController, PayNotifyController, PayMockController],
  providers: [PaymentService],
  exports: [PaymentService],
})
export class PaymentModule {}
