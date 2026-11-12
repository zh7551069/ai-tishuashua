import {
  parseExportBound,
  validateExportWindow,
  type AdminQuizGenerationLogDetail,
  type AdminQuizGenerationLogList,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import {
  exportQuizGenerationLogs,
  getQuizGenerationLog,
  listQuizGenerationLogs,
  type TriFilter,
} from '../quiz-logs-api';
import { clearAdminSession } from '../session';
import { formatAdminTime, QueryPager } from './QueryPager';

interface Filters {
  userId: string;
  success: TriFilter;
  usedBuiltin: TriFilter;
  errorCode: string;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  userId: '',
  success: 'all',
  usedBuiltin: 'all',
  errorCode: '',
  from: '',
  to: '',
};

export function QuizLogsPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [list, setList] = useState<AdminQuizGenerationLogList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminQuizGenerationLogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listQuizGenerationLogs(token, {
      userId: applied.userId,
      success: applied.success,
      usedBuiltin: applied.usedBuiltin,
      errorCode: applied.errorCode,
      page,
      pageSize,
    })
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
          setError(caught instanceof Error ? caught.message : '出题日志加载失败');
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
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    getQuizGenerationLog(token, selectedId)
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
  }, [selectedId, token]);

  function leaveIfUnauthorized(caught: unknown): boolean {
    if (caught instanceof AdminApiError && caught.status === 401) {
      clearAdminSession();
      navigate('/login', { replace: true });
      return true;
    }
    return false;
  }

  async function onExport() {
    const windowError = exportWindowError(draft.from, draft.to);
    if (windowError) {
      setExportError(windowError);
      return;
    }
    setExporting(true);
    setExportError('');
    try {
      await exportQuizGenerationLogs(token, {
        userId: draft.userId.trim(),
        success: draft.success,
        usedBuiltin: draft.usedBuiltin,
        errorCode: draft.errorCode.trim(),
        from: draft.from,
        to: draft.to,
      });
    } catch (caught) {
      if (leaveIfUnauthorized(caught)) {
        return;
      }
      setExportError(caught instanceof Error ? caught.message : '导出失败');
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="dq-page">
      <header className="dq-head">
        <div>
          <h1>出题日志</h1>
          <p className="dq-note">一次尝试一行。回落内置且出题成功不是失败，清理周期在系统 / 数据保留周期。</p>
        </div>
        <button type="button" className="secondary" onClick={() => void onExport()} disabled={exporting}>
          {exporting ? '导出中' : '导出 CSV'}
        </button>
      </header>
      <div className="dq-chips" role="group" aria-label="成败">
        {(
          [
            ['all', '全部'],
            ['true', '成功'],
            ['false', '失败'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={draft.success === value ? 'active' : undefined}
            onClick={() => {
              const next = { ...draft, success: value };
              setDraft(next);
              setApplied({ ...next, userId: next.userId.trim(), errorCode: next.errorCode.trim() });
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <form
        className="dq-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, userId: draft.userId.trim(), errorCode: draft.errorCode.trim() });
          setPage(1);
        }}
      >
        <label>
          用户
          <input
            value={draft.userId}
            placeholder="用户 ID，可空"
            onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
          />
        </label>
        <label>
          回落内置
          <select
            value={draft.usedBuiltin}
            onChange={(event) => setDraft({ ...draft, usedBuiltin: event.target.value as TriFilter })}
          >
            <option value="all">全部</option>
            <option value="true">是</option>
            <option value="false">否</option>
          </select>
        </label>
        <label>
          原因码
          <input
            value={draft.errorCode}
            placeholder="精确匹配，可空"
            onChange={(event) => setDraft({ ...draft, errorCode: event.target.value })}
          />
        </label>
        <label>
          导出开始
          <input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        </label>
        <label>
          导出结束
          <input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        </label>
        <button type="submit">查询</button>
      </form>
      {exportError ? <p className="form-error">{exportError}</p> : null}
      {error ? (
        <p className="form-error">
          {error}{' '}
          <button type="button" className="secondary" onClick={() => setReloadToken((value) => value + 1)}>
            重试
          </button>
        </p>
      ) : null}
      {loading && !list ? <p className="muted">正在加载出题日志…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的出题日志。</p> : null}
      {list && list.items.length > 0 ? (
        <div className="dq-card">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>结果</th>
                <th>回落内置</th>
                <th>模板</th>
                <th>原因码</th>
                <th>证书</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>
                    <button type="button" className="linkish" onClick={() => setSelectedId(item.id)}>
                      {formatAdminTime(item.createdAt)}
                    </button>
                  </td>
                  <td>
                    <span className={item.success ? 'dq-badge ok' : 'dq-badge bad'}>
                      {item.success ? '成功' : '失败'}
                    </span>
                  </td>
                  <td>{item.usedBuiltin ? '是' : '否'}</td>
                  <td>{item.templateCode || (item.templateVersion === null ? '已发布' : `v${item.templateVersion}`)}</td>
                  <td>{item.success ? '—' : item.errorCode || '无'}</td>
                  <td>
                    <div>{item.certName || '无'}</div>
                    <div className="hint">{item.userNick || '未设置昵称'}</div>
                  </td>
                  <td>{item.durationMs === null ? '无' : `${item.durationMs} ms`}</td>
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
        无 published 模板时回落内置，usedBuiltin 为是，只要组卷成功就不算失败。列表不展示 Prompt 正文。导出先收 31 日时间窗。
      </p>
      {selectedId ? (
        <section className="detail">
          <div className="catalog-head">
            <h2>日志详情</h2>
            <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
              关闭
            </button>
          </div>
          {detailLoading ? <p className="muted">正在加载详情…</p> : null}
          {detailError ? <p className="form-error">{detailError}</p> : null}
          {detail ? (
            <dl className="meta-list">
              <dt>结果</dt>
              <dd>
                {detail.success ? '成功' : '失败'}
                {detail.usedBuiltin ? '，回落内置' : ''}
              </dd>
              <dt>错误</dt>
              <dd>{detail.errorMessage || detail.errorCode || '无'}</dd>
              <dt>请求摘要</dt>
              <dd>
                题量 {detail.requestSummary.count ?? '无'}，难度 {detail.requestSummary.difficulty || '无'}，模式{' '}
                {detail.requestSummary.mode || '无'}，来源 {detail.requestSummary.source || '无'}
              </dd>
              <dt>会话</dt>
              <dd>{detail.sessionId || '无'}</dd>
            </dl>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function exportWindowError(from: string, to: string): string {
  if (!from.trim() || !to.trim()) {
    return '导出前请先填写开始和结束日期';
  }
  const start = parseExportBound(from, 'from');
  const end = parseExportBound(to, 'to');
  if (!start || !end) {
    return '导出时间格式不正确';
  }
  return validateExportWindow(start, end) ?? '';
}
