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
import { PlaceholderPage } from './pages/PlaceholderPage';
import { QuestionBankPage } from './pages/QuestionBankPage';
import { QuizSessionsPage } from './pages/QuizSessionsPage';
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
        <Route
          path="/config/prompts"
          element={
            <PlaceholderPage
              title="Prompt 模板"
              note="出题配置（TB-11）本刀只留入口，不接 Prompt 后端。"
              frame="4:2"
            />
          }
        />
        <Route
          path="/config/question-types"
          element={
            <PlaceholderPage
              title="题型管理"
              note="题型全局定义留到 TB-11。证书表单仍使用现有单选、多选、判断。"
              frame="4:243"
            />
          }
        />
        <Route
          path="/config/cert-types"
          element={
            <PlaceholderPage
              title="证书题型与默认参数"
              note="默认题量、分值和配比留到 TB-11。证书启用的题型子集在内容配置证书抽屉里维护。"
              frame="4:390"
            />
          }
        />
        <Route path="/users" element={<UsersPage />} />
        <Route
          path="/practice"
          element={
            <PlaceholderPage
              title="练习记录"
              note="练习记录和未交卷的出题会话不是同一份数据。这一页还没有只读接口。"
              frame="4:667"
            />
          }
        />
        <Route path="/wrong-book" element={<WrongBookPage />} />
        <Route
          path="/quiz-logs"
          element={
            <PlaceholderPage
              title="出题日志"
              note="出题日志只读留到后续。工作台不估算失败率。"
              frame="9:404"
            />
          }
        />
        <Route path="/question-bank" element={<QuestionBankPage />} />
        <Route path="/courseware" element={<CoursewarePage />} />
        <Route path="/quiz" element={<QuizSessionsPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
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
