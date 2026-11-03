import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './layout/AdminLayout';
import { CatalogPage } from './pages/CatalogPage';
import { CoursewarePage } from './pages/CoursewarePage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { WrongBookPage } from './pages/WrongBookPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route
          path="/users"
          element={
            <PlaceholderPage
              title="用户"
              moduleName="user"
              description="用户资料来自微信登录后的 API。这里只保留入口。"
            />
          }
        />
        <Route path="/courseware" element={<CoursewarePage />} />
        <Route
          path="/quiz"
          element={
            <PlaceholderPage
              title="出题会话"
              moduleName="quiz/session"
              description="按需出题，不是静态题库。错题入卷比例上限 50%。"
            />
          }
        />
        <Route path="/wrong-book" element={<WrongBookPage />} />
        <Route
          path="/certificates"
          element={
            <PlaceholderPage
              title="证书与成绩"
              moduleName="certificate"
              description="这一页仍是空壳。小程序证书查询已经分开实现。上架领域、证书和知识点在「目录」。"
            />
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
