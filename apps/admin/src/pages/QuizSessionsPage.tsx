import {
  ADMIN_QUIZ_SESSION_SOURCE_LABELS,
  ADMIN_QUIZ_SESSION_STATUSES,
  ADMIN_QUIZ_SESSION_STATUS_LABELS,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_MODE_LABELS,
  QUIZ_TYPE_LABELS,
  type AdminQuizSessionDetail,
  type AdminQuizSessionList,
  type QuizSettings,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import {
  getAdminQuizSession,
  listAdminQuizSessions,
  type AdminQuizSessionModeFilter,
  type AdminQuizSessionStatusFilter,
} from '../quiz-sessions-api';
import { clearAdminSession } from '../session';

interface Filters {
  userId: string;
  mode: AdminQuizSessionModeFilter;
  status: AdminQuizSessionStatusFilter;
}

const EMPTY_FILTERS: Filters = { userId: '', mode: 'all', status: 'all' };

const MODE_OPTIONS: { value: AdminQuizSessionModeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'practice', label: QUIZ_MODE_LABELS.practice },
  { value: 'exam', label: QUIZ_MODE_LABELS.exam },
];

const STATUS_OPTIONS: { value: AdminQuizSessionStatusFilter; label: string }[] = [
  { value: 'all', label: '全部未交卷' },
  ...ADMIN_QUIZ_SESSION_STATUSES.map((status) => ({
    value: status,
    label: ADMIN_QUIZ_SESSION_STATUS_LABELS[status],
  })),
];

export function QuizSessionsPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminQuizSessionList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminQuizSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminQuizSessions(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '出题会话加载失败');
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
    getAdminQuizSession(token, selectedId)
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
      mode: next.mode,
      status: next.status,
    });
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));

  return (
    <section className="panel wide">
      <h1>出题会话</h1>
      <p className="muted">
        只读查看未交卷的出题会话，包括等待、生成、待作答、作答中、已取消和出题失败。这里不显示题目、答案和分数，也不能取消出题。已交卷成绩在「证书与成绩」。
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
          模式
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft({ ...draft, mode: event.target.value as AdminQuizSessionModeFilter })
            }
          >
            {MODE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          状态
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as AdminQuizSessionStatusFilter })
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
      {loading && !list ? <p className="muted">正在加载出题会话…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的出题会话。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>创建时间</th>
                <th>用户</th>
                <th>刷题包</th>
                <th>模式</th>
                <th>状态</th>
                <th>进度</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>{formatTime(item.createdAt)}</td>
                  <td>
                    <div>{item.userNick || '未设置昵称'}</div>
                    <div className="hint">{item.userId}</div>
                  </td>
                  <td>
                    <div>{item.packName}</div>
                    <div className="hint">{certLabel(item.domainName, item.certName)}</div>
                  </td>
                  <td>{QUIZ_MODE_LABELS[item.mode]}</td>
                  <td>{ADMIN_QUIZ_SESSION_STATUS_LABELS[item.status]}</td>
                  <td>
                    {item.progress.generated} / {item.progress.total}
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
            <h2>会话详情</h2>
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
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function DetailBody(props: { detail: AdminQuizSessionDetail; onFilterUser: () => void }) {
  const { detail } = props;
  return (
    <dl className="meta-list">
      <dt>用户</dt>
      <dd>
        {detail.userNick || '未设置昵称'}
        <div className="hint">{detail.userId}</div>
        <button type="button" className="tiny secondary" onClick={props.onFilterUser}>
          只看该用户
        </button>
      </dd>
      <dt>刷题包</dt>
      <dd>
        {detail.packName}
        {detail.packId ? <div className="hint">{detail.packId}</div> : null}
      </dd>
      <dt>证书</dt>
      <dd>{certLabel(detail.domainName, detail.certName)}</dd>
      <dt>模式</dt>
      <dd>{QUIZ_MODE_LABELS[detail.mode]}</dd>
      <dt>状态</dt>
      <dd>{ADMIN_QUIZ_SESSION_STATUS_LABELS[detail.status]}</dd>
      <dt>来源</dt>
      <dd>{ADMIN_QUIZ_SESSION_SOURCE_LABELS[detail.source]}</dd>
      <dt>进度</dt>
      <dd>
        {detail.progress.generated} / {detail.progress.total}
      </dd>
      <dt>错误</dt>
      <dd>{detail.error ? `${detail.error.code}：${detail.error.message}` : '无'}</dd>
      <dt>出题设置</dt>
      <dd>
        {detail.settingsReadable && detail.settings ? settingsLabel(detail.settings) : '无法读取'}
      </dd>
      <dt>开始时间</dt>
      <dd>{detail.startedAt ? formatTime(detail.startedAt) : '无'}</dd>
      <dt>截止时间</dt>
      <dd>{detail.deadlineAt ? formatTime(detail.deadlineAt) : '无'}</dd>
      <dt>创建时间</dt>
      <dd>{formatTime(detail.createdAt)}</dd>
      <dt>更新时间</dt>
      <dd>{formatTime(detail.updatedAt)}</dd>
      <dt>会话 ID</dt>
      <dd>{detail.id}</dd>
    </dl>
  );
}

function settingsLabel(settings: QuizSettings): string {
  const types = settings.types.map((type) => QUIZ_TYPE_LABELS[type]).join('、');
  return `${QUIZ_MODE_LABELS[settings.mode]} · ${settings.count} 题 · ${QUIZ_DIFFICULTY_LABELS[settings.difficulty]} · ${types} · ${timerLabel(settings)}`;
}

function timerLabel(settings: QuizSettings): string {
  if (!settings.timer.enabled) {
    return '不计时';
  }
  if (settings.timer.kind === 'paper') {
    return `整卷 ${settings.timer.paperMinutes} 分钟`;
  }
  return `每题 ${settings.timer.perQuestionSeconds} 秒`;
}

function certLabel(domainName: string | null, certName: string | null): string {
  if (domainName && certName) {
    return `${domainName} / ${certName}`;
  }
  return certName || domainName || '未记录证书';
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}
