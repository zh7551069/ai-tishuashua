import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { PRODUCT_NAME } from '@tishuashua/shared';
import { AdminApiError, logoutAdmin, pingAdmin } from '../api';
import { clearAdminSession, readAdminSession, type StoredAdminSession } from '../session';

const links = [
  { to: '/', label: '概览', end: true },
  { to: '/users', label: '用户' },
  { to: '/courseware', label: '课件' },
  { to: '/quiz', label: '出题会话' },
  { to: '/wrong-book', label: '错题' },
  { to: '/certificates', label: '证书与成绩' },
];

export interface AdminOutletContext {
  session: StoredAdminSession;
  sessionNotice: string;
}

export function AdminLayout() {
  const navigate = useNavigate();
  const session = readAdminSession();
  const token = session?.token ?? '';
  const [ready, setReady] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingLogout, setPendingLogout] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    pingAdmin(token)
      .then(() => {
        if (!cancelled) {
          setSessionNotice('');
          setReady(true);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        if (error instanceof AdminApiError && error.status === 401) {
          clearAdminSession();
          navigate('/login', { replace: true });
          return;
        }
        setSessionNotice(error instanceof Error ? error.message : '暂时无法确认会话');
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, token]);

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const current = session;

  if (!ready) {
    return (
      <div className="login-screen">
        <p className="muted">正在确认登录会话…</p>
      </div>
    );
  }

  async function onLogout() {
    setPendingLogout(true);
    setActionError('');
    try {
      await logoutAdmin(current.token);
    } catch (error) {
      if (!(error instanceof AdminApiError && error.status === 401)) {
        setActionError(error instanceof Error ? error.message : '退出失败');
        setPendingLogout(false);
        return;
      }
    }
    clearAdminSession();
    navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <aside className="sider">
        <div className="brand">{PRODUCT_NAME} · 管理后台</div>
        <nav>
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
        <p className="account">{current.username}</p>
        <button type="button" className="logout" onClick={onLogout} disabled={pendingLogout}>
          {pendingLogout ? '退出中' : '退出'}
        </button>
      </aside>
      <main className="main">
        {actionError ? (
          <p className="form-error" role="alert">
            {actionError}
          </p>
        ) : null}
        <Outlet context={{ session: current, sessionNotice } satisfies AdminOutletContext} />
      </main>
    </div>
  );
}
