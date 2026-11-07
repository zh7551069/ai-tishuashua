import { PRODUCT_NAME } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { AdminApiError, logoutAdmin, pingAdmin } from '../api';
import { clearAdminSession, readAdminSession, type StoredAdminSession } from '../session';
import { NAV, crumbFor } from './nav';

export interface AdminOutletContext {
  session: StoredAdminSession;
  sessionNotice: string;
}

export function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
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
        <div className="brand">
          <span className="logo" aria-hidden="true">
            题
          </span>
          <span>
            <strong>{PRODUCT_NAME}后管</strong>
            <small>运营 / 教研配置台</small>
          </span>
        </div>
        <nav>
          {NAV.map((group) => (
            <div key={group.label ?? 'home'} className="nav-group">
              {group.label ? <p className="nav-label">{group.label}</p> : null}
              {group.items.map((item) =>
                item.disabled ? (
                  <span key={item.label} className="nav-link is-later is-disabled" aria-disabled="true">
                    <span className="nav-dot" aria-hidden="true" />
                    {item.label}
                  </span>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end
                    className={({ isActive }) =>
                      ['nav-link', item.placeholder ? 'is-later' : '', isActive ? 'active' : '']
                        .filter(Boolean)
                        .join(' ')
                    }
                  >
                    <span className="nav-dot" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ),
              )}
            </div>
          ))}
        </nav>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <p className="crumb">{crumbFor(location.pathname)}</p>
          <div className="topbar-end">
            <span className="role-chip">配置台</span>
            <span className="who">{current.username}</span>
            <button type="button" className="link" onClick={onLogout} disabled={pendingLogout}>
              {pendingLogout ? '退出中' : '退出'}
            </button>
          </div>
        </header>
        <main className="main">
          {actionError ? (
            <p className="form-error" role="alert">
              {actionError}
            </p>
          ) : null}
          {sessionNotice ? (
            <p className="form-error" role="status">
              {sessionNotice}
            </p>
          ) : null}
          <Outlet context={{ session: current, sessionNotice } satisfies AdminOutletContext} />
        </main>
      </div>
    </div>
  );
}
