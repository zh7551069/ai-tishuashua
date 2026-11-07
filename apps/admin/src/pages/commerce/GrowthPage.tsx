import {
  defaultGrowthConfig,
  parseGrowthConfig,
  type GrowthConfig,
  type GrowthConfigView,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../../api';
import { ConfirmDialog } from '../../content/Drawer';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';

export function GrowthPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [form, setForm] = useState<GrowthConfig>(defaultGrowthConfig);
  const [meta, setMeta] = useState<{ updatedAt: string | null; updatedBy: string | null }>({
    updatedAt: null,
    updatedBy: null,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch<GrowthConfigView>('/admin/commerce/growth', { token })
      .then((body) => {
        if (cancelled) {
          return;
        }
        setForm({ checkin: body.checkin, share: body.share, invite: body.invite });
        setMeta({ updatedAt: body.updatedAt, updatedBy: body.updatedBy });
        setError('');
      })
      .catch((caught: unknown) => {
        if (!cancelled && !leave(caught, navigate)) {
          setError(caught instanceof Error ? caught.message : '读取失败');
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

  async function save(next: GrowthConfig): Promise<void> {
    const parsed = parseGrowthConfig(next);
    if (!parsed.ok) {
      setError(parsed.message);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await adminFetch<GrowthConfigView>('/admin/commerce/growth', {
        method: 'PUT',
        token,
        body: parsed.value,
      });
      setForm({ checkin: saved.checkin, share: saved.share, invite: saved.invite });
      setMeta({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
      setConfirmReset(false);
    } catch (caught: unknown) {
      if (!leave(caught, navigate)) {
        setError(caught instanceof Error ? caught.message : '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  async function reset(): Promise<void> {
    setSaving(true);
    setError('');
    try {
      const saved = await adminFetch<GrowthConfigView>('/admin/commerce/growth/reset', {
        method: 'POST',
        token,
      });
      setForm({ checkin: saved.checkin, share: saved.share, invite: saved.invite });
      setMeta({ updatedAt: saved.updatedAt, updatedBy: saved.updatedBy });
      setConfirmReset(false);
    } catch (caught: unknown) {
      if (!leave(caught, navigate)) {
        setError(caught instanceof Error ? caught.message : '重置失败');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page commerce-page" data-frame="13:169">
      <header className="commerce-head">
        <div>
          <h1>增长任务配置</h1>
          <p className="commerce-kicker">
            v2.0.0 · 签到改为送场次。这里只保存参数，不发放、不绑定邀请。
          </p>
        </div>
        <div className="commerce-actions">
          <button type="button" className="secondary" disabled={saving || loading} onClick={() => setConfirmReset(true)}>
            重置为默认
          </button>
          <button type="button" disabled={saving || loading} onClick={() => void save(normalize(form))}>
            {saving ? '保存中' : '保存并记审计'}
          </button>
        </div>
      </header>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? <p className="muted">读取中</p> : null}
      <article className="commerce-card">
        <h2>签到</h2>
        <Toggle
          label="启用签到"
          on={form.checkin.enabled}
          onToggle={() => setForm({ ...form, checkin: { ...form.checkin, enabled: !form.checkin.enabled } })}
        />
        <CountField
          label="奖励场次"
          hint="入桶 daily_task；未用随 00:00 清零。同日幂等。"
          value={form.checkin.rewardSessions}
          onChange={(rewardSessions) => setForm({ ...form, checkin: { ...form.checkin, rewardSessions } })}
        />
      </article>
      <article className="commerce-card">
        <h2>每日分享</h2>
        <Toggle
          label="启用分享领场"
          on={form.share.enabled}
          onToggle={() => setForm({ ...form, share: { ...form.share, enabled: !form.share.enabled } })}
        />
        <CountField
          label="奖励场次"
          hint="好友打开后发放。空点不发；每天最多领 1 次。"
          value={form.share.rewardSessions}
          onChange={(rewardSessions) => setForm({ ...form, share: { ...form.share, rewardSessions } })}
        />
        <CountField
          label="会员改发提炼次"
          hint="会员不限场时默认改发提炼。配置先存着，发奖不在这一页。"
          value={form.share.memberRefineBonus}
          onChange={(memberRefineBonus) => setForm({ ...form, share: { ...form.share, memberRefineBonus } })}
        />
      </article>
      <article className="commerce-card">
        <h2>邀请有礼（拉新）</h2>
        <Toggle
          label="注册奖励"
          hint="邀请人与新用户各一份，入 inventory"
          on={form.invite.registerEnabled}
          onToggle={() =>
            setForm({ ...form, invite: { ...form.invite, registerEnabled: !form.invite.registerEnabled } })
          }
        />
        <div className="commerce-split">
          <CountField
            label="邀请人·注册"
            value={form.invite.inviterRegisterSessions}
            onChange={(inviterRegisterSessions) =>
              setForm({ ...form, invite: { ...form.invite, inviterRegisterSessions } })
            }
          />
          <CountField
            label="新用户·欢迎"
            value={form.invite.inviteeWelcomeSessions}
            onChange={(inviteeWelcomeSessions) =>
              setForm({ ...form, invite: { ...form.invite, inviteeWelcomeSessions } })
            }
          />
        </div>
        <Toggle
          label="首刷交卷奖励"
          on={form.invite.firstSubmitEnabled}
          onToggle={() =>
            setForm({
              ...form,
              invite: { ...form.invite, firstSubmitEnabled: !form.invite.firstSubmitEnabled },
            })
          }
        />
        <div className="commerce-split">
          <CountField
            label="邀请人·首刷"
            value={form.invite.inviterFirstSubmitSessions}
            onChange={(inviterFirstSubmitSessions) =>
              setForm({ ...form, invite: { ...form.invite, inviterFirstSubmitSessions } })
            }
          />
          <CountField
            label="新用户·首刷"
            value={form.invite.inviteeFirstSubmitSessions}
            onChange={(inviteeFirstSubmitSessions) =>
              setForm({ ...form, invite: { ...form.invite, inviteeFirstSubmitSessions } })
            }
          />
        </div>
        <h3>封顶与风控</h3>
        <Toggle
          label="邀请人日封顶"
          hint="默认 6 场/日"
          on={form.invite.dailyCapEnabled}
          onToggle={() =>
            setForm({ ...form, invite: { ...form.invite, dailyCapEnabled: !form.invite.dailyCapEnabled } })
          }
        />
        <CountField
          label="日封顶场次"
          value={form.invite.dailyCapSessions}
          onChange={(dailyCapSessions) => setForm({ ...form, invite: { ...form.invite, dailyCapSessions } })}
        />
        <Toggle
          label="邀请人周封顶"
          hint="默认 15 场/周"
          on={form.invite.weeklyCapEnabled}
          onToggle={() =>
            setForm({ ...form, invite: { ...form.invite, weeklyCapEnabled: !form.invite.weeklyCapEnabled } })
          }
        />
        <CountField
          label="周封顶场次"
          value={form.invite.weeklyCapSessions}
          onChange={(weeklyCapSessions) =>
            setForm({ ...form, invite: { ...form.invite, weeklyCapSessions } })
          }
        />
        <p className="commerce-hint">
          一人一邀请人；禁自邀。超限或命中风控后的待发放，要等用户权益页再处理。这一页不补发、不作废。
        </p>
      </article>
      <p className="commerce-meta">
        {meta.updatedAt ? `最近保存 ${meta.updatedAt}` : '使用默认配置'}
        {meta.updatedBy ? ` · ${meta.updatedBy}` : ''}
      </p>
      <ConfirmDialog
        open={confirmReset}
        title="重置为默认"
        body="签到、分享和拉新参数恢复成默认包。"
        note="只改配置，不发放场次。"
        confirmLabel={saving ? '重置中' : '确认重置'}
        pending={saving}
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => void reset()}
      />
    </section>
  );
}

function Toggle(props: { label: string; hint?: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="commerce-lock">
      <div>
        <strong>{props.label}</strong>
        {props.hint ? <p>{props.hint}</p> : null}
      </div>
      <button
        type="button"
        className={props.on ? 'strategy-switch is-on' : 'strategy-switch'}
        role="switch"
        aria-checked={props.on}
        onClick={props.onToggle}
      >
        <span className="strategy-track" aria-hidden="true" />
        <span className="strategy-switch-label">{props.on ? '开' : '关'}</span>
      </button>
    </div>
  );
}

function CountField(props: { label: string; hint?: string; value: number; onChange: (value: number) => void }) {
  return (
    <label>
      {props.label}
      {props.hint ? <span className="commerce-hint">{props.hint}</span> : null}
      <input
        inputMode="numeric"
        value={String(props.value)}
        onChange={(event) => {
          const next = Number(event.target.value.trim());
          props.onChange(Number.isInteger(next) ? next : props.value);
        }}
      />
    </label>
  );
}

function normalize(form: GrowthConfig): GrowthConfig {
  return parseGrowthConfig(form).ok ? form : form;
}

function leave(caught: unknown, navigate: ReturnType<typeof useNavigate>): boolean {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return true;
  }
  return false;
}
