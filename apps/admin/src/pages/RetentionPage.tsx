import { DATA_RETENTION_NOTICE, type RetentionPreview } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

interface RetentionView {
  quizGenerationLogsDays: number;
  userUploadAndExtractDays: number;
  updatedAt: string | null;
  updatedBy: string | null;
  notice: string;
}

export function RetentionPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [logsDays, setLogsDays] = useState('90');
  const [uploadDays, setUploadDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [preview, setPreview] = useState<RetentionPreview | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch<RetentionView>('/admin/system/retention', { token })
      .then((body) => {
        if (cancelled) {
          return;
        }
        setLogsDays(String(body.quizGenerationLogsDays));
        setUploadDays(String(body.userUploadAndExtractDays));
        setError('');
      })
      .catch((caught: unknown) => {
        if (cancelled) {
          return;
        }
        if (leaveIfUnauthorized(caught, navigate)) {
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
  }, [navigate, token]);

  function bodyFromInputs(): { quizGenerationLogsDays: number; userUploadAndExtractDays: number } | null {
    const quizGenerationLogsDays = Number(logsDays);
    const userUploadAndExtractDays = Number(uploadDays);
    if (!Number.isInteger(quizGenerationLogsDays) || !Number.isInteger(userUploadAndExtractDays)) {
      setError('天数必须是 1 到 3650 的整数');
      return null;
    }
    return { quizGenerationLogsDays, userUploadAndExtractDays };
  }

  async function save(next?: { quizGenerationLogsDays: number; userUploadAndExtractDays: number }) {
    const body = next ?? bodyFromInputs();
    if (!body || saving) {
      return;
    }
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const savedBody = await adminFetch<RetentionView>('/admin/system/retention', {
        method: 'PUT',
        token,
        body,
      });
      setLogsDays(String(savedBody.quizGenerationLogsDays));
      setUploadDays(String(savedBody.userUploadAndExtractDays));
      setSaved('已保存。清理由 Worker 执行，本页不提供当场清理。');
      setPreview(null);
    } catch (caught: unknown) {
      if (leaveIfUnauthorized(caught, navigate)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function previewRange() {
    const body = bodyFromInputs();
    if (!body || previewing) {
      return;
    }
    setPreviewing(true);
    setError('');
    try {
      const result = await adminFetch<RetentionPreview>('/admin/system/retention/preview', {
        method: 'POST',
        token,
        body,
      });
      setPreview(result);
    } catch (caught: unknown) {
      if (leaveIfUnauthorized(caught, navigate)) {
        return;
      }
      setError(caught instanceof Error ? caught.message : '预览失败');
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <section className="page system-page">
      <h1 className="system-title">数据保留周期</h1>
      {error ? (
        <p className="system-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="system-muted">读取中</p> : null}
      <article className="system-card system-retention">
        <h2>清理策略（脱敏本期不做）</h2>
        <label>
          出题日志保留天数
          <input
            inputMode="numeric"
            value={logsDays}
            onChange={(event) => {
              setLogsDays(event.target.value);
              setSaved('');
            }}
          />
        </label>
        <label>
          用户上传 / 提炼保留天数
          <input
            inputMode="numeric"
            value={uploadDays}
            onChange={(event) => {
              setUploadDays(event.target.value);
              setSaved('');
            }}
          />
        </label>
        <p className="system-muted">天数为 1…3650 的整数。{DATA_RETENTION_NOTICE}。</p>
        <div className="system-preview">
          <strong>预览结果（只计不删）</strong>
          {preview ? (
            <>
              <p>
                出题日志将删 {preview.quizGenerationLogs.count} 条
                {rangeText(preview.quizGenerationLogs.oldestAt, preview.quizGenerationLogs.newestAt)}
              </p>
              <p>
                用户上传将删 {preview.userUploads.count} 条
                {rangeText(preview.userUploads.oldestAt, preview.userUploads.newestAt)}
              </p>
              <p>提炼任务将删 {preview.extractJobs.count} 条。</p>
            </>
          ) : (
            <p>尚未预览。点下面的按钮只计数，不删除。</p>
          )}
          <p className="system-muted">
            以上计数按当前填写的天数计算。清理由 Worker 执行，本页只预览与保存天数，不提供当场清理。
          </p>
        </div>
        <div className="system-actions">
          <button type="button" className="secondary" disabled={previewing || saving} onClick={() => void previewRange()}>
            {previewing ? '预览中' : '预览将删范围（只计不删）'}
          </button>
          <button type="button" disabled={saving || previewing} onClick={() => void save()}>
            {saving ? '保存中' : '保存'}
          </button>
          <button
            type="button"
            className="secondary"
            disabled={saving || previewing}
            onClick={() => {
              setLogsDays('90');
              setUploadDays('90');
              void save({ quizGenerationLogsDays: 90, userUploadAndExtractDays: 90 });
            }}
          >
            恢复默认
          </button>
          {saved ? <span className="system-ok">{saved}</span> : null}
        </div>
      </article>
    </section>
  );
}

function rangeText(oldest: string | null, newest: string | null): string {
  if (!oldest || !newest) {
    return '。';
  }
  return `；最早 ${formatStamp(oldest)}，最晚 ${formatStamp(newest)}。`;
}

function formatStamp(iso: string): string {
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

function leaveIfUnauthorized(caught: unknown, navigate: ReturnType<typeof useNavigate>): boolean {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return true;
  }
  return false;
}
