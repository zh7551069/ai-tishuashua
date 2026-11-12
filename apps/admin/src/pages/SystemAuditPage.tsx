import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { QueryPager } from './QueryPager';
import { clearAdminSession } from '../session';

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  target: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}

interface AuditPage {
  items: AuditItem[];
  total: number;
  page: number;
  pageSize: number;
}

const PREFIXES = ['', 'commerce.', 'catalog.', 'prompt.', 'questionType.', 'certTypeConfig.', 'system.'];

export function SystemAuditPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [q, setQ] = useState('');
  const [draftQ, setDraftQ] = useState('');
  const [actionPrefix, setActionPrefix] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('pageSize', String(pageSize));
    if (q) {
      params.set('q', q);
    }
    if (actionPrefix) {
      params.set('actionPrefix', actionPrefix);
    }
    setLoading(true);
    adminFetch<AuditPage>(`/admin/system/audit?${params.toString()}`, { token })
      .then((body) => {
        if (!cancelled) {
          setData(body);
          setError('');
        }
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (caught instanceof AdminApiError && caught.status === 401) {
          clearAdminSession();
          navigate('/login', { replace: true });
          return;
        }
        setError(caught instanceof Error ? caught.message : '读取失败');
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [actionPrefix, navigate, page, pageSize, q, reloadKey, token]);

  return (
    <section className="page system-page">
      <h1 className="system-title">操作审计</h1>
      <div className="system-toolbar">
        <form
          className="system-search"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setQ(draftQ.trim());
          }}
        >
          <input
            value={draftQ}
            placeholder="操作人 / 实体"
            aria-label="操作人 / 实体"
            onChange={(event) => setDraftQ(event.target.value)}
          />
        </form>
        <label className="system-prefix">
          <span className="visually-hidden">动作前缀</span>
          <select
            value={actionPrefix}
            onChange={(event) => {
              setActionPrefix(event.target.value);
              setPage(1);
            }}
          >
            {PREFIXES.map((prefix) => (
              <option key={prefix || 'all'} value={prefix}>
                {prefix || '全部动作'}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="secondary" disabled title="本期不提供全站审计导出">
          导出
        </button>
      </div>
      {error ? (
        <p className="system-error" role="alert">
          {error}
          <button type="button" className="secondary" onClick={() => setReloadKey((value) => value + 1)}>
            重试
          </button>
        </p>
      ) : null}
      {loading && !data ? <p className="system-muted">读取中</p> : null}
      <div className="system-table">
        <div className="system-row system-row-head">
          <span>时间</span>
          <span>操作人</span>
          <span>实体</span>
          <span>变更摘要</span>
          <span>结果</span>
        </div>
        {data && data.items.length === 0 ? <p className="system-empty">没有审计记录</p> : null}
        {data?.items.map((item) => (
          <div className="system-row" key={item.id}>
            <span>{formatAuditTime(item.createdAt)}</span>
            <span>{item.actor}</span>
            <span title={item.target}>{item.target}</span>
            <span title={summarizeAudit(item)}>{summarizeAudit(item)}</span>
            <span>
              <em className="system-result">成功</em>
            </span>
          </div>
        ))}
      </div>
      <QueryPager
        page={data?.page ?? page}
        pageSize={data?.pageSize ?? pageSize}
        total={data?.total ?? 0}
        loading={loading}
        onPage={setPage}
        onPageSize={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </section>
  );
}

function formatAuditTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(date)
    .replace('T', ' ');
}

function summarizeAudit(item: AuditItem): string {
  const before = asRecord(item.before);
  const after = asRecord(item.after);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const parts: string[] = [];
  for (const key of keys) {
    if (key === 'id') {
      continue;
    }
    const left = before[key];
    const right = after[key];
    if (JSON.stringify(left) === JSON.stringify(right)) {
      if (key === 'status' && (right === 'online' || right === 'offline')) {
        parts.push(`status 保持${right === 'online' ? '上架' : '下架'}`);
      }
      continue;
    }
    parts.push(`${key} ${showValue(left)}→${showValue(right)}`);
  }
  return parts.length > 0 ? parts.join('；') : item.action;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function showValue(value: unknown): string {
  if (value === undefined || value === null) {
    return '空';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value);
}
