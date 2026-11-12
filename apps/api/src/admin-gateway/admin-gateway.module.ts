import { Module } from '@nestjs/common';
import { AdminCatalogController } from '../admin-catalog/admin-catalog.controller';
import { AdminCatalogRepository } from '../admin-catalog/admin-catalog.repository';
import { AdminCatalogService } from '../admin-catalog/admin-catalog.service';
import { AdminCertificateController } from '../admin-certificates/admin-certificates.controller';
import { AdminCertificateRepository } from '../admin-certificates/admin-certificates.repository';
import { AdminCertificateService } from '../admin-certificates/admin-certificates.service';
import { CommerceController } from '../admin-commerce/commerce.controller';
import { CommerceService } from '../admin-commerce/commerce.service';
import { AdminOrdersController } from '../payment/admin-orders.controller';
import { PaymentModule } from '../payment/payment.module';
import { EntitlementOpsController } from '../admin-entitlement/entitlement-ops.controller';
import { EntitlementOpsService } from '../admin-entitlement/entitlement-ops.service';
import { SystemSettingsController } from '../admin-system-settings/system-settings.controller';
import { SystemSettingsService } from '../admin-system-settings/system-settings.service';
import { AdminQuizSessionController } from '../admin-quiz-sessions/admin-quiz-sessions.controller';
import { AdminQuizSessionRepository } from '../admin-quiz-sessions/admin-quiz-sessions.repository';
import { AdminQuizSessionService } from '../admin-quiz-sessions/admin-quiz-sessions.service';
import { AdminPracticeRecordController } from '../admin-practice-records/admin-practice-records.controller';
import { AdminPracticeRecordRepository } from '../admin-practice-records/admin-practice-records.repository';
import { AdminPracticeRecordService } from '../admin-practice-records/admin-practice-records.service';
import { AdminQuizGenerationLogController } from '../admin-quiz-generation-logs/admin-quiz-generation-logs.controller';
import { AdminQuizGenerationLogRepository } from '../admin-quiz-generation-logs/admin-quiz-generation-logs.repository';
import { AdminQuizGenerationLogService } from '../admin-quiz-generation-logs/admin-quiz-generation-logs.service';
import { CertTypeConfigController } from '../admin-generation-config/cert-type-configs.controller';
import { CertTypeConfigService } from '../admin-generation-config/cert-type-configs.service';
import { GenerationConfigStore } from '../admin-generation-config/generation-config.store';
import { PromptTemplateController } from '../admin-generation-config/prompt-templates.controller';
import { PromptTemplateService } from '../admin-generation-config/prompt-templates.service';
import { QuestionTypeController } from '../admin-generation-config/question-types.controller';
import { QuestionTypeService } from '../admin-generation-config/question-types.service';
import { AdminUserController } from '../admin-users/admin-users.controller';
import { AdminUserRepository } from '../admin-users/admin-users.repository';
import { AdminUserService } from '../admin-users/admin-users.service';
import { AdminCoursewareController } from '../admin-courseware/admin-courseware.controller';
import { AdminCoursewareRepository } from '../admin-courseware/admin-courseware.repository';
import { AdminCoursewareService } from '../admin-courseware/admin-courseware.service';
import { AdminQuestionBankController } from '../admin-question-bank/admin-question-bank.controller';
import { AdminQuestionBankRepository } from '../admin-question-bank/admin-question-bank.repository';
import { AdminQuestionBankService } from '../admin-question-bank/admin-question-bank.service';
import { AdminWrongBookController } from '../admin-wrong-book/admin-wrong-book.controller';
import { AdminWrongBookRepository } from '../admin-wrong-book/admin-wrong-book.repository';
import { AdminWrongBookService } from '../admin-wrong-book/admin-wrong-book.service';
import { AdminGatewayController } from './admin-gateway.controller';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  imports: [PaymentModule],
  controllers: [
    AdminGatewayController,
    AdminCatalogController,
    AdminWrongBookController,
    AdminQuestionBankController,
    AdminCoursewareController,
    AdminCertificateController,
    AdminUserController,
    AdminQuizSessionController,
    AdminPracticeRecordController,
    AdminQuizGenerationLogController,
    PromptTemplateController,
    QuestionTypeController,
    CertTypeConfigController,
    SystemSettingsController,
    CommerceController,
    EntitlementOpsController,
    AdminOrdersController,
  ],
  providers: [
    AdminLoginService,
    AdminSessionGuard,
    AdminCatalogRepository,
    AdminCatalogService,
    AdminWrongBookRepository,
    AdminWrongBookService,
    AdminQuestionBankRepository,
    AdminQuestionBankService,
    AdminCoursewareRepository,
    AdminCoursewareService,
    AdminCertificateRepository,
    AdminCertificateService,
    AdminUserRepository,
    AdminUserService,
    AdminQuizSessionRepository,
    AdminQuizSessionService,
    AdminPracticeRecordRepository,
    AdminPracticeRecordService,
    AdminQuizGenerationLogRepository,
    AdminQuizGenerationLogService,
    GenerationConfigStore,
    PromptTemplateService,
    QuestionTypeService,
    CertTypeConfigService,
    SystemSettingsService,
    CommerceService,
    EntitlementOpsService,
  ],
})
export class AdminGatewayModule {}
