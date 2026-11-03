import type { AdminCertificateLinkDetail, AdminCertificateLinkList } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../../api';
import {
  EMPTY_LINK_FILTERS,
  getAdminCertificateLink,
  listAdminCertificateLinks,
  type CertificateLinkFilterInput,
} from '../../certificates-api';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';
import { formatTime, latestScoreLabel, sourceLine, typeNames } from './format';

export function LinkPanel(props: {
  focus: CertificateLinkFilterInput | null;
  focusToken: number;
  onShowScores: (
    filters: Pick<CertificateLinkFilterInput, 'userId' | 'certId' | 'domainId'>,
  ) => void;
}) {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<CertificateLinkFilterInput>(EMPTY_LINK_FILTERS);
  const [applied, setApplied] = useState<CertificateLinkFilterInput>(EMPTY_LINK_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminCertificateLinkList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selected, setSelected] = useState<{ userId: string; certId: string } | null>(null);
  const [detail, setDetail] = useState<AdminCertificateLinkDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    if (props.focusToken === 0 || !props.focus) {
      return;
    }
    setDraft(props.focus);
    setApplied(props.focus);
    setPage(1);
    setSelected(null);
  }, [props.focus, props.focusToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminCertificateLinks(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '证书关联加载失败');
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
    if (!selected) {
      setDetail(null);
      setDetailError('');
      setDetailLoading(false);
      return;
    }
    let cancelled = false;
    setDetail(null);
    setDetailLoading(true);
    setDetailError('');
    getAdminCertificateLink(token, selected.userId, selected.certId)
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
  }, [detailReload, selected, token]);

  function leaveIfUnauthorized(caught: unknown): boolean {
    if (caught instanceof AdminApiError && caught.status === 401) {
      clearAdminSession();
      navigate('/login', { replace: true });
      return true;
    }
    return false;
  }

  function applyFilters(next: CertificateLinkFilterInput): void {
    setDraft(next);
    setApplied({
      userId: next.userId.trim(),
      certId: next.certId.trim(),
      domainId: next.domainId.trim(),
      touchedFrom: next.touchedFrom,
      touchedTo: next.touchedTo,
    });
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));

  return (
    <>
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
          领域 ID
          <input
            value={draft.domainId}
            autoComplete="off"
            placeholder="留空表示全部领域"
            onChange={(event) => setDraft({ ...draft, domainId: event.target.value })}
          />
        </label>
        <label>
          关联开始
          <input
            type="datetime-local"
            value={draft.touchedFrom}
            onChange={(event) => setDraft({ ...draft, touchedFrom: event.target.value })}
          />
        </label>
        <label>
          关联结束
          <input
            type="datetime-local"
            value={draft.touchedTo}
            onChange={(event) => setDraft({ ...draft, touchedTo: event.target.value })}
          />
        </label>
        <div className="actions">
          <button type="submit">查询</button>
          <button
            type="button"
            className="secondary"
            onClick={() => applyFilters(EMPTY_LINK_FILTERS)}
          >
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
      {loading && !list ? <p className="muted">正在加载证书关联…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的证书关联。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>最近关联</th>
                <th>用户</th>
                <th>证书</th>
                <th>状态</th>
                <th>关联</th>
                <th>最近分数</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => {
                const key = `${item.userId}:${item.id}`;
                const active = selected?.userId === item.userId && selected.certId === item.id;
                return (
                  <tr key={key} className={active ? 'selected' : undefined}>
                    <td>{formatTime(item.touchedAt)}</td>
                    <td>
                      <div>{item.userNick || '未设置昵称'}</div>
                      <div className="hint">{item.userId}</div>
                    </td>
                    <td>
                      <div>
                        {item.domainName} / {item.name}
                      </div>
                      <div className="hint">{item.id}</div>
                    </td>
                    <td>
                      <span className={item.status === 'online' ? 'tag' : 'tag off'}>
                        {item.status === 'online' ? '上架' : '已下架'}
                      </span>
                    </td>
                    <td>{sourceLine(item)}</td>
                    <td>{latestScoreLabel(item.latestScore)}</td>
                    <td>
                      <button
                        type="button"
                        className="tiny secondary"
                        onClick={() => setSelected({ userId: item.userId, certId: item.id })}
                      >
                        查看
                      </button>
                    </td>
                  </tr>
                );
              })}
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

      {selected ? (
        <section className="detail">
          <div className="catalog-head">
            <h2>关联详情</h2>
            <button type="button" className="secondary" onClick={() => setSelected(null)}>
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
            <LinkDetail
              detail={detail}
              onFilterUser={() =>
                applyFilters({ ...applied, userId: detail.userId, certId: '', domainId: '' })
              }
              onFilterCert={() =>
                applyFilters({ ...applied, certId: detail.id, userId: '', domainId: '' })
              }
              onFilterDomain={() =>
                applyFilters({ ...applied, domainId: detail.domainId, userId: '', certId: '' })
              }
              onShowScores={() =>
                props.onShowScores({
                  userId: detail.userId,
                  certId: detail.id,
                  domainId: detail.domainId,
                })
              }
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function LinkDetail(props: {
  detail: AdminCertificateLinkDetail;
  onFilterUser: () => void;
  onFilterCert: () => void;
  onFilterDomain: () => void;
  onShowScores: () => void;
}) {
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
      <dt>证书</dt>
      <dd>
        {detail.domainName} / {detail.name}
        <div className="hint">
          {detail.code} · {detail.id}
        </div>
        <button type="button" className="tiny secondary" onClick={props.onFilterCert}>
          只看该证书
        </button>
      </dd>
      <dt>领域</dt>
      <dd>
        {detail.domainName}
        <div className="hint">{detail.domainId}</div>
        <button type="button" className="tiny secondary" onClick={props.onFilterDomain}>
          只看该领域
        </button>
      </dd>
      <dt>状态</dt>
      <dd>{detail.status === 'online' ? '上架' : '已下架'}</dd>
      <dt>总分 / 及格线</dt>
      <dd>
        {detail.totalScore} / {detail.passScore === null ? '未设及格线' : detail.passScore}
      </dd>
      <dt>题型</dt>
      <dd>{typeNames(detail.enabledQuestionTypeCodes)}</dd>
      <dt>附加约束</dt>
      <dd>{detail.extraConstraint?.trim() ? detail.extraConstraint : '无'}</dd>
      <dt>刷题包</dt>
      <dd>
        {detail.packCount} 个
        {detail.activePackId ? <div className="hint">当前包 {detail.activePackId}</div> : null}
      </dd>
      <dt>未消灭错题</dt>
      <dd>{detail.pendingWrongCount}</dd>
      <dt>课件</dt>
      <dd>{detail.uploadCount}</dd>
      <dt>已交卷</dt>
      <dd>{detail.submittedCount}</dd>
      <dt>最近分数</dt>
      <dd>
        {latestScoreLabel(detail.latestScore)}
        {detail.latestScore ? (
          <div className="hint">会话 {detail.latestScore.sessionId}</div>
        ) : null}
      </dd>
      <dt>来源时间</dt>
      <dd>
        刷题包 {formatTime(detail.packTouchedAt)} · 错题 {formatTime(detail.wrongTouchedAt)} · 课件{' '}
        {formatTime(detail.uploadTouchedAt)} · 交卷 {formatTime(detail.submittedTouchedAt)}
      </dd>
      <dt>成绩</dt>
      <dd>
        <button type="button" className="tiny secondary" onClick={props.onShowScores}>
          查看该用户这张证书的成绩
        </button>
      </dd>
    </dl>
  );
}
