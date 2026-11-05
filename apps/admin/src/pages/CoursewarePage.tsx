import {
  ADMIN_COURSEWARE_STAGE_LABELS,
  ADMIN_COURSEWARE_STATUS_LABELS,
  type AdminCoursewareDetail,
  type AdminCoursewareList,
  type AdminCoursewareSummary,
  type ExtractJobStatus,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import {
  getAdminCourseware,
  listAdminCourseware,
  type AdminCoursewareStatusFilter,
} from '../courseware-api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

interface Filters {
  userId: string;
  certId: string;
  status: AdminCoursewareStatusFilter;
}

const EMPTY_FILTERS: Filters = { userId: '', certId: '', status: 'all' };

const STATUS_OPTIONS: { value: AdminCoursewareStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: ADMIN_COURSEWARE_STATUS_LABELS.pending },
  { value: 'running', label: ADMIN_COURSEWARE_STATUS_LABELS.running },
  { value: 'succeeded', label: ADMIN_COURSEWARE_STATUS_LABELS.succeeded },
  { value: 'failed', label: ADMIN_COURSEWARE_STATUS_LABELS.failed },
  { value: 'cancelled', label: ADMIN_COURSEWARE_STATUS_LABELS.cancelled },
];

export function CoursewarePage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminCoursewareList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCoursewareDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminCourseware(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '课件加载失败');
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
    getAdminCourseware(token, selectedId)
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
      <h1>用户上传教材</h1>
      <p className="muted">
        只读查看全站课件上传和提炼任务。默认包含全部状态，按最近更新从新到旧。这里不能重新上传、取消任务或修改提炼次数。
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
          提炼状态
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as AdminCoursewareStatusFilter })
            }
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
      {loading && !list ? <p className="muted">正在加载课件…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的课件。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>更新时间</th>
                <th>用户</th>
                <th>证书</th>
                <th>状态</th>
                <th>进度</th>
                <th>文件</th>
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
                    <div>{certLabel(item)}</div>
                    {item.certId ? <div className="hint">{item.certId}</div> : null}
                  </td>
                  <td>
                    <span className={statusClass(item.status)}>
                      {ADMIN_COURSEWARE_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td>{progressLabel(item)}</td>
                  <td className="file">
                    <div>{item.fileName}</div>
                    <div className="hint">
                      {item.extension ? item.extension.toUpperCase() : '未知格式'} ·{' '}
                      {formatBytes(item.byteSize)}
                    </div>
                    {item.errorCode ? <div className="hint">{item.errorCode}</div> : null}
                  </td>
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
            <h2>课件详情</h2>
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
              onFilterCert={
                detail.certId
                  ? () => applyFilters({ ...applied, certId: detail.certId ?? '' })
                  : undefined
              }
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function DetailBody(props: {
  detail: AdminCoursewareDetail;
  onFilterUser: () => void;
  onFilterCert?: () => void;
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
          {certLabel(detail)}
          {detail.certId ? <div className="hint">{detail.certId}</div> : null}
          {props.onFilterCert ? (
            <button type="button" className="tiny secondary" onClick={props.onFilterCert}>
              只看该证书
            </button>
          ) : null}
        </dd>
        <dt>文件</dt>
        <dd>
          {detail.fileName}
          <div className="hint">
            {detail.extension ? detail.extension.toUpperCase() : '未知格式'} ·{' '}
            {formatBytes(detail.byteSize)}
          </div>
        </dd>
        <dt>状态</dt>
        <dd>{ADMIN_COURSEWARE_STATUS_LABELS[detail.status]}</dd>
        <dt>阶段</dt>
        <dd>{detail.stage ? ADMIN_COURSEWARE_STAGE_LABELS[detail.stage] : '无提炼任务'}</dd>
        <dt>进度</dt>
        <dd>{detail.jobId ? `${detail.progress}%` : '无'}</dd>
        <dt>预计</dt>
        <dd>{detail.estimatedMinutes == null ? '无' : `${detail.estimatedMinutes} 分钟`}</dd>
        <dt>回树</dt>
        <dd>{detail.committed ? '已加入知识点树' : '尚未加入'}</dd>
        <dt>上传 ID</dt>
        <dd>{detail.id}</dd>
        <dt>任务 ID</dt>
        <dd>{detail.jobId || '无'}</dd>
        <dt>上传时间</dt>
        <dd>{formatTime(detail.createdAt)}</dd>
        <dt>更新时间</dt>
        <dd>{formatTime(detail.updatedAt)}</dd>
        <dt>错误</dt>
        <dd>
          {detail.error ? (
            <>
              {detail.error.code}
              <div className="hint">{detail.error.message}</div>
            </>
          ) : (
            '无'
          )}
        </dd>
        <dt>知识点 ID</dt>
        <dd>{detail.extractedKpIds.length > 0 ? detail.extractedKpIds.join('、') : '无'}</dd>
        <dt>已勾选草稿</dt>
        <dd>{detail.acceptedDraftIds.length > 0 ? detail.acceptedDraftIds.join('、') : '无'}</dd>
      </dl>
      <h2>提炼草稿</h2>
      {detail.drafts.length === 0 ? (
        <p className="muted">还没有草稿。</p>
      ) : (
        <ul>
          {detail.drafts.map((draft) => (
            <li key={draft.id}>
              <strong>{draft.name}</strong>
              <div className="hint">{draft.id}</div>
              <p>{draft.excerpt}</p>
              <p className="hint">{draft.promptHint}</p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function certLabel(item: Pick<AdminCoursewareSummary, 'domainName' | 'certName'>): string {
  if (item.domainName && item.certName) {
    return `${item.domainName} / ${item.certName}`;
  }
  return item.certName || '未关联证书';
}

function progressLabel(item: AdminCoursewareSummary): string {
  if (!item.jobId || !item.stage) {
    return '无提炼任务';
  }
  return `${ADMIN_COURSEWARE_STAGE_LABELS[item.stage]} ${item.progress}%`;
}

function statusClass(status: ExtractJobStatus): string {
  if (status === 'failed') {
    return 'tag bad';
  }
  if (status === 'cancelled') {
    return 'tag off';
  }
  return 'tag';
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }
  if (value < 1024) {
    return `${value} B`;
  }
  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}
