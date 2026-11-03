import {
  ADMIN_CERTIFICATE_SOURCE_LABELS,
  ADMIN_CERTIFICATE_UNREADABLE_SCORE,
  type AdminCertificateScoreDetail,
  type AdminCertificateScoreList,
  type AdminCertificateScoreQuestion,
  type AdminCertificateScoreSummary,
  QUIZ_MODE_LABELS,
  QUIZ_SUBMIT_REASON_LABELS,
  QUIZ_TYPE_LABELS,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError } from '../api';
import {
  getAdminCertificate,
  listAdminCertificates,
  type AdminCertificateModeFilter,
} from '../certificates-api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

interface Filters {
  userId: string;
  certId: string;
  mode: AdminCertificateModeFilter;
}

const EMPTY_FILTERS: Filters = { userId: '', certId: '', mode: 'all' };

const MODE_OPTIONS: { value: AdminCertificateModeFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'practice', label: QUIZ_MODE_LABELS.practice },
  { value: 'exam', label: QUIZ_MODE_LABELS.exam },
];

export function CertificatesPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [draft, setDraft] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [list, setList] = useState<AdminCertificateScoreList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminCertificateScoreDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailReload, setDetailReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    listAdminCertificates(token, { ...applied, page })
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
    getAdminCertificate(token, selectedId)
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
      certId: next.certId.trim(),
      mode: next.mode,
    });
    setPage(1);
  }

  const pageCount = Math.max(1, Math.ceil((list?.total ?? 0) / (list?.pageSize || 20)));

  return (
    <section className="panel wide">
      <h1>证书与成绩</h1>
      <p className="muted">
        只读查看全站已交卷成绩。默认包含练习和考试，按交卷时间从新到旧。这里不能改分数、删除证书或消灭错题。未交卷的出题会话在「出题会话」，不在这一页。
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
          证书 ID
          <input
            value={draft.certId}
            autoComplete="off"
            placeholder="留空表示全部证书"
            onChange={(event) => setDraft({ ...draft, certId: event.target.value })}
          />
        </label>
        <label>
          模式
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft({ ...draft, mode: event.target.value as AdminCertificateModeFilter })
            }
          >
            {MODE_OPTIONS.map((option) => (
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
      {loading && !list ? <p className="muted">正在加载成绩…</p> : null}
      {list && list.items.length === 0 && !loading ? <p>没有符合条件的成绩。</p> : null}

      {list && list.items.length > 0 ? (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>交卷时间</th>
                <th>用户</th>
                <th>证书</th>
                <th>模式</th>
                <th>成绩</th>
                <th>刷题包</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.items.map((item) => (
                <tr key={item.id} className={item.id === selectedId ? 'selected' : undefined}>
                  <td>{item.submittedAt ? formatTime(item.submittedAt) : '无'}</td>
                  <td>
                    <div>{item.userNick || '未设置昵称'}</div>
                    <div className="hint">{item.userId}</div>
                  </td>
                  <td>
                    <div>{certLabel(item)}</div>
                    {item.certId ? <div className="hint">{item.certId}</div> : null}
                    {!item.certId && item.snapshotCertName ? (
                      <div className="hint">证书已不在目录</div>
                    ) : null}
                  </td>
                  <td>{QUIZ_MODE_LABELS[item.mode]}</td>
                  <td>
                    <div>{scoreLabel(item)}</div>
                    <div className="hint">{passedLabel(item)}</div>
                  </td>
                  <td>{item.packName}</td>
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
            <DetailBody
              detail={detail}
              onFilterUser={() => applyFilters({ ...applied, userId: detail.userId })}
              onFilterCert={
                detail.certId
                  ? () => applyFilters({ ...applied, certId: detail.certId ?? '' })
                  : undefined
              }
            />
          ) : null}
        </section>
      ) : null}
    </section>
  );
}

function DetailBody(props: {
  detail: AdminCertificateScoreDetail;
  onFilterUser: () => void;
  onFilterCert?: () => void;
}) {
  const { detail } = props;
  return (
    <>
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
          {certLabel(detail)}
          {detail.certId ? <div className="hint">{detail.certId}</div> : null}
          {!detail.certId && detail.snapshotCertName ? (
            <div className="hint">证书已不在目录</div>
          ) : null}
          {props.onFilterCert ? (
            <button type="button" className="tiny secondary" onClick={props.onFilterCert}>
              只看该证书
            </button>
          ) : null}
        </dd>
        <dt>刷题包</dt>
        <dd>
          {detail.packName}
          {detail.packId ? <div className="hint">{detail.packId}</div> : null}
        </dd>
        <dt>模式</dt>
        <dd>{QUIZ_MODE_LABELS[detail.mode]}</dd>
        <dt>来源</dt>
        <dd>{ADMIN_CERTIFICATE_SOURCE_LABELS[detail.source]}</dd>
        <dt>成绩</dt>
        <dd>
          {scoreLabel(detail)}
          <div className="hint">{passedLabel(detail)}</div>
        </dd>
        <dt>正确率</dt>
        <dd>
          {detail.scoreReadable && detail.accuracy != null ? formatRate(detail.accuracy) : '无'}
        </dd>
        <dt>得分率</dt>
        <dd>
          {detail.scoreReadable && detail.scoreRate != null ? formatRate(detail.scoreRate) : '无'}
        </dd>
        <dt>对题</dt>
        <dd>{countLabel(detail.scoreReadable, detail.correctCount, detail.questionCount)}</dd>
        <dt>答错 / 未答 / 少选</dt>
        <dd>
          {detail.scoreReadable
            ? `${detail.wrongCount ?? 0} / ${detail.unansweredCount ?? 0} / ${detail.partialCount ?? 0}`
            : '无'}
        </dd>
        <dt>及格线</dt>
        <dd>{detail.passScore == null ? '无' : formatScore(detail.passScore)}</dd>
        <dt>交卷原因</dt>
        <dd>{detail.reason ? QUIZ_SUBMIT_REASON_LABELS[detail.reason] : '无'}</dd>
        <dt>开始时间</dt>
        <dd>{detail.startedAt ? formatTime(detail.startedAt) : '无'}</dd>
        <dt>交卷时间</dt>
        <dd>{detail.submittedAt ? formatTime(detail.submittedAt) : '无'}</dd>
        <dt>会话 ID</dt>
        <dd>{detail.id}</dd>
      </dl>
      <h2>题目</h2>
      <p className="muted">下面是交卷时记下的选择和答案，不会按现在的及格线重算这场成绩。</p>
      {detail.questions.length === 0 ? (
        <p className="muted">这份答卷没有题目。</p>
      ) : (
        <ol>
          {detail.questions.map((question) => (
            <QuestionItem key={question.id} question={question} />
          ))}
        </ol>
      )}
    </>
  );
}

function QuestionItem(props: { question: AdminCertificateScoreQuestion }) {
  const { question } = props;
  return (
    <li>
      <strong>
        {question.type ? QUIZ_TYPE_LABELS[question.type] : '题型无法读取'} ·{' '}
        {formatScore(question.score)} 分
      </strong>
      <p>{question.stem}</p>
      {question.options.length === 0 ? (
        <p className="muted">没有选项。</p>
      ) : (
        <ul>
          {question.options.map((option) => (
            <li key={option.id}>
              {option.id}. {option.text}
              {question.answer.includes(option.id) ? '（正确）' : ''}
              {question.selected.includes(option.id) ? '（已选）' : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">
        选择：{question.selected.length > 0 ? question.selected.join('、') : '未作答'}
        {' · '}
        答案：{question.answer.length > 0 ? question.answer.join('、') : '无'}
      </p>
      <p>{question.analysis.trim() ? question.analysis : '无解析'}</p>
      <p className="hint">
        知识点 ID：{question.kpIds.length > 0 ? question.kpIds.join('、') : '无'}
      </p>
    </li>
  );
}

function certLabel(
  item: Pick<AdminCertificateScoreSummary, 'domainName' | 'certName' | 'snapshotCertName'>,
): string {
  if (item.domainName && item.certName) {
    return `${item.domainName} / ${item.certName}`;
  }
  if (item.certName) {
    return item.certName;
  }
  return item.snapshotCertName || '未关联证书';
}

function scoreLabel(item: AdminCertificateScoreSummary): string {
  if (!item.scoreReadable || item.earnedScore == null || item.totalScore == null) {
    return ADMIN_CERTIFICATE_UNREADABLE_SCORE;
  }
  return `${formatScore(item.earnedScore)} / ${formatScore(item.totalScore)}`;
}

function passedLabel(item: AdminCertificateScoreSummary): string {
  if (!item.scoreReadable) {
    return ADMIN_CERTIFICATE_UNREADABLE_SCORE;
  }
  if (item.passed === true) {
    return '及格';
  }
  if (item.passed === false) {
    return '未及格';
  }
  return '无及格线';
}

function countLabel(readable: boolean, correct: number | null, total: number | null): string {
  if (!readable || correct == null || total == null) {
    return '无';
  }
  return `${correct} / ${total}`;
}

function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

function formatRate(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString('zh-CN', { hour12: false });
}
