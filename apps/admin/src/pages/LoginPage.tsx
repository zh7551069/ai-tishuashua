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
      <form className="login-card" onSubmit={onSubmit}>
        <div className="login-brand">
          <span className="logo" aria-hidden="true">
            题
          </span>
          <div>
            <h1>{PRODUCT_NAME}后管</h1>
            <p>运营 / 教研配置台</p>
          </div>
        </div>
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
        <p className="login-foot">帐密由配置文件维护（非 SSO）</p>
      </form>
    </div>
  );
}
