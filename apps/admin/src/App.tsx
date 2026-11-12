import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './layout/AdminLayout';
import { CertificatesPage } from './pages/CertificatesPage';
import { ContentCertificatesPage } from './pages/content/ContentCertificatesPage';
import { DomainsPage } from './pages/content/DomainsPage';
import { KnowledgePage } from './pages/content/KnowledgePage';
import { TextbooksPage } from './pages/content/TextbooksPage';
import { CoursewarePage } from './pages/CoursewarePage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { CertTypeConfigsPage } from './pages/CertTypeConfigsPage';
import { PracticeRecordsPage } from './pages/PracticeRecordsPage';
import { RetentionPage } from './pages/RetentionPage';
import { RolesPage } from './pages/RolesPage';
import { SystemAuditPage } from './pages/SystemAuditPage';
import { PromptTemplateEditorPage } from './pages/PromptTemplateEditorPage';
import { PromptTemplatesPage } from './pages/PromptTemplatesPage';
import { PromptVersionsPage } from './pages/PromptVersionsPage';
import { QuestionTypesPage } from './pages/QuestionTypesPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { QuizLogsPage } from './pages/QuizLogsPage';
import { QuizSessionsPage } from './pages/QuizSessionsPage';
import { CommerceAuditPage } from './pages/commerce/CommerceAuditPage';
import { EntitlementsPage } from './pages/commerce/EntitlementsPage';
import { GrowthPage } from './pages/commerce/GrowthPage';
import { QuotaPage } from './pages/commerce/QuotaPage';
import { SkusPage } from './pages/commerce/SkusPage';
import { SystemSettingsPage } from './pages/SystemSettingsPage';
import { UsersPage } from './pages/UsersPage';
import { WrongBookPage } from './pages/WrongBookPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/catalog" element={<Navigate to="/content/domains" replace />} />
        <Route path="/content/domains" element={<DomainsPage />} />
        <Route path="/content/certificates" element={<ContentCertificatesPage />} />
        <Route path="/content/textbooks" element={<TextbooksPage />} />
        <Route path="/content/knowledge" element={<KnowledgePage />} />
        <Route path="/config/prompts" element={<PromptTemplatesPage />} />
        <Route path="/config/prompts/new" element={<PromptTemplateEditorPage />} />
        <Route path="/config/prompts/:id/versions" element={<PromptVersionsPage />} />
        <Route path="/config/prompts/:id" element={<PromptTemplateEditorPage />} />
        <Route path="/config/question-types" element={<QuestionTypesPage />} />
        <Route path="/config/cert-types" element={<CertTypeConfigsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/practice" element={<PracticeRecordsPage />} />
        <Route path="/wrong-book" element={<WrongBookPage />} />
        <Route path="/quiz-logs" element={<QuizLogsPage />} />
        <Route path="/question-bank" element={<QuestionBankPage />} />
        <Route path="/courseware" element={<CoursewarePage />} />
        <Route path="/quiz" element={<QuizSessionsPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
        <Route path="/commerce/skus" element={<SkusPage />} />
        <Route path="/commerce/quota" element={<QuotaPage />} />
        <Route path="/commerce/growth" element={<GrowthPage />} />
        <Route path="/commerce/entitlements" element={<EntitlementsPage />} />
        <Route path="/commerce/audit" element={<CommerceAuditPage />} />
        <Route path="/settings" element={<SystemSettingsPage />} />
        <Route path="/system/roles" element={<RolesPage />} />
        <Route path="/system/retention" element={<RetentionPage />} />
        <Route path="/system/audit" element={<SystemAuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
