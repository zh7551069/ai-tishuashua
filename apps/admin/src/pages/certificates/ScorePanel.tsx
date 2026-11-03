import {
  QUIZ_MODE_LABELS,
  QUIZ_SUBMIT_REASON_LABELS,
  type AdminScoreDetail,
  type AdminScoreList,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../../api';
import {
  EMPTY_SCORE_FILTERS,
  getAdminScore,
  listAdminScores,
  type AdminScoreModeFilter,
  type ScoreFilterInput,
} from '../../certificates-api';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';
import {
  formatTime,
  passLabel,
  percent,
  scoreCertTitle,
  scorePackTitle,
  scorePoints,
} from './format';

export function ScorePanel(props: {
  focus: ScoreFilterInput | null;
  focusToken: number;
  onShowLinks: (filters: Pick<ScoreFilterInput, 'userId' | 'certId' | 'domainId'>) => void;
}) {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<ScoreFilterInput>(props.focus ?? EMPTY_SCORE_FILTERS);
  const [applied, setApplied] = useState<ScoreFilterInput>(props.focus ?? EMPTY_SCORE_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminScoreList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminScoreDetail | null>(null);
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
    setSelectedId(null);
  }, [props.focus, props.focusToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminScores(token, { ...applied, page })
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
          setError(caught instanceof Error ? caught.message : '成绩加载失败');
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
    getAdminScore(token, selectedId)
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

  function applyFilters(next: ScoreFilterInput): void {
    setDraft(next);
    setApplied({
      userId: next.userId.trim(),
      certId: next.certId.trim(),
      domainId: next.domainId.trim(),
      mode: next.mode,
      submittedFrom: next.submittedFrom,
      submittedTo: next.submittedTo,
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
          模式
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft({ ...draft, mode: event.target.value as AdminScoreModeFilter })
            }
          >
            <option value="all">全部</option>
            <option value="practice">练习</option>
            <option value="exam">考试</option>
          </select>
        </label>
        <label>
          交卷开始
          <input
            type="datetime-local"
            value={draft.submittedFrom}
            onChange={(event) => setDraft({ ...draft, submittedFrom: event.target.value })}
          />
        </label>
        <label>
          交卷结束
          <input
            type="datetime-local"
            value={draft.submittedTo}
            onChange={(event) => setDraft({ ...draft, submittedTo: event.target.value })}
          />
        </label>
        <div className="actions">
          <button type="submit">查询</button>
          <button
            type="button"
            className="secondary"
            onClick={() => applyFilters(EMPTY_SCORE_FILTERS)}
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
      {loading && !list ? <p className="muted">正在加载成绩…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的已交卷成绩。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>交卷时间</th>
                <th>用户</th>
                <th>证书</th>
                <th>刷题包</th>
                <th>模式</th>
                <th>得分</th>
                <th>及格</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>{formatTime(item.submittedAt)}</td>
                  <td>
                    <div>{item.userNick || '未设置昵称'}</div>
                    <div className="hint">{item.userId}</div>
                  </td>
                  <td>
                    <div>{scoreCertTitle(item)}</div>
                    <div className="hint">{item.certId || '未对上现存证书'}</div>
                  </td>
                  <td>{scorePackTitle(item)}</td>
                  <td>{QUIZ_MODE_LABELS[item.mode]}</td>
                  <td>{scorePoints(item)}</td>
                  <td>{passLabel(item)}</td>
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
            <h2>成绩详情</h2>
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
            <ScoreDetail
              detail={detail}
              onFilterUser={() =>
                applyFilters({ ...applied, userId: detail.userId, certId: '', domainId: '' })
              }
              onFilterCert={() =>
                detail.certId
                  ? applyFilters({ ...applied, certId: detail.certId, userId: '', domainId: '' })
                  : undefined
              }
              onFilterDomain={() =>
                detail.domainId
                  ? applyFilters({
                      ...applied,
                      domainId: detail.domainId,
                      userId: '',
                      certId: '',
                    })
                  : undefined
              }
              onShowLinks={() =>
                props.onShowLinks({
                  userId: detail.userId,
                  certId: detail.certId ?? '',
                  domainId: detail.domainId ?? '',
                })
              }
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function ScoreDetail(props: {
  detail: AdminScoreDetail;
  onFilterUser: () => void;
  onFilterCert: () => void;
  onFilterDomain: () => void;
  onShowLinks: () => void;
}) {
  const { detail } = props;
  const historical = detail.certName.trim();
  const current = detail.resolvedCertName?.trim() ?? '';
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
        {scoreCertTitle(detail)}
        {historical && current && historical !== current ? (
          <div className="hint">当前证书名：{current}</div>
        ) : null}
        <div className="hint">{detail.certId || '未对上现存证书'}</div>
        {detail.certId ? (
          <button type="button" className="tiny secondary" onClick={props.onFilterCert}>
            只看该证书
          </button>
        ) : null}
      </dd>
      <dt>领域</dt>
      <dd>
        {detail.domainName || '未对上领域'}
        {detail.domainId ? <div className="hint">{detail.domainId}</div> : null}
        {detail.domainId ? (
          <button type="button" className="tiny secondary" onClick={props.onFilterDomain}>
            只看该领域
          </button>
        ) : null}
      </dd>
      <dt>刷题包</dt>
      <dd>
        {scorePackTitle(detail)}
        {detail.packId ? <div className="hint">{detail.packId}</div> : null}
      </dd>
      <dt>模式</dt>
      <dd>{QUIZ_MODE_LABELS[detail.mode]}</dd>
      <dt>得分</dt>
      <dd>{scorePoints(detail)}</dd>
      <dt>正确率 / 得分率</dt>
      <dd>
        {percent(detail.accuracy, detail.readable)} · {percent(detail.scoreRate, detail.readable)}
      </dd>
      <dt>对题</dt>
      <dd>
        {detail.readable && detail.correctCount !== null && detail.questionCount !== null
          ? `${detail.correctCount} / ${detail.questionCount}`
          : '成绩无法读取'}
      </dd>
      <dt>错题</dt>
      <dd>
        {detail.readable
          ? `答错 ${detail.wrongCount} · 未作答 ${detail.unansweredCount} · 少选 ${detail.partialCount}`
          : '成绩无法读取'}
      </dd>
      <dt>及格</dt>
      <dd>{passLabel(detail)}</dd>
      <dt>交卷原因</dt>
      <dd>{detail.reason ? QUIZ_SUBMIT_REASON_LABELS[detail.reason] : '无'}</dd>
      <dt>开考</dt>
      <dd>{formatTime(detail.startedAt)}</dd>
      <dt>交卷</dt>
      <dd>{formatTime(detail.submittedAt)}</dd>
      <dt>创建</dt>
      <dd>{formatTime(detail.createdAt)}</dd>
      <dt>关联</dt>
      <dd>
        <button type="button" className="tiny secondary" onClick={props.onShowLinks}>
          {detail.certId ? '查看该用户与这张证书的关联' : '查看该用户的证书关联'}
        </button>
      </dd>
    </dl>
  );
}
