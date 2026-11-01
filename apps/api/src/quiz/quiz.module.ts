import { Module } from '@nestjs/common';
import { QuizSessionController } from './quiz-session.controller';

@Module({
  controllers: [QuizSessionController],
})
export class QuizModule {}
