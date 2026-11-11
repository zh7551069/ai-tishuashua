import { parseExportBound, validateExportWindow, type AdminPracticeRecordDetail, type AdminPracticeRecordList, type QuizMode } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import {
  exportPracticeRecords,
  getPracticeRecord,
  listPracticeRecords,
} from '../practice-records-api';
import { clearAdminSession } from '../session';
import { formatAdminTime, QueryPager } from './QueryPager';

interface Filters {
  userId: string;
  mode: QuizMode | 'all';
  includeWrongSet: boolean;
  from: string;
  to: string;
}

const EMPTY_FILTERS: Filters = {
  userId: '',
  mode: 'all',
  includeWrongSet: false,
  from: '',
  to: '',
};

export function PracticeRecordsPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [list, setList] = useState<AdminPracticeRecordList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminPracticeRecordDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listPracticeRecords(token, {
      userId: applied.userId,
      mode: applied.mode,
      includeWrongSet: applied.includeWrongSet,
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
          setError(caught instanceof Error ? caught.message : '练习记录加载失败');
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
    getPracticeRecord(token, selectedId, applied.includeWrongSet)
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
  }, [applied.includeWrongSet, selectedId, token]);

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
      await exportPracticeRecords(token, {
        userId: draft.userId.trim(),
        mode: draft.mode,
        includeWrongSet: draft.includeWrongSet,
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
          <h1>练习记录</h1>
          <p className="dq-note">只读。默认不含 wrongSet 再练。不能改分。历史是否通过沿用交卷快照。</p>
        </div>
        <div className="dq-actions">
          <button type="button" className="secondary" onClick={() => void onExport()} disabled={exporting}>
            {exporting ? '导出中' : '导出 CSV'}
          </button>
        </div>
      </header>
      <form
        className="dq-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setApplied({ ...draft, userId: draft.userId.trim() });
          setPage(1);
          setSelectedId(null);
        }}
      >
        <label>
          用户
          <input
            value={draft.userId}
            autoComplete="off"
            placeholder="用户 ID，可空"
            onChange={(event) => setDraft({ ...draft, userId: event.target.value })}
          />
        </label>
        <label>
          模式
          <select
            value={draft.mode}
            onChange={(event) => setDraft({ ...draft, mode: event.target.value as QuizMode | 'all' })}
          >
            <option value="all">全部</option>
            <option value="practice">练习</option>
            <option value="exam">考试</option>
          </select>
        </label>
        <label>
          导出开始
          <input type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        </label>
        <label>
          导出结束
          <input type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        </label>
        <label className="dq-check">
          <input
            type="checkbox"
            checked={draft.includeWrongSet}
            onChange={(event) => setDraft({ ...draft, includeWrongSet: event.target.checked })}
          />
          包含 wrongSet
        </label>
        <div className="dq-actions">
          <button type="submit">查询</button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              setApplied(EMPTY_FILTERS);
              setPage(1);
              setSelectedId(null);
            }}
          >
            重置
          </button>
        </div>
      </form>
      {exportError ? (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}{' '}
          <button type="button" className="secondary" onClick={() => setReloadToken((value) => value + 1)}>
            重试
          </button>
        </p>
      ) : null}
      {loading && !list ? <p className="muted">正在加载练习记录…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的练习记录。</p> : null}
      {list && list.items.length > 0 ? (
        <div className="dq-card">
          <table>
            <thead>
              <tr>
                <th>场次 ID</th>
                <th>模式</th>
                <th>来源</th>
                <th>得分</th>
                <th>用时</th>
                <th>证书</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>
                    <button type="button" className="linkish" onClick={() => setSelectedId(item.id)}>
                      {shortId(item.id)}
                    </button>
                    <div className="hint">{item.userNick || '未设置昵称'}</div>
                  </td>
                  <td>{item.mode === 'exam' ? '考试' : '练习'}</td>
                  <td>{item.source}</td>
                  <td>{scoreLabel(item.scoreReadable, item.score, item.totalScore, item.passed)}</td>
                  <td>{item.durationSeconds === null ? '无' : `${item.durationSeconds} 秒`}</td>
                  <td>
                    <div>{item.certName || '无证书名'}</div>
                    <div className="hint">{item.packName}</div>
                  </td>
                  <td>{formatAdminTime(item.submittedAt)}</td>
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
      <p className="dq-foot">导出 CSV 必须先选开始和结束日期，跨度不超过 31 个自然日（Asia/Shanghai）。不改分，也不导出题目。</p>
      {selectedId ? (
        <section className="detail">
          <div className="catalog-head">
            <h2>练习详情</h2>
            <button type="button" className="secondary" onClick={() => setSelectedId(null)}>
              关闭
            </button>
          </div>
          {detailLoading ? <p className="muted">正在加载详情…</p> : null}
          {detailError ? <p className="form-error">{detailError}</p> : null}
          {detail ? (
            <dl className="meta-list">
              <dt>场次</dt>
              <dd>{detail.id}</dd>
              <dt>用户</dt>
              <dd>
                {detail.userNick || '未设置昵称'}
                <div className="hint">{detail.userId}</div>
              </dd>
              <dt>结果</dt>
              <dd>
                {scoreLabel(detail.scoreReadable, detail.score, detail.totalScore, detail.passed)}
                {detail.scoreReadable && detail.accuracy !== null
                  ? `，正确率 ${formatRate(detail.accuracy)}`
                  : ''}
              </dd>
              <dt>对 / 错 / 部分 / 未答</dt>
              <dd>
                {countText(detail.correctCount)} / {countText(detail.wrongCount)} / {countText(detail.partialCount)} /{' '}
                {countText(detail.unansweredCount)}
              </dd>
              <dt>交卷原因</dt>
              <dd>{detail.submitReason || '无'}</dd>
              <dt>用时</dt>
              <dd>{detail.durationSeconds === null ? '无' : `${detail.durationSeconds} 秒`}</dd>
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

function scoreLabel(
  readable: boolean,
  score: number | null,
  total: number | null,
  passed: boolean | null,
): string {
  if (!readable || score === null || total === null) {
    return '成绩无法读取';
  }
  const pass = passed === null ? '' : passed ? '，通过' : '，未通过';
  return `${score} / ${total}${pass}`;
}

function countText(value: number | null): string {
  return value === null ? '无' : String(value);
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function shortId(value: string): string {
  return value.slice(0, 8);
}
