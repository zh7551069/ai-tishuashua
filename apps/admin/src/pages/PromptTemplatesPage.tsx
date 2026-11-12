import type { PromptScope, PromptStatus, PromptTemplateList } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import { listPromptTemplates, publishPromptTemplate } from '../generation-config-api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';
import { QueryPager } from './QueryPager';

const SCOPE_LABEL: Record<PromptScope, string> = {
  global: 'global',
  domain: 'domain',
  certificate: 'certificate',
};

export function PromptTemplatesPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const [q, setQ] = useState('');
  const [appliedQ, setAppliedQ] = useState('');
  const [scope, setScope] = useState<PromptScope | ''>('');
  const [status, setStatus] = useState<PromptStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [list, setList] = useState<PromptTemplateList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listPromptTemplates(session.token, {
      q: appliedQ,
      scope,
      status,
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
          if (leaveIfUnauthorized(caught, navigate)) {
            return;
          }
          setList(null);
          setError(caught instanceof Error ? caught.message : '模板加载失败');
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
  }, [appliedQ, navigate, page, pageSize, reloadToken, scope, session.token, status]);

  async function publish(id: string): Promise<void> {
    setError('');
    try {
      await publishPromptTemplate(session.token, id);
      setReloadToken((value) => value + 1);
    } catch (caught) {
      if (leaveIfUnauthorized(caught, navigate)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '发布失败');
    }
  }

  return (
    <section className="page gc-page">
      <header className="gc-head">
        <div>
          <p className="gc-crumb">出题配置 / Prompt 模板</p>
          <h1>Prompt 模板</h1>
        </div>
        <Link className="gc-primary" to="/config/prompts/new">
          新建模板
        </Link>
      </header>
      <form
        className="gc-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setAppliedQ(q.trim());
          setPage(1);
        }}
      >
        <label>
          搜索
          <input
            className="search"
            value={q}
            placeholder="搜索模板 code / 名称"
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label>
          Scope
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as PromptScope | '');
              setPage(1);
            }}
          >
            <option value="">全部</option>
            <option value="global">global</option>
            <option value="domain">domain</option>
            <option value="certificate">certificate</option>
          </select>
        </label>
        <label>
          状态
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as PromptStatus | 'all');
              setPage(1);
            }}
          >
            <option value="all">全部</option>
            <option value="draft">draft</option>
            <option value="published">published</option>
          </select>
        </label>
        <button type="submit" className="secondary">
          查询
        </button>
      </form>
      {error ? <p className="gc-error">{error}</p> : null}
      <div className="table-card">
        <table className="grid">
          <thead>
            <tr>
              <th>名称</th>
              <th>Code</th>
              <th>Scope</th>
              <th>Version</th>
              <th>状态</th>
              <th>锁定</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7}>加载中</td>
              </tr>
            ) : null}
            {!loading && (list?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7}>没有匹配的模板</td>
              </tr>
            ) : null}
            {list?.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="mono">{item.code}</td>
                <td>{SCOPE_LABEL[item.scope]}</td>
                <td>v{item.version}</td>
                <td>
                  <span className={item.status === 'published' ? 'gc-pill on' : 'gc-pill'}>
                    {item.status}
                    {item.hasDirtyDraft && item.status === 'published' ? ' · 草稿未发布' : ''}
                  </span>
                </td>
                <td>{item.locked ? '已锁定' : '未锁定'}</td>
                <td className="ops">
                  <Link to={`/config/prompts/${item.id}`}>编辑</Link>
                  <span className="op-sep">·</span>
                  <Link to={`/config/prompts/${item.id}/versions`}>版本</Link>
                  <span className="op-sep">·</span>
                  <Link to={`/config/prompts/${item.id}`}>{item.locked ? '解锁' : '锁定'}</Link>
                  {item.hasDirtyDraft ? (
                    <>
                      <span className="op-sep">·</span>
                      <button type="button" className="link" onClick={() => void publish(item.id)}>
                        发布
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="op-sep">·</span>
                      <Link to={`/config/prompts/${item.id}/versions`}>回滚</Link>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gc-foot">列表不展示 Prompt 正文。只有已发布快照会被出题消费。</p>
      <QueryPager
        page={page}
        pageSize={pageSize}
        total={list?.total ?? 0}
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

function leaveIfUnauthorized(
  caught: unknown,
  navigate: ReturnType<typeof useNavigate>,
): boolean {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return true;
  }
  return false;
}
