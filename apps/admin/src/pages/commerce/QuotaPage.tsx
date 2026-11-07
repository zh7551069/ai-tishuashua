import {
  DEFAULT_DAILY_FREE_SESSIONS,
  DEFAULT_REFINE_LIFETIME_LIMIT_FREE,
  parseQuotaWrite,
  type CommerceQuotaView,
  type FreeUserBankFirstSetting,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../../api';
import { ConfirmDialog } from '../../content/Drawer';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';

const OFF_SUBTITLE = '仅免费；关=默认 AI 出题；会员不受影响';
const ON_SUBTITLE = '仅免费；开=先库后 AI 补齐；会员不受影响';
const HELPER = '开=先从题库抽题凑满一场，不足再 AI；关=免费默认全程 AI。均不影响会员。';

export function QuotaPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [quota, setQuota] = useState<CommerceQuotaView | null>(null);
  const [daily, setDaily] = useState(String(DEFAULT_DAILY_FREE_SESSIONS));
  const [refine, setRefine] = useState(String(DEFAULT_REFINE_LIFETIME_LIMIT_FREE));
  const [bank, setBank] = useState<FreeUserBankFirstSetting | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bankSaving, setBankSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      adminFetch<CommerceQuotaView>('/admin/commerce/quota', { token }),
      adminFetch<FreeUserBankFirstSetting>('/admin/system-settings/freeUserBankFirst', { token }),
    ])
      .then(([nextQuota, nextBank]) => {
        if (cancelled) {
          return;
        }
        setQuota(nextQuota);
        setDaily(String(nextQuota.dailyFreeSessions));
        setRefine(String(nextQuota.refineLifetimeLimitFree));
        setBank(nextBank);
        setError('');
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught, navigate, setError);
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
  }, [navigate, token]);

  async function save(): Promise<void> {
    const parsed = parseQuotaWrite({
      dailyFreeSessions: Number(daily.trim()),
      refineLifetimeLimitFree: Number(refine.trim()),
    });
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const next = await adminFetch<CommerceQuotaView>('/admin/commerce/quota', {
        method: 'PUT',
        token,
        body: parsed.value,
      });
      setQuota(next);
      setDaily(String(next.dailyFreeSessions));
      setRefine(String(next.refineLifetimeLimitFree));
    } catch (caught: unknown) {
      report(caught, navigate, setError);
    } finally {
      setSaving(false);
    }
  }

  async function reset(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      const next = await adminFetch<CommerceQuotaView>('/admin/commerce/quota/reset', {
        method: 'POST',
        token,
      });
      setQuota(next);
      setDaily(String(next.dailyFreeSessions));
      setRefine(String(next.refineLifetimeLimitFree));
      setConfirmReset(false);
    } catch (caught: unknown) {
      report(caught, navigate, setError);
    } finally {
      setSaving(false);
    }
  }

  async function toggleBank(): Promise<void> {
    if (!bank || bankSaving) {
      return;
    }
    setBankSaving(true);
    setError('');
    try {
      const next = await adminFetch<FreeUserBankFirstSetting>(
        '/admin/system-settings/freeUserBankFirst',
        { method: 'PUT', token, body: { enabled: !bank.enabled } },
      );
      setBank(next);
    } catch (caught: unknown) {
      report(caught, navigate, setError);
    } finally {
      setBankSaving(false);
    }
  }

  const bankOn = bank?.enabled === true;

  return (
    <section className="page commerce-page" data-frame="13:86">
      <header className="commerce-head">
        <div>
          <h1>全局配额</h1>
          <p className="commerce-kicker">v2.0.0 · 保存后记审计。改日免不改当天已经发出的余额。</p>
        </div>
        <div className="commerce-actions">
          <button type="button" className="secondary" disabled={saving || loading} onClick={() => setConfirmReset(true)}>
            重置为默认
          </button>
          <button type="button" disabled={saving || loading} onClick={() => void save()}>
            {saving ? '保存中' : '保存并记审计'}
          </button>
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading && !quota ? <p className="muted">读取中</p> : null}
      {quota ? (
        <>
          <p className="commerce-important">
            此处日免 / 日上限只影响免费用户日免桶；会员不限场不受影响。时区固定 Asia/Shanghai。改日免不回溯当日
            remain，下次跨日发放才用新值。
          </p>
          <article className="commerce-card">
            <h2>日免场次</h2>
            <label>
              每日免费场次
              <span className="commerce-hint">默认 2；后管可改</span>
              <input inputMode="numeric" value={daily} onChange={(event) => setDaily(event.target.value)} />
            </label>
            <label>
              业务日时区
              <span className="commerce-hint">只读</span>
              <input value={quota.timezone} readOnly />
            </label>
            <label>
              清零规则
              <textarea value={quota.clearingRuleText} readOnly />
            </label>
          </article>
          <article className="commerce-card">
            <h2>其它可配额度</h2>
            <label>
              免费提炼终身次数
              <span className="commerce-hint">非会员终身次数；会员不限</span>
              <input inputMode="numeric" value={refine} onChange={(event) => setRefine(event.target.value)} />
            </label>
            <label>
              AI 点评摘要
              <span className="commerce-hint">拍板：摘要不限（示意只读）</span>
              <input value="不限" readOnly />
            </label>
            <div className="commerce-lock">
              <div>
                <strong>会员日上限开关</strong>
                <p>架构禁·永久关闭。会员不限场，本开关不可打开。</p>
              </div>
              <button type="button" className="strategy-switch" role="switch" aria-checked={false} disabled>
                <span className="strategy-track" aria-hidden="true" />
                <span className="strategy-switch-label">关</span>
              </button>
            </div>
            <label>
              会员日上限（场）
              <span className="commerce-hint">架构禁·永久关闭</span>
              <input value="—" readOnly disabled />
            </label>
          </article>
          {bank ? (
            <article className="strategy-card">
              <h2>出题策略</h2>
              <div className="strategy-row">
                <div className="strategy-copy">
                  <div className="strategy-title-row">
                    <span className="strategy-name">免费用户题库优先</span>
                    <span className="strategy-key">freeUserBankFirst</span>
                  </div>
                  <p className="strategy-sub">{bankOn ? ON_SUBTITLE : OFF_SUBTITLE}</p>
                </div>
                <button
                  type="button"
                  className={bankOn ? 'strategy-switch is-on' : 'strategy-switch'}
                  role="switch"
                  aria-checked={bankOn}
                  disabled={bankSaving}
                  onClick={() => void toggleBank()}
                >
                  <span className="strategy-track" aria-hidden="true" />
                  <span className="strategy-switch-label">{bankOn ? '开' : '关'}</span>
                </button>
              </div>
              <p className="strategy-helper">{HELPER}</p>
            </article>
          ) : null}
          <article className="commerce-card">
            <h2>扣场顺序（只读说明）</h2>
            <pre className="commerce-pre">{quota.deductOrderText}</pre>
          </article>
          <p className="commerce-meta">
            {quota.updatedAt ? `最近保存 ${quota.updatedAt}` : '尚未单独保存'}
            {quota.updatedBy ? ` · ${quota.updatedBy}` : ''}
          </p>
        </>
      ) : null}
      <ConfirmDialog
        open={confirmReset}
        title="重置为默认"
        body="每日免费场次恢复为 2，免费提炼终身次数恢复为 1。"
        note="已经发出的当日日免不会被改写。"
        confirmLabel={saving ? '重置中' : '确认重置'}
        pending={saving}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
      />
    </section>
  );
}

function report(
  caught: unknown,
  navigate: ReturnType<typeof useNavigate>,
  setError: (message: string) => void,
): void {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return;
  }
  setError(caught instanceof Error ? caught.message : '操作失败');
}
