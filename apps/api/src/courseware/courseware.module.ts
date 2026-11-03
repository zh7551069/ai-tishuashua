import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { CoursewareController } from './courseware.controller';
import { CoursewareQueueService } from './courseware-queue.service';
import { CoursewareRepository } from './courseware.repository';
import { CoursewareService } from './courseware.service';

@Module({
  imports: [UserModule],
  controllers: [CoursewareController],
  providers: [CoursewareRepository, CoursewareQueueService, CoursewareService],
})
export class CoursewareModule {}
