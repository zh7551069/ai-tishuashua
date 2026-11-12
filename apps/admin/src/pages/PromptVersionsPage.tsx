import type { PromptTemplateDetail, PromptVersionList } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAdminAction } from '../content/use-admin-action';
import {
  getPromptTemplate,
  listPromptVersions,
  rollbackPromptTemplate,
} from '../generation-config-api';

export function PromptVersionsPage() {
  const { id = '' } = useParams();
  const { token, pending, error, setError, run } = useAdminAction();
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [versions, setVersions] = useState<PromptVersionList | null>(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPromptTemplate(token, id), listPromptVersions(token, id)])
      .then(([template, history]) => {
        if (!cancelled) {
          setDetail(template);
          setVersions(history);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '版本加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, setError, token]);

  async function rollback(version: number): Promise<void> {
    setNotice('');
    const ok = await run(async () => {
      const result = await rollbackPromptTemplate(token, id, version);
      const [template, history] = await Promise.all([
        getPromptTemplate(token, id),
        listPromptVersions(token, id),
      ]);
      setDetail(template);
      setVersions(history);
      setNotice(`已复制 v${version} 为 v${result.version}。旧快照没有被改写。`);
    });
    if (!ok) {
      return;
    }
  }

  const locked = Boolean(detail?.locked);

  return (
    <section className="page gc-page">
      <header className="gc-head">
        <div>
          <p className="gc-crumb">出题配置 / Prompt 模板 / {detail?.code ?? '…'} / 版本列表</p>
          <h1>Prompt 模板</h1>
        </div>
        <Link className="secondary gc-link" to={`/config/prompts/${id}`}>
          返回编辑
        </Link>
      </header>
      <p className="gc-note">
        回滚会把该版复制为新版本，不会改旧快照，也不会把当前指针直接倒回旧号。本页不展示完整 Prompt 正文。
      </p>
      {locked ? <p className="gc-lock">模板已锁定。不能保存草稿、发布或回滚；须先解锁。</p> : null}
      {error ? <p className="gc-error">{error}</p> : null}
      {notice ? <p className="gc-note">{notice}</p> : null}
      <div className="table-card">
        <table className="grid">
          <thead>
            <tr>
              <th>版本号</th>
              <th>发布时间</th>
              <th>发布人</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {(versions?.items.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={5}>还没有已发布版本</td>
              </tr>
            ) : null}
            {versions?.items.map((item) => (
              <tr key={item.version}>
                <td>v{item.version}</td>
                <td>{item.publishedAt.replace('T', ' ').slice(0, 16)}</td>
                <td>{item.publishedBy}</td>
                <td>{item.current ? '当前已发布' : '历史版本'}</td>
                <td>
                  <button
                    type="button"
                    className={item.current ? undefined : 'secondary'}
                    disabled={locked || pending}
                    onClick={() => void rollback(item.version)}
                  >
                    {item.current ? '复制为新版本' : '回滚'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="gc-foot">样例行仅为稿面示意，不是业务种子。列表默认不展示全文。</p>
    </section>
  );
}
