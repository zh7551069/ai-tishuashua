import { Module } from '@nestjs/common';
import { CoursewareController } from './courseware.controller';

@Module({
  controllers: [CoursewareController],
})
export class CoursewareModule {}
