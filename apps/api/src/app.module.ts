import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AdminGatewayModule } from './admin-gateway/admin-gateway.module';
import { AuthModule } from './auth/auth.module';
import { CertificateModule } from './certificate/certificate.module';
import { CoursewareModule } from './courseware/courseware.module';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { QuizModule } from './quiz/quiz.module';
import { SessionModule } from './session/session.module';
import { UserModule } from './user/user.module';
import { WrongBookModule } from './wrong-book/wrong-book.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [join(__dirname, '../.env'), join(__dirname, '../../../.env')],
    }),
    DatabaseModule,
    SessionModule,
    HealthModule,
    AuthModule,
    UserModule,
    QuizModule,
    WrongBookModule,
    CertificateModule,
    CoursewareModule,
    AdminGatewayModule,
  ],
})
export class AppModule {}
