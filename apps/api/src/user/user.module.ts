import { Module } from '@nestjs/common';
import { SessionAuthGuard } from '../session/session-auth.guard';
import { UserController } from './user.controller';
import { UserRepository } from './user.repository';

@Module({
  controllers: [UserController],
  providers: [UserRepository, SessionAuthGuard],
  exports: [UserRepository, SessionAuthGuard],
})
export class UserModule {}
