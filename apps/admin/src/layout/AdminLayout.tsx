import { PRODUCT_NAME } from '@tishuashua/shared';
import { NavLink, Outlet } from 'react-router-dom';

const links = [
  { to: '/', label: '概览', end: true },
  { to: '/users', label: '用户' },
  { to: '/courseware', label: '课件' },
  { to: '/quiz', label: '出题会话' },
  { to: '/wrong-book', label: '错题' },
  { to: '/certificates', label: '证书与成绩' },
  { to: '/login', label: '登录' },
];

export function AdminLayout() {
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
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
