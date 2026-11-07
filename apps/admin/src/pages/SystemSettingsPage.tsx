import type { FreeUserBankFirstSetting } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../api';
import type { AdminOutletContext } from '../layout/AdminLayout';
import { clearAdminSession } from '../session';

/** Bridge `28:2` 关态副文案。 */
const OFF_SUBTITLE = '仅免费；关=默认 AI 出题；会员不受影响';
/** Bridge `28:145` 开态副文案（帧 `28:15`）。 */
const ON_SUBTITLE = '仅免费；开=先库后 AI 补齐；会员不受影响';
const HELPER =
  '开=先从题库抽题凑满一场，不足再 AI；关=免费默认全程 AI。均不影响会员。';

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

  const enabled = setting?.enabled === true;

  return (
    <section className="page strategy-settings">
      <header className="strategy-head">
        <h1>免费用户题库优先</h1>
        <p className="strategy-scope">仅影响免费用户；默认关。</p>
      </header>
      {error ? (
        <p className="strategy-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !setting ? <p className="strategy-status">读取中</p> : null}
      {setting ? (
        <article
          className="strategy-card"
          data-layer-id={enabled ? '28:145' : '28:2'}
        >
          <h2>出题策略</h2>
          <div className="strategy-row">
            <div className="strategy-copy">
              <div className="strategy-title-row">
                <span className="strategy-name">免费用户题库优先</span>
                <span className="strategy-key">freeUserBankFirst</span>
              </div>
              <p className="strategy-sub" id="strategy-subtitle">
                {enabled ? ON_SUBTITLE : OFF_SUBTITLE}
              </p>
            </div>
            <button
              type="button"
              className={enabled ? 'strategy-switch is-on' : 'strategy-switch'}
              role="switch"
              aria-checked={enabled}
              aria-describedby="strategy-subtitle strategy-helper"
              disabled={saving}
              aria-busy={saving}
              onClick={() => void toggle()}
            >
              <span className="strategy-track" aria-hidden="true" />
              <span className="strategy-switch-label">{enabled ? '开' : '关'}</span>
            </button>
          </div>
          <p className="strategy-helper" id="strategy-helper">
            {HELPER}
          </p>
        </article>
      ) : null}
    </section>
  );
}
