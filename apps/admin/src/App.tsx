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
import { PlaceholderPage } from './pages/PlaceholderPage';
import { PracticeRecordsPage } from './pages/PracticeRecordsPage';
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
        <Route
          path="/system/roles"
          element={
            <PlaceholderPage
              title="角色权限"
              note="角色权限（TB-13）本刀不实现。登录仍是配置文件里的一份帐密。"
              frame="9:998"
            />
          }
        />
        <Route
          path="/system/retention"
          element={
            <PlaceholderPage
              title="数据保留周期"
              note="保留周期（TB-13）本刀不实现，也不写入假周期。"
              frame="4:800"
            />
          }
        />
        <Route
          path="/system/audit"
          element={
            <PlaceholderPage title="操作审计" note="操作审计（TB-13）本刀不实现。" frame="4:890" />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
