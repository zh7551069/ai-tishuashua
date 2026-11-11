import { ADMIN_USER_STATUS_LABELS, type AdminUserDetail, type AdminUserList, type AdminUserStatus } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';
import { getAdminUser, listAdminUsers } from '../users-api';
import { formatAdminTime, QueryPager } from './QueryPager';

export function UsersPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [list, setList] = useState<AdminUserList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminUsers(token, { status: 'all', page, pageSize })
      .then((result) => {
        if (!cancelled) {
          setList(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          if (leaveIfUnauthorized(caught)) {
            return;
          }
          setList(null);
          setError(caught instanceof Error ? caught.message : '用户加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [page, pageSize, reloadToken, token]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    getAdminUser(token, selectedId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          if (leaveIfUnauthorized(caught)) {
            return;
          }
          setDetailError(caught instanceof Error ? caught.message : '详情加载失败');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [detailReload, selectedId, token]);

  function leaveIfUnauthorized(caught: unknown): boolean {
    if (caught instanceof AdminApiError && caught.status === 401) {
      clearAdminSession();
      navigate('/login', { replace: true });
      return true;
    }
    return false;
  }

  return (
    <section className="dq-page">
      <header className="dq-head">
        <div>
          <h1>用户</h1>
          <p className="dq-note">只读对稿。昵称和手机已脱敏。无封禁、无导出、无关键字检索。</p>
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="secondary" onClick={() => setReloadToken((value) => value + 1)}>
            重试
          </button>
        </p>
      ) : null}
      {loading && !list ? <p className="muted">正在加载用户…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的用户。</p> : null}
      {list && list.items.length > 0 ? (
        <div className="dq-card">
          <table>
            <thead>
              <tr>
                <th>昵称</th>
                <th>脱敏手机</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>
                    <button type="button" className="linkish" onClick={() => setSelectedId(item.id)}>
                      {item.nick || '未设置昵称'}
                    </button>
                  </td>
                  <td>{item.phoneMasked || '未绑定'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <QueryPager
        page={page}
        pageSize={pageSize}
        total={list?.total ?? 0}
        loading={loading}
        onPage={setPage}
        onPageSize={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
      <p className="dq-foot">只读查看全站用户摘要。这里不能封禁或改资料。</p>
      {selectedId ? (
        <section className="detail">
          <div className="catalog-head">
            <h2>用户详情</h2>
            <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
              关闭
            </button>
          </div>
          {detailLoading ? <p className="muted">正在加载详情…</p> : null}
          {detailError ? (
            <p className="form-error">
              {detailError}{' '}
              <button type="button" className="secondary" onClick={() => setDetailReload((value) => value + 1)}>
                重试
              </button>
            </p>
          ) : null}
          {detail ? (
            <dl className="meta-list">
              <dt>用户 ID</dt>
              <dd>{detail.id}</dd>
              <dt>昵称</dt>
              <dd>{detail.nick || '未设置昵称'}</dd>
              <dt>手机号</dt>
              <dd>{detail.phoneBound ? detail.phoneMasked : '未绑定'}</dd>
              <dt>状态</dt>
              <dd>{statusLabel(detail.status)}（只读，不能封禁）</dd>
              <dt>创建时间</dt>
              <dd>{formatAdminTime(detail.createdAt)}</dd>
            </dl>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function statusLabel(status: AdminUserStatus): string {
  return ADMIN_USER_STATUS_LABELS[status];
}
