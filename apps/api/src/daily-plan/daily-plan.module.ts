import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { DailyPlanController } from './daily-plan.controller';
import { DailyPlanRepository } from './daily-plan.repository';
import { DailyPlanService } from './daily-plan.service';

@Module({
  imports: [UserModule],
  controllers: [DailyPlanController],
  providers: [DailyPlanRepository, DailyPlanService],
  exports: [DailyPlanRepository, DailyPlanService],
})
export class DailyPlanModule {}
