import { Module } from '@nestjs/common';
import { EntitlementModule } from '../entitlement/entitlement.module';
import { GrowthModule } from '../growth/growth.module';
import { UserModule } from '../user/user.module';
import { QuizQueueService } from './quiz-queue.service';
import { QuizRepository } from './quiz.repository';
import { QuizSessionController } from './quiz-session.controller';
import { QuizService } from './quiz.service';

@Module({
  imports: [UserModule, EntitlementModule, GrowthModule],
  controllers: [QuizSessionController],
  providers: [QuizRepository, QuizQueueService, QuizService],
})
export class QuizModule {}
