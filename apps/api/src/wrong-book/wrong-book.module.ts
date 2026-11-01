import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { WrongBookController } from './wrong-book.controller';
import { WrongBookRepository } from './wrong-book.repository';
import { WrongBookService } from './wrong-book.service';

@Module({
  imports: [UserModule],
  controllers: [WrongBookController],
  providers: [WrongBookRepository, WrongBookService],
})
export class WrongBookModule {}
