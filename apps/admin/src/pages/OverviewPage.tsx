import type { AdminCertificate, AdminKnowledgeNode } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAdminCourseware } from '../courseware-api';
import { getCatalogTree, listCertificates, listDomains } from '../catalog-api';
import { useAdminAction } from '../content/use-admin-action';
import { getPromptStats } from '../generation-config-api';
import { getQuizGenerationStats } from '../quiz-logs-api';

export function OverviewPage() {
  const { token, report } = useAdminAction();
  const [onlineCerts, setOnlineCerts] = useState<number | null>(null);
  const [missingPass, setMissingPass] = useState<string[]>([]);
  const [uploads, setUploads] = useState<number | null>(null);
  const [hintGaps, setHintGaps] = useState<number | null>(null);
  const [failureRate, setFailureRate] = useState<number | null | undefined>(undefined);
  const [pendingDrafts, setPendingDrafts] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then(async (domains) => {
        const groups = await Promise.all(
          domains.items.map(async (domain) => {
            const list = await listCertificates(token, domain.id);
            return list.items;
          }),
        );
        if (cancelled) {
          return;
        }
        const certs = groups.flat();
        setOnlineCerts(certs.filter((item) => item.status === 'online').length);
        setMissingPass(
          certs
            .filter((item) => item.status === 'online' && item.passScore === null)
            .map((item) => item.name),
        );
        const gaps = await countEmptyHints(token, certs);
        if (!cancelled) {
          setHintGaps(gaps);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setOnlineCerts(null);
          setHintGaps(null);
        }
      });
    listAdminCourseware(token, { userId: '', certId: '', status: 'all', page: 1 })
      .then((list) => {
        if (!cancelled) {
          setUploads(list.total);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setUploads(null);
        }
      });
    getPromptStats(token)
      .then((stats) => {
        if (!cancelled) {
          setPendingDrafts(stats.pendingDraftCount);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setPendingDrafts(null);
        }
      });
    getQuizGenerationStats(token, 7)
      .then((stats) => {
        if (!cancelled) {
          setFailureRate(stats.failureRate);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setFailureRate(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [report, token]);

  return (
    <section className="page">
      <h1>工作台</h1>
      <div className="metric-grid">
        <Link className="metric" to="/config/prompts">
          <span>待发布草稿</span>
          <b>{pendingDrafts === null ? '…' : pendingDrafts}</b>
          <small>从未发布，或已发布但工作草稿和当前快照不同</small>
        </Link>
        <Link className="metric" to="/quiz-logs">
          <span>近 7 日出题失败率</span>
          <b>{formatFailureRate(failureRate)}</b>
          <small>分母是出题尝试。回落内置且成功不计失败</small>
        </Link>
        <Link className="metric" to="/content/certificates">
          <span>已上架证书</span>
          <b>{onlineCerts === null ? '…' : onlineCerts}</b>
          <small>内容配置里的上架证书</small>
        </Link>
        <Link className="metric" to="/courseware">
          <span>用户上传教材</span>
          <b>{uploads === null ? '…' : uploads}</b>
          <small>只读全量条数，不是近 7 日</small>
        </Link>
      </div>
      <article className="card-panel todo-card">
        <div className="todo-head">
          <h2>待办提醒</h2>
          <span className="hint">只读</span>
        </div>
        <ul>
          <li>
            {missingPass.length === 0
              ? '当前没有「已上架但未配及格线」的证书。'
              : `${missingPass.length} 个证书未配及格线（${missingPass.slice(0, 3).join('、')}）— 上架可用，App 默认 60`}
          </li>
          <li>
            {hintGaps === null
              ? '章节知识点的空提示词还没数完。'
              : hintGaps === 0
                ? '已读到的知识点都有 promptHint。'
                : `${hintGaps} 个知识点缺少 promptHint，不能启用`}
          </li>
          <li>待发布草稿来自出题配置。失败率来自出题日志，没有尝试时显示「—」。</li>
        </ul>
      </article>
      <div className="shortcut-row">
        <Link to="/content/domains">领域</Link>
        <Link to="/content/certificates">证书</Link>
        <Link to="/content/textbooks">教材</Link>
        <Link to="/content/knowledge">章节知识点</Link>
        <Link to="/config/prompts">Prompt 模板</Link>
        <Link to="/config/question-types">题型管理</Link>
        <Link to="/config/cert-types">证书题型与默认参数</Link>
        <Link to="/users">用户</Link>
        <Link to="/practice">练习记录</Link>
        <Link to="/quiz-logs">出题日志</Link>
        <Link to="/wrong-book">错题库</Link>
        <Link to="/courseware">用户上传教材</Link>
        <Link to="/certificates">证书与成绩</Link>
        <Link to="/quiz">出题会话</Link>
      </div>
    </section>
  );
}

function formatFailureRate(rate: number | null | undefined): string {
  if (rate === undefined) {
    return '…';
  }
  if (rate === null) {
    return '—';
  }
  const percent = Math.round(rate * 1000) / 10;
  return `${percent}%`;
}

async function countEmptyHints(token: string, certs: AdminCertificate[]): Promise<number> {
  const trees = await Promise.all(certs.map((item) => getCatalogTree(token, item.id)));
  let gaps = 0;
  for (const tree of trees) {
    for (const book of tree.textbooks) {
      gaps += countNodes(book.nodes);
    }
    gaps += countNodes(tree.independentPoints);
  }
  return gaps;
}

function countNodes(nodes: AdminKnowledgeNode[]): number {
  let gaps = 0;
  for (const node of nodes) {
    if (node.kind === 'knowledge_point' && node.status === 'online' && !node.promptHint?.trim()) {
      gaps += 1;
    }
    gaps += countNodes(node.children);
  }
  return gaps;
}
