import {
  ADMIN_QUESTION_BANK_SOURCE_LABELS,
  QUIZ_DIFFICULTY_LABELS,
  QUIZ_TYPE_LABELS,
  type AdminCertificate,
  type AdminDomain,
  type AdminKnowledgeNode,
  type AdminQuestionBankDetail,
  type AdminQuestionBankList,
  type AdminQuestionBankRange,
  type BankStatus,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import { getCatalogTree, listCertificates, listDomains } from '../catalog-api';
import { Drawer } from '../content/Drawer';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { getAdminQuestionBank, listAdminQuestionBank } from '../question-bank-api';
import { clearAdminSession } from '../session';

/** 对稿 design/bridge-export/admin-bank-20261107/，帧 28:166，卡 28:322。 */

interface Filters {
  domainId: string;
  certificateId: string;
  knowledgePointId: string;
  range: AdminQuestionBankRange;
}

const DEFAULT_FILTERS: Filters = {
  domainId: '',
  certificateId: '',
  knowledgePointId: '',
  range: '30d',
};

const RANGES: Array<{ value: AdminQuestionBankRange; label: string }> = [
  { value: '7d', label: '近 7 天' },
  { value: '30d', label: '近 30 天' },
  { value: '90d', label: '近 90 天' },
  { value: 'all', label: '全部' },
];

const STATUS_LABEL: Record<BankStatus, string> = {
  online: '在库',
  offline: '已下线',
};

export function QuestionBankPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(DEFAULT_FILTERS);
  const [applied, setApplied] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminQuestionBankList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [certificates, setCertificates] = useState<AdminCertificate[]>([]);
  const [points, setPoints] = useState<Array<{ id: string; name: string }>>([]);
  const [catalogError, setCatalogError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminQuestionBankDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then((result) => {
        if (!cancelled) {
          setDomains(result.items);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled && !leaveIfUnauthorized(caught)) {
          setCatalogError(caught instanceof Error ? caught.message : '领域加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (!draft.domainId) {
      setCertificates([]);
      return;
    }
    let cancelled = false;
    listCertificates(token, draft.domainId)
      .then((result) => {
        if (!cancelled) {
          setCertificates(result.items);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled && !leaveIfUnauthorized(caught)) {
          setCertificates([]);
          setCatalogError(caught instanceof Error ? caught.message : '证书加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.domainId, token]);

  useEffect(() => {
    if (!draft.certificateId) {
      setPoints([]);
      return;
    }
    let cancelled = false;
    getCatalogTree(token, draft.certificateId)
      .then((tree) => {
        if (cancelled) {
          return;
        }
        const next: Array<{ id: string; name: string }> = [];
        for (const book of tree.textbooks) {
          collectPoints(book.nodes, next);
        }
        collectPoints(tree.independentPoints, next);
        setPoints(dedupePoints(next));
      })
      .catch((caught: unknown) => {
        if (!cancelled && !leaveIfUnauthorized(caught)) {
          setPoints([]);
          setCatalogError(caught instanceof Error ? caught.message : '知识点加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft.certificateId, token]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminQuestionBank(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '题库加载失败');
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
    getAdminQuestionBank(token, selectedId)
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
    setApplied(next);
    setPage(1);
    setSelectedId(null);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));
  const showRows = Boolean(list && list.items.length > 0);
  const showEmpty = Boolean(list && list.items.length === 0 && !loading);

  return (
    <section className="bank-page" data-layer-id="28:166">
      <article className="bank-card" data-layer-id="28:322">
        <h1>题库（只读）</h1>
        <p className="bank-notice">仅查看 AI 落库题目；不做编辑器 / 审核流</p>
        <form
          className="bank-filters"
          onSubmit={(event) => {
            event.preventDefault();
            applyFilters(draft);
          }}
        >
          <label className="bank-filter">
            领域
            <select
              aria-label="领域"
              value={draft.domainId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  domainId: event.target.value,
                  certificateId: '',
                  knowledgePointId: '',
                })
              }
            >
              <option value="">全部</option>
              {domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bank-filter">
            证书
            <select
              aria-label="证书"
              value={draft.certificateId}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  certificateId: event.target.value,
                  knowledgePointId: '',
                })
              }
            >
              <option value="">全部</option>
              {certificates.map((certificate) => (
                <option key={certificate.id} value={certificate.id}>
                  {certificate.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bank-filter">
            知识点
            <select
              aria-label="知识点"
              value={draft.knowledgePointId}
              onChange={(event) => setDraft({ ...draft, knowledgePointId: event.target.value })}
            >
              <option value="">全部</option>
              {points.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}
                </option>
              ))}
            </select>
          </label>
          <label className="bank-filter">
            时间范围
            <select
              aria-label="时间范围"
              value={draft.range}
              onChange={(event) =>
                setDraft({ ...draft, range: event.target.value as AdminQuestionBankRange })
              }
            >
              {RANGES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="bank-query">
            查询
          </button>
        </form>
        {catalogError ? <p className="bank-error">{catalogError}</p> : null}
        {error ? (
          <p className="bank-error" role="alert">
            {error}{' '}
            <button
              type="button"
              className="bank-retry"
              onClick={() => setReloadToken((value) => value + 1)}
            >
              重试
            </button>
          </p>
        ) : null}
        <div className="bank-table" data-layer-id="28:349" role="table" aria-label="题库（只读）">
          <div className="bank-head" role="row">
            <span role="columnheader">题目摘要</span>
            <span role="columnheader">领域</span>
            <span role="columnheader">证书</span>
            <span role="columnheader">知识点</span>
            <span role="columnheader">来源</span>
            <span role="columnheader">入库时间</span>
            <span role="columnheader">操作</span>
          </div>
          {loading && !list ? <p className="bank-status">正在读取题库…</p> : null}
          {showEmpty ? (
            <div className="bank-empty" role="status">
              <strong>暂无落库题目</strong>
              <span>调整筛选后再查</span>
            </div>
          ) : null}
          {showRows
            ? list?.items.map((item) => (
                <div className="bank-row" role="row" key={item.id}>
                  <span role="cell" className="bank-summary" title={item.summary}>
                    {item.summary}
                  </span>
                  <span role="cell" className="bank-cell">
                    {item.domainName}
                  </span>
                  <span role="cell" className="bank-cell">
                    {item.certificateName}
                  </span>
                  <span role="cell" className="bank-cell">
                    {item.knowledgeLabel || '—'}
                  </span>
                  <span role="cell">
                    <span className="bank-source">
                      {ADMIN_QUESTION_BANK_SOURCE_LABELS[item.source]}
                    </span>
                  </span>
                  <span role="cell" className="bank-time">
                    {formatBankTime(item.createdAt)}
                  </span>
                  <span role="cell">
                    <button
                      type="button"
                      className="bank-view"
                      onClick={() => setSelectedId(item.id)}
                    >
                      查看
                    </button>
                  </span>
                </div>
              ))
            : null}
        </div>
        {list && list.total > 0 && pageCount > 1 ? (
          <div className="bank-pager">
            <button
              type="button"
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
              disabled={loading || page >= pageCount}
              onClick={() => setPage((value) => value + 1)}
            >
              下一页
            </button>
          </div>
        ) : null}
        <p className="bank-footnote">只读列表 · 无编辑 / 无删除 / 无审核操作</p>
      </article>
      <Drawer open={selectedId !== null} title="题目详情" onClose={() => setSelectedId(null)}>
        <p className="bank-detail-note">只读详情，不能编辑、删除或审核。</p>
        {detailLoading ? <p className="bank-status">正在读取题目…</p> : null}
        {detailError ? (
          <p className="bank-error" role="alert">
            {detailError}{' '}
            <button
              type="button"
              className="bank-retry"
              onClick={() => setDetailReload((value) => value + 1)}
            >
              重试
            </button>
          </p>
        ) : null}
        {detail ? <DetailBody detail={detail} /> : null}
      </Drawer>
    </section>
  );
}

function DetailBody(props: { detail: AdminQuestionBankDetail }) {
  const { detail } = props;
  return (
    <>
      <p className="bank-stem">{detail.stem}</p>
      <dl className="meta-list">
        <dt>题型</dt>
        <dd>{QUIZ_TYPE_LABELS[detail.type]}</dd>
        <dt>领域</dt>
        <dd>{detail.domainName}</dd>
        <dt>证书</dt>
        <dd>{detail.certificateName}</dd>
        <dt>知识点</dt>
        <dd>{detail.knowledgeLabel || '—'}</dd>
        <dt>来源</dt>
        <dd>{ADMIN_QUESTION_BANK_SOURCE_LABELS[detail.source]}</dd>
        <dt>入库时间</dt>
        <dd>{formatBankTime(detail.createdAt)}</dd>
        <dt>难度</dt>
        <dd>{detail.difficulty ? QUIZ_DIFFICULTY_LABELS[detail.difficulty] : '未标'}</dd>
        <dt>状态</dt>
        <dd>{STATUS_LABEL[detail.status]}（只展示，不能修改）</dd>
      </dl>
      <h3 className="bank-detail-heading">选项</h3>
      {detail.options.length === 0 ? (
        <p className="bank-status">没有选项。</p>
      ) : (
        <ul className="bank-options">
          {detail.options.map((option) => (
            <li key={option.id}>
              {option.id}. {option.text}
              {detail.answer.includes(option.id) ? '（正确）' : ''}
            </li>
          ))}
        </ul>
      )}
      <h3 className="bank-detail-heading">答案</h3>
      <p className="bank-stem">{detail.answer.length > 0 ? detail.answer.join('、') : '无'}</p>
      <h3 className="bank-detail-heading">解析</h3>
      <p className="bank-stem">{detail.analysis?.trim() ? detail.analysis : '无'}</p>
    </>
  );
}

function collectPoints(
  nodes: AdminKnowledgeNode[],
  into: Array<{ id: string; name: string }>,
): void {
  for (const node of nodes) {
    if (node.kind === 'knowledge_point') {
      into.push({ id: node.id, name: node.name });
    }
    if (node.children.length > 0) {
      collectPoints(node.children, into);
    }
  }
}

function dedupePoints(
  points: Array<{ id: string; name: string }>,
): Array<{ id: string; name: string }> {
  const seen = new Set<string>();
  return points.filter((point) => {
    if (seen.has(point.id)) {
      return false;
    }
    seen.add(point.id);
    return true;
  });
}

function formatBankTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')} ${pick('hour')}:${pick('minute')}`;
}
