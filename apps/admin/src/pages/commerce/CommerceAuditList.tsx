import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../../api';
import { clearAdminSession } from '../../session';
import { auditReason, type EntitlementAuditPage } from './entitlement-view';

export function CommerceAuditList(props: { token: string; userId?: string }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [data, setData] = useState<EntitlementAuditPage | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      pageSize: '20',
      actionPrefix: 'commerce.',
    });
    if (props.userId) {
      params.set('userId', props.userId);
    }
    adminFetch<EntitlementAuditPage>(`/admin/commerce/audit?${params.toString()}`, { token: props.token })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setError('');
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) return;
        if (caught instanceof AdminApiError && caught.status === 401) {
          clearAdminSession();
          navigate('/login', { replace: true });
          return;
        }
        setError(caught instanceof Error ? caught.message : '审计加载失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [navigate, page, props.token, props.userId]);

  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <p className="commerce-hint">只读。默认只看商业化动作，不能改、不能删。</p>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-card">
        <table className="data">
          <thead>
            <tr>
              <th>时间</th>
              <th>操作人</th>
              <th>动作</th>
              <th>对象</th>
              <th>原因</th>
            </tr>
          </thead>
          <tbody>
            {(data?.items ?? []).map((item) => (
              <tr key={item.id}>
                <td>{item.createdAt.replace('T', ' ').slice(0, 19)}</td>
                <td>{item.actor}</td>
                <td>{item.action}</td>
                <td>{item.target}</td>
                <td>{auditReason(item.after)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && (data?.items.length ?? 0) === 0 ? <p className="commerce-empty">没有审计记录</p> : null}
        {loading ? <p className="muted">读取中</p> : null}
      </div>
      <div className="commerce-actions">
        <button type="button" className="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          上一页
        </button>
        <button
          type="button"
          className="secondary"
          disabled={page >= pages}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
        <span className="commerce-meta">
          {page} / {pages} · 共 {total}
        </span>
      </div>
    </div>
  );
}
