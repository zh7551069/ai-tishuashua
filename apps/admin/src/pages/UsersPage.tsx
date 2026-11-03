import {
  ADMIN_USER_STATUS_LABELS,
  type AdminUserDetail,
  type AdminUserList,
  type AdminUserStatus,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';
import { getAdminUser, listAdminUsers, type AdminUserStatusFilter } from '../users-api';

interface Filters {
  status: AdminUserStatusFilter;
}

const EMPTY_FILTERS: Filters = { status: 'all' };

const STATUS_OPTIONS: { value: AdminUserStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'active', label: ADMIN_USER_STATUS_LABELS.active },
  { value: 'banned', label: ADMIN_USER_STATUS_LABELS.banned },
];

export function UsersPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
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
    listAdminUsers(token, { ...applied, page })
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
  }, [applied, page, reloadToken, token]);

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

  function applyFilters(next: Filters): void {
    setDraft(next);
    setApplied(next);
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));

  return (
    <section className="panel wide">
      <h1>用户</h1>
      <p className="muted">
        只读查看全站用户摘要。昵称已脱敏，手机号只显示已经脱敏的值。封禁状态来自数据库，这里不能封禁或解封。
      </p>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(draft);
        }}
      >
        <label>
          状态
          <select
            value={draft.status}
            onChange={(event) => setDraft({ status: event.target.value as AdminUserStatusFilter })}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <div className="actions">
          <button type="submit">查询</button>
          <button type="button" className="secondary" onClick={() => applyFilters(EMPTY_FILTERS)}>
            重置
          </button>
        </div>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="secondary"
            onClick={() => setReloadToken((value) => value + 1)}
          >
            重试
          </button>
        </p>
      ) : null}
      {loading && !list ? <p className="muted">正在加载用户…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的用户。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>创建时间</th>
                <th>昵称</th>
                <th>手机号</th>
                <th>状态</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>{formatTime(item.createdAt)}</td>
                  <td>
                    <div>{item.nick || '未设置昵称'}</div>
                    <div className="hint">{item.id}</div>
                  </td>
                  <td>{item.phoneMasked || '未绑定'}</td>
                  <td>{statusLabel(item.status)}</td>
                  <td>
                    <button
                      type="button"
                      className="tiny secondary"
                      onClick={() => setSelectedId(item.id)}
                    >
                      查看
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {list && list.total > 0 ? (
        <div className="pager">
          <button
            type="button"
            className="secondary"
            disabled={loading || page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            上一页
          </button>
          <span>
            第 {page} / {pageCount} 页，共 {list.total} 条
          </span>
          <button
            type="button"
            className="secondary"
            disabled={loading || page >= pageCount}
            onClick={() => setPage((value) => value + 1)}
          >
            下一页
          </button>
        </div>
      ) : null}

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
            <p className="form-error" role="alert">
              {detailError}{' '}
              <button
                type="button"
                className="secondary"
                onClick={() => setDetailReload((value) => value + 1)}
              >
                重试
              </button>
            </p>
          ) : null}
          {detail ? <DetailBody detail={detail} /> : null}
        </section>
      ) : null}
    </section>
  );
}

function DetailBody(props: { detail: AdminUserDetail }) {
  const { detail } = props;
  return (
    <dl className="meta-list">
      <dt>用户 ID</dt>
      <dd>{detail.id}</dd>
      <dt>昵称</dt>
      <dd>{detail.nick || '未设置昵称'}</dd>
      <dt>手机号</dt>
      <dd>{detail.phoneBound ? detail.phoneMasked : '未绑定'}</dd>
      <dt>状态</dt>
      <dd>{statusLabel(detail.status)}</dd>
      <dt>创建时间</dt>
      <dd>{formatTime(detail.createdAt)}</dd>
      <dt>更新时间</dt>
      <dd>{formatTime(detail.updatedAt)}</dd>
    </dl>
  );
}

function statusLabel(status: AdminUserStatus): string {
  return ADMIN_USER_STATUS_LABELS[status];
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || '无';
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}
