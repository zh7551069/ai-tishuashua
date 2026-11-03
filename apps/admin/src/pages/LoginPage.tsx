import { PRODUCT_NAME } from '@tishuashua/shared';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { loginAdmin } from '../api';
import { readAdminSession, writeAdminSession } from '../session';

export function LoginPage() {
  const navigate = useNavigate();
  const existing = readAdminSession();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  if (existing) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      const result = await loginAdmin({ username, password });
      if (!result.token || !result.expiresAt || !result.admin?.username) {
        setError('登录响应不完整');
        return;
      }
      writeAdminSession({
        token: result.token,
        expiresAt: result.expiresAt,
        username: result.admin.username,
      });
      navigate('/', { replace: true });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card" onSubmit={onSubmit}>
        <h1>{PRODUCT_NAME} 管理登录</h1>
        <p className="muted">使用 API 配置的管理员帐号。成功后进入后台，失败会留在此页。</p>
        <label>
          用户名
          <input
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        <label>
          密码
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending}>
          {pending ? '登录中' : '登录'}
        </button>
      </form>
    </div>
  );
}
