import {
  QUIZ_TYPE_LABELS,
  WRONG_ITEM_STATUS_LABELS,
  type AdminWrongBookDetail,
  type AdminWrongBookList,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';
import {
  getAdminWrongBook,
  listAdminWrongBook,
  type AdminWrongBookStatusFilter,
} from '../wrong-book-api';

interface Filters {
  userId: string;
  certId: string;
  status: AdminWrongBookStatusFilter;
}

const EMPTY_FILTERS: Filters = { userId: '', certId: '', status: 'all' };

export function WrongBookPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminWrongBookList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminWrongBookDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminWrongBook(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '错题加载失败');
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
    getAdminWrongBook(token, selectedId)
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
    setApplied({
      userId: next.userId.trim(),
      certId: next.certId.trim(),
      status: next.status,
    });
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));

  return (
    <section className="panel wide">
      <h1>错题</h1>
      <p className="muted">
        只读查看全站错题。默认包含未消灭和已消灭，按更新时间从新到旧。这里不能消灭或删除。
      </p>
      <form
        className="filters"
        onSubmit={(event) => {
          event.preventDefault();
          applyFilters(draft);
        }}
      >
        <label>
          用户 ID
          <input
            value={draft.userId}
            autoComplete="off"
            placeholder="留空表示全部用户"
            onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
          />
        </label>
        <label>
          证书 ID
          <input
            value={draft.certId}
            autoComplete="off"
            placeholder="留空表示全部证书"
            onChange={(event) => setDraft({ ...draft, certId: event.target.value })}
          />
        </label>
        <label>
          是否已消灭
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as AdminWrongBookStatusFilter })
            }
          >
            <option value="all">全部</option>
            <option value="pending">未消灭</option>
            <option value="cleared">已消灭</option>
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
      {loading && !list ? <p className="muted">正在加载错题…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的错题。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>更新时间</th>
                <th>用户</th>
                <th>证书</th>
                <th>状态</th>
                <th>错过次数</th>
                <th>题干</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>{formatTime(item.updatedAt)}</td>
                  <td>
                    <div>{item.userNick || '未设置昵称'}</div>
                    <div className="hint">{item.userId}</div>
                  </td>
                  <td>
                    <div>
                      {item.domainName} / {item.certName}
                    </div>
                    <div className="hint">{item.certId}</div>
                  </td>
                  <td>
                    <span className={item.status === 'pending' ? 'tag' : 'tag off'}>
                      {WRONG_ITEM_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td>{item.wrongCount}</td>
                  <td className="stem">{item.stem}</td>
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
            <h2>错题详情</h2>
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
          {detail ? (
            <DetailBody
              detail={detail}
              onFilterUser={() => applyFilters({ ...applied, userId: detail.userId })}
              onFilterCert={() => applyFilters({ ...applied, certId: detail.certId })}
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function DetailBody(props: {
  detail: AdminWrongBookDetail;
  onFilterUser: () => void;
  onFilterCert: () => void;
}) {
  const { detail } = props;
  return (
    <>
      <dl className="meta-list">
        <dt>用户</dt>
        <dd>
          {detail.userNick || '未设置昵称'}
          <div className="hint">{detail.userId}</div>
          <button type="button" className="tiny secondary" onClick={props.onFilterUser}>
            只看该用户
          </button>
        </dd>
        <dt>证书</dt>
        <dd>
          {detail.domainName} / {detail.certName}
          <div className="hint">{detail.certId}</div>
          <button type="button" className="tiny secondary" onClick={props.onFilterCert}>
            只看该证书
          </button>
        </dd>
        <dt>状态</dt>
        <dd>{WRONG_ITEM_STATUS_LABELS[detail.status]}</dd>
        <dt>错过次数</dt>
        <dd>{detail.wrongCount}</dd>
        <dt>题型</dt>
        <dd>{detail.type ? QUIZ_TYPE_LABELS[detail.type] : '题型无法读取'}</dd>
        <dt>分值</dt>
        <dd>{detail.score}</dd>
        <dt>写入时间</dt>
        <dd>{formatTime(detail.createdAt)}</dd>
        <dt>更新时间</dt>
        <dd>{formatTime(detail.updatedAt)}</dd>
        <dt>知识点 ID</dt>
        <dd>{detail.kpIds.length > 0 ? detail.kpIds.join('、') : '无'}</dd>
      </dl>
      <h2>题干</h2>
      <p>{detail.stem}</p>
      <h2>选项</h2>
      {detail.options.length === 0 ? (
        <p className="muted">没有选项。</p>
      ) : (
        <ul>
          {detail.options.map((option) => (
            <li key={option.id}>
              {option.id}. {option.text}
              {detail.answer.includes(option.id) ? '（正确）' : ''}
            </li>
          ))}
        </ul>
      )}
      <h2>答案</h2>
      <p>{detail.answer.length > 0 ? detail.answer.join('、') : '无'}</p>
      <h2>解析</h2>
      <p>{detail.analysis.trim() ? detail.analysis : '无'}</p>
    </>
  );
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}
