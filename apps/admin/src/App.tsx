import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminLayout } from './layout/AdminLayout';
import { CatalogPage } from './pages/CatalogPage';
import { CertificatesPage } from './pages/CertificatesPage';
import { CoursewarePage } from './pages/CoursewarePage';
import { LoginPage } from './pages/LoginPage';
import { OverviewPage } from './pages/OverviewPage';
import { QuizSessionsPage } from './pages/QuizSessionsPage';
import { UsersPage } from './pages/UsersPage';
import { WrongBookPage } from './pages/WrongBookPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AdminLayout />}>
        <Route path="/" element={<OverviewPage />} />
        <Route path="/catalog" element={<CatalogPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/courseware" element={<CoursewarePage />} />
        <Route path="/quiz" element={<QuizSessionsPage />} />
        <Route path="/wrong-book" element={<WrongBookPage />} />
        <Route path="/certificates" element={<CertificatesPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
