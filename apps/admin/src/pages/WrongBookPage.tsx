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
import { formatAdminTime, QueryPager } from './QueryPager';

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
  const [pageSize, setPageSize] = useState(20);
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
    listAdminWrongBook(token, { ...applied, page, pageSize })
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
  }, [applied, page, pageSize, reloadToken, token]);

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

  return (
    <section className="dq-page">
      <header className="dq-head">
        <div>
          <h1>错题库</h1>
          <p className="dq-note">只读。不能消灭、不能删除。没有导出，也没有关键字检索。</p>
        </div>
      </header>
      <div className="dq-chips" role="group" aria-label="消灭状态">
        {(
          [
            ['all', '全部'],
            ['pending', '待消灭'],
            ['cleared', '已消灭'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={draft.status === value ? 'active' : undefined}
            onClick={() => applyFilters({ ...draft, status: value })}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="dq-filters"
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
            placeholder="精确 ID，不是关键字"
            onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
          />
        </label>
        <label>
          证书 ID
          <input
            value={draft.certId}
            autoComplete="off"
            placeholder="精确 ID，不是关键字"
            onChange={(event) => setDraft({ ...draft, certId: event.target.value })}
          />
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
        <div className="dq-card">
          <table>
            <thead>
              <tr>
                <th>状态</th>
                <th>证书</th>
                <th>知识点</th>
                <th>用户</th>
                <th>最近出现</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>
                    <span className={item.status === 'pending' ? 'dq-badge warn' : 'dq-badge ok'}>
                      {WRONG_ITEM_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td>{item.certName}</td>
                  <td>{item.stem}</td>
                  <td>{item.userNick || '未设置昵称'}</td>
                  <td>
                    <button type="button" className="linkish" onClick={() => setSelectedId(item.id)}>
                      {formatAdminTime(item.updatedAt)}
                    </button>
                  </td>
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
      <p className="dq-foot">
        知识点列目前是题干摘要，详情里才有知识点 ID。近 7 天 / 近 30 天不另开检索。禁止后管直接改消灭状态。
      </p>

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
