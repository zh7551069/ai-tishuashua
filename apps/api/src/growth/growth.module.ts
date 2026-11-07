import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { GrowthController } from './growth.controller';
import { GrowthService } from './growth.service';

@Module({
  imports: [UserModule],
  controllers: [GrowthController],
  providers: [GrowthService],
  exports: [GrowthService],
})
export class GrowthModule {}
