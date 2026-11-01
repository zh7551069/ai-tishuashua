import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { PackController } from './pack.controller';
import { PackRepository } from './pack.repository';
import { PackService } from './pack.service';

@Module({
  imports: [UserModule],
  controllers: [PackController],
  providers: [PackRepository, PackService],
})
export class PackModule {}
