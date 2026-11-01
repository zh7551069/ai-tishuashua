import { Module } from '@nestjs/common';
import { WrongBookController } from './wrong-book.controller';

@Module({
  controllers: [WrongBookController],
})
export class WrongBookModule {}
