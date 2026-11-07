import { useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../../api';
import { Drawer } from '../../content/Drawer';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';
import { CommerceAuditList } from './CommerceAuditList';
import {
  bucketLabel,
  entryStatusLabel,
  expiryLabel,
  shanghaiDay,
  shortUserId,
  type EntitlementLookupItem,
  type EntitlementOpsDetail,
  type EntitlementOpsEntry,
} from './entitlement-view';

const FOOTNOTE =
  '补发/作废弹窗需填写原因；写入 EntitlementLedger + AuditLog。会员态只读展示到期；续费/退款走订单流，不在此改 ends_at。';

interface GrantDraft {
  pendingId: string | null;
  qty: string;
  qtyLocked: boolean;
  reason: string;
  idempotencyKey: string;
}

interface RevokeDraft {
  targets: { kind: 'lot' | 'pending'; id: string; label: string }[];
  reason: string;
}

export function EntitlementsPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<EntitlementLookupItem[]>([]);
  const [detail, setDetail] = useState<EntitlementOpsDetail | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [grant, setGrant] = useState<GrantDraft | null>(null);
  const [revoke, setRevoke] = useState<RevokeDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);

  async function search(): Promise<void> {
    const q = query.trim();
    if (!q) {
      setError('请输入昵称、脱敏手机、openid 或 userId');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const body = await adminFetch<{ items: EntitlementLookupItem[] }>(
        `/admin/commerce/entitlements/lookup?q=${encodeURIComponent(q)}`,
        { token },
      );
      setHits(body.items);
      if (body.items.length === 1 && body.items[0]) {
        await loadDetail(body.items[0].userId);
      } else {
        setDetail(null);
        setSelected([]);
      }
      if (body.items.length === 0) {
        setError('没有匹配的用户');
      }
    } catch (caught: unknown) {
      report(caught, navigate, setError);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(userId: string): Promise<void> {
    const next = await adminFetch<EntitlementOpsDetail>(`/admin/commerce/entitlements/${userId}`, {
      token,
    });
    setDetail(next);
    setSelected([]);
    setError('');
  }

  function openGrant(entry?: EntitlementOpsEntry): void {
    if (!detail) return;
    const pending = entry?.kind === 'pending' ? entry : null;
    setGrant({
      pendingId: pending?.id ?? null,
      qty: String(pending?.qty ?? 3),
      qtyLocked: Boolean(pending),
      reason: '',
      idempotencyKey: crypto.randomUUID(),
    });
  }

  function openRevoke(targets: RevokeDraft['targets']): void {
    if (targets.length === 0) return;
    setRevoke({ targets, reason: '' });
  }

  function selectedTargets(): RevokeDraft['targets'] {
    if (!detail) return [];
    return detail.entries
      .filter((entry) => selected.includes(entryKey(entry)) && entry.actions.includes('void'))
      .filter((entry): entry is EntitlementOpsEntry & { kind: 'lot' | 'pending' } => entry.kind !== 'daily_task')
      .map((entry) => ({
        kind: entry.kind,
        id: entry.id,
        label: `${entry.sourceLabel} · ${entry.remain}`,
      }));
  }

  async function submitGrant(): Promise<void> {
    if (!detail || !grant || saving) return;
    const qty = Number(grant.qty);
    const reason = grant.reason.trim();
    if (!Number.isInteger(qty) || qty < 1 || qty > 999) {
      setError('补发数量必须是 1 到 999 的整数');
      return;
    }
    if (!reason) {
      setError('原因必填');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminFetch(`/admin/commerce/entitlements/${detail.user.userId}/grant`, {
        method: 'POST',
        token,
        body: {
          qty,
          bucket: 'inventory',
          reason,
          pendingId: grant.pendingId,
          expiresAt: null,
          idempotencyKey: grant.idempotencyKey,
        },
      });
      setGrant(null);
      await loadDetail(detail.user.userId);
    } catch (caught: unknown) {
      report(caught, navigate, setError);
    } finally {
      setSaving(false);
    }
  }

  async function submitRevoke(): Promise<void> {
    if (!detail || !revoke || saving) return;
    const reason = revoke.reason.trim();
    if (!reason) {
      setError('原因必填');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await adminFetch(`/admin/commerce/entitlements/${detail.user.userId}/revoke`, {
        method: 'POST',
        token,
        body: {
          targets: revoke.targets.map((target) => ({ kind: target.kind, id: target.id })),
          reason,
        },
      });
      setRevoke(null);
      await loadDetail(detail.user.userId);
    } catch (caught: unknown) {
      report(caught, navigate, setError);
      if (detail) {
        await loadDetail(detail.user.userId).catch(() => undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  const memberDay = detail ? shanghaiDay(detail.membership.endsAt) : null;

  return (
    <section className="page commerce-page entitlement-page" data-frame="13:252">
      <header className="commerce-head">
        <div>
          <p className="commerce-kicker">商业化 / 用户权益</p>
          <h1>用户权益 · 补发 / 作废</h1>
        </div>
        <div className="commerce-actions">
          <button type="button" className="secondary" onClick={() => setAuditOpen(true)}>
            审计
          </button>
        </div>
      </header>
      <p className="entitlement-notice">
        <strong>审计</strong>
        权益只读查询；补发 / 作废必须走 ledger 分录 + 操作审计，禁止直接改余额数字。
      </p>
      <form
        className="entitlement-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <input
          aria-label="昵称 / 脱敏手机 / openid / userId"
          placeholder="昵称 / 脱敏手机 / openid / userId"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          查询
        </button>
      </form>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {hits.length > 1 ? (
        <ul className="entitlement-hits">
          {hits.map((item) => (
            <li key={item.userId}>
              <button
                type="button"
                className="link"
                onClick={() => {
                  void loadDetail(item.userId).catch((caught: unknown) => report(caught, navigate, setError));
                }}
              >
                {(item.nick || '未命名') + ' · ' + shortUserId(item.userId)}
              </button>
              <span>
                {item.phoneMasked || '未绑定手机'} · {item.openIdMasked}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {detail ? (
        <article className="commerce-card entitlement-user" data-layer="13:702">
          <div className="entitlement-who">
            <div>
              <h2>
                {(detail.user.nick || '未命名') + ' · ' + shortUserId(detail.user.userId)}
              </h2>
              <p>
                {(detail.user.phoneMasked || '未绑定手机') + ' · ' + detail.user.openIdMasked}
              </p>
            </div>
            <div className="entitlement-tags">
              <span className={detail.membership.active ? 'pill' : 'pill off'}>
                {detail.membership.active ? '会员生效中' : '未开通'}
              </span>
              {detail.membership.active && memberDay ? (
                <span className="pill info">
                  {(detail.membership.skuName || '会员') + ' 至 ' + memberDay}
                </span>
              ) : null}
            </div>
          </div>
          <div className="entitlement-buckets">
            <div>
              <span>会员</span>
              <strong>{detail.membership.active ? '不限场' : '—'}</strong>
            </div>
            <div>
              <span>今日日免剩余</span>
              <strong>
                {detail.balances.dailyFreeRemain} / {detail.balances.dailyFreeQuota}
              </strong>
            </div>
            <div>
              <span>今日任务奖</span>
              <strong>{detail.balances.dailyTaskRemain}</strong>
            </div>
            <div>
              <span>跨日库存</span>
              <strong>{detail.balances.inventoryRemain}</strong>
            </div>
            <div>
              <span>待发放</span>
              <strong>{detail.balances.pendingQty}</strong>
            </div>
          </div>
          <div className="entitlement-table-head">
            <h3>待发放 / 库存批次</h3>
            <div className="commerce-actions">
              <button type="button" onClick={() => openGrant()}>
                补发场次
              </button>
              <button
                type="button"
                className="secondary"
                disabled={selectedTargets().length === 0}
                onClick={() => openRevoke(selectedTargets())}
              >
                作废选中
              </button>
            </div>
          </div>
          <div className="table-card">
            <table className="data">
              <thead>
                <tr>
                  <th />
                  <th>来源</th>
                  <th>桶</th>
                  <th>数量</th>
                  <th>状态</th>
                  <th>原因 / 风控</th>
                  <th>过期</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {detail.entries.map((entry) => {
                  const key = entryKey(entry);
                  const voidable = entry.actions.includes('void');
                  return (
                    <tr key={key}>
                      <td>
                        {voidable ? (
                          <input
                            type="checkbox"
                            aria-label={`选择 ${entry.sourceLabel}`}
                            checked={selected.includes(key)}
                            onChange={(event) => {
                              setSelected((current) =>
                                event.target.checked
                                  ? [...current, key]
                                  : current.filter((item) => item !== key),
                              );
                            }}
                          />
                        ) : null}
                      </td>
                      <td>{entry.sourceLabel}</td>
                      <td>{bucketLabel(entry)}</td>
                      <td>{entry.kind === 'lot' ? `${entry.remain}/${entry.qty}` : entry.qty}</td>
                      <td>{entryStatusLabel(entry.status)}</td>
                      <td>{entry.riskText || '—'}</td>
                      <td>{expiryLabel(entry)}</td>
                      <td className="commerce-row-actions">
                        {entry.actions.includes('grant') ? (
                          <button type="button" className="link" onClick={() => openGrant(entry)}>
                            补发
                          </button>
                        ) : null}
                        {voidable ? (
                          <button
                            type="button"
                            className="link danger-link"
                            onClick={() =>
                              openRevoke([
                                {
                                  kind: entry.kind === 'pending' ? 'pending' : 'lot',
                                  id: entry.id,
                                  label: `${entry.sourceLabel} · ${entry.remain}`,
                                },
                              ])
                            }
                          >
                            作废
                          </button>
                        ) : null}
                        {entry.actions.length === 0 ? '—' : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {detail.entries.length === 0 ? <p className="commerce-empty">暂无待发放或库存批次</p> : null}
          </div>
          <p className="commerce-foot">{FOOTNOTE}</p>
        </article>
      ) : null}
      {grant && detail ? (
        <div className="modal-scrim" onMouseDown={() => setGrant(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="补发场次 · 需审计"
            data-frame="13:816"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>补发场次 · 需审计</h2>
            <p className="modal-body">
              用户：{(detail.user.nick || '未命名') + ' · ' + shortUserId(detail.user.userId)}
              <br />
              将写入 ledger（grant）并记 AuditLog，不可直接改余额。
            </p>
            <label>
              补发数量（场）
              <input
                type="number"
                min={1}
                max={999}
                step={1}
                value={grant.qty}
                readOnly={grant.qtyLocked}
                disabled={grant.qtyLocked || saving}
                onChange={(event) => setGrant({ ...grant, qty: event.target.value })}
              />
            </label>
            <label>
              入桶
              <input value="inventory（跨日库存）" readOnly disabled />
            </label>
            <label>
              原因（必填）
              <textarea
                value={grant.reason}
                maxLength={500}
                onChange={(event) => setGrant({ ...grant, reason: event.target.value })}
              />
            </label>
            <p className="entitlement-warn">确认后不可撤销数字回滚，仅可再作废对应批次。</p>
            <div className="modal-actions">
              <button type="button" className="secondary" disabled={saving} onClick={() => setGrant(null)}>
                取消
              </button>
              <button type="button" disabled={saving || !grant.reason.trim()} onClick={() => void submitGrant()}>
                {saving ? '提交中' : '确认补发并记审计'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {revoke && detail ? (
        <div className="modal-scrim" onMouseDown={() => setRevoke(null)}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="作废 · 需审计"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <h2>作废 · 需审计</h2>
            <p className="modal-body">
              用户：{(detail.user.nick || '未命名') + ' · ' + shortUserId(detail.user.userId)}
              <br />
              {revoke.targets.map((target) => target.label).join('、')}
            </p>
            <label>
              原因（必填）
              <textarea
                value={revoke.reason}
                maxLength={500}
                onChange={(event) => setRevoke({ ...revoke, reason: event.target.value })}
              />
            </label>
            <p className="entitlement-warn">作废后剩余清零，不可数字回滚。日免和当日任务奖不能作废。</p>
            <div className="modal-actions">
              <button type="button" className="secondary" disabled={saving} onClick={() => setRevoke(null)}>
                取消
              </button>
              <button
                type="button"
                className="danger"
                disabled={saving || !revoke.reason.trim()}
                onClick={() => void submitRevoke()}
              >
                {saving ? '提交中' : '确认作废并记审计'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <Drawer open={auditOpen} title="商业化审计" wide onClose={() => setAuditOpen(false)}>
        <CommerceAuditList token={token} userId={detail?.user.userId} />
        <p className="commerce-foot">
          <Link to={detail ? `/commerce/audit?userId=${detail.user.userId}` : '/commerce/audit'}>
            打开审计页
          </Link>
        </p>
      </Drawer>
    </section>
  );
}

function entryKey(entry: EntitlementOpsEntry): string {
  return `${entry.kind}:${entry.id}`;
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
