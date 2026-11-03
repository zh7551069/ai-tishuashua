import { Module } from '@nestjs/common';
import { AdminCatalogController } from '../admin-catalog/admin-catalog.controller';
import { AdminCatalogRepository } from '../admin-catalog/admin-catalog.repository';
import { AdminCatalogService } from '../admin-catalog/admin-catalog.service';
import { AdminCertificateController } from '../admin-certificates/admin-certificates.controller';
import { AdminCertificateRepository } from '../admin-certificates/admin-certificates.repository';
import { AdminCertificateService } from '../admin-certificates/admin-certificates.service';
import { AdminQuizSessionController } from '../admin-quiz-sessions/admin-quiz-sessions.controller';
import { AdminQuizSessionRepository } from '../admin-quiz-sessions/admin-quiz-sessions.repository';
import { AdminQuizSessionService } from '../admin-quiz-sessions/admin-quiz-sessions.service';
import { AdminUserController } from '../admin-users/admin-users.controller';
import { AdminUserRepository } from '../admin-users/admin-users.repository';
import { AdminUserService } from '../admin-users/admin-users.service';
import { AdminCoursewareController } from '../admin-courseware/admin-courseware.controller';
import { AdminCoursewareRepository } from '../admin-courseware/admin-courseware.repository';
import { AdminCoursewareService } from '../admin-courseware/admin-courseware.service';
import { AdminWrongBookController } from '../admin-wrong-book/admin-wrong-book.controller';
import { AdminWrongBookRepository } from '../admin-wrong-book/admin-wrong-book.repository';
import { AdminWrongBookService } from '../admin-wrong-book/admin-wrong-book.service';
import { AdminGatewayController } from './admin-gateway.controller';
import { AdminLoginService } from './admin-login.service';
import { AdminSessionGuard } from './admin-session.guard';

@Module({
  controllers: [
    AdminGatewayController,
    AdminCatalogController,
    AdminWrongBookController,
    AdminCoursewareController,
    AdminCertificateController,
    AdminUserController,
    AdminQuizSessionController,
  ],
  providers: [
    AdminLoginService,
    AdminSessionGuard,
    AdminCatalogRepository,
    AdminCatalogService,
    AdminWrongBookRepository,
    AdminWrongBookService,
    AdminCoursewareRepository,
    AdminCoursewareService,
    AdminCertificateRepository,
    AdminCertificateService,
    AdminUserRepository,
    AdminUserService,
    AdminQuizSessionRepository,
    AdminQuizSessionService,
  ],
})
export class AdminGatewayModule {}
