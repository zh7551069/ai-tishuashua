import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { join } from 'node:path';
import { AdminGatewayModule } from './admin-gateway/admin-gateway.module';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { CertificateModule } from './certificate/certificate.module';
import { CoursewareModule } from './courseware/courseware.module';
import { DailyPlanModule } from './daily-plan/daily-plan.module';
import { EntitlementModule } from './entitlement/entitlement.module';
import { GrowthModule } from './growth/growth.module';
import { DatabaseModule } from './db/database.module';
import { HealthModule } from './health/health.module';
import { PackModule } from './pack/pack.module';
import { PaymentModule } from './payment/payment.module';
import { QuizModule } from './quiz/quiz.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
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
    DailyPlanModule,
    RateLimitModule,
    HealthModule,
    AuthModule,
    UserModule,
    CatalogModule,
    PackModule,
    EntitlementModule,
    GrowthModule,
    PaymentModule,
    QuizModule,
    WrongBookModule,
    CertificateModule,
    CoursewareModule,
    AdminGatewayModule,
  ],
})
export class AppModule {}
