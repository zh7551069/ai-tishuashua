import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { HealthController } from './health.controller';
import { QueueConsumerService } from './queue-consumer.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '../.env'), join(__dirname, '../../../.env')],
    }),
  ],
  controllers: [HealthController],
  providers: [QueueConsumerService],
})
export class WorkerModule {}
