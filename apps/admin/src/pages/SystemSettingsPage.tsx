import type { FreeUserBankFirstSetting } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

export function SystemSettingsPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [setting, setSetting] = useState<FreeUserBankFirstSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch<FreeUserBankFirstSetting>('/admin/system-settings/freeUserBankFirst', { token })
      .then((body) => {
        if (!cancelled) {
          setSetting(body);
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
  }, [navigate, token]);

  async function toggle(): Promise<void> {
    if (!setting || saving) {
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = await adminFetch<FreeUserBankFirstSetting>(
        '/admin/system-settings/freeUserBankFirst',
        { method: 'PUT', token, body: { enabled: !setting.enabled } },
      );
      setSetting(next);
    } catch (caught: unknown) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        clearAdminSession();
        navigate('/login', { replace: true });
        return;
      }
      setError(caught instanceof Error ? caught.message : '保存失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page">
      <h1>免费用户题库优先</h1>
      <div className="card-panel todo-card">
        <p>仅影响免费用户；默认关。会员仍按 AI 出题并入库。这一页是占位，正式像素另过 UI 评审。</p>
        {loading ? <p className="hint">读取中</p> : null}
        {setting ? (
          <p>
            当前：<b>{setting.enabled ? '开' : '关'}</b>
            {setting.updatedBy ? ` · ${setting.updatedBy}` : ''}
          </p>
        ) : null}
        {error ? <p className="hint">{error}</p> : null}
        <button type="button" disabled={!setting || saving} onClick={() => void toggle()}>
          {saving ? '保存中' : setting?.enabled ? '关闭' : '打开'}
        </button>
      </div>
    </section>
  );
}
