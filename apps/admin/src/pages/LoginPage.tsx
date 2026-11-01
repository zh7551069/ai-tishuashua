import { PRODUCT_NAME } from '@tishuashua/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiBase, postJson } from '../api';

export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setResult('');
    try {
      const payload = await postJson('/admin/login', { username, password });
      setResult(JSON.stringify(payload, null, 2));
    } catch (error) {
      setResult(error instanceof Error ? error.message : '请求失败');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="card" onSubmit={onSubmit}>
        <h1>{PRODUCT_NAME} 管理登录</h1>
        <p className="muted">帐密登录占位。提交后只展示 API 的脚手架响应，不会建立会话。</p>
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
        <button type="submit" disabled={pending}>
          {pending ? '提交中' : '登录'}
        </button>
        <p className="muted">API：{apiBase}/admin/login</p>
        <p>
          <Link to="/">返回布局</Link>
        </p>
        {result ? <pre>{result}</pre> : null}
      </form>
    </div>
  );
}
