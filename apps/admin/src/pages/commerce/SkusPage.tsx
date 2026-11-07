import {
  SKU_TYPE_LABELS,
  formatPriceYuan,
  parseSkuCreate,
  parseSkuUpdate,
  priceFenFromYuanInput,
  type CommerceSku,
  type SkuType,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { AdminApiError, adminFetch } from '../../api';
import { ConfirmDialog, Drawer } from '../../content/Drawer';
import type { AdminOutletContext } from '../../layout/AdminLayout';
import { clearAdminSession } from '../../session';

type Tab = 'all' | 'member' | 'session_pack' | 'disabled';

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'member', label: '会员' },
  { id: 'session_pack', label: '加油包' },
  { id: 'disabled', label: '已停用' },
];

interface EditorState {
  mode: 'create' | 'edit';
  code: string;
  type: SkuType;
  name: string;
  priceYuan: string;
  durationDays: string;
  sessions: string;
  summary: string;
  enabled: boolean;
  recommended: boolean;
}

export function SkusPage() {
  const navigate = useNavigate();
  const { session } = useOutletContext<AdminOutletContext>();
  const token = session.token;
  const [tab, setTab] = useState<Tab>('all');
  const [items, setItems] = useState<CommerceSku[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState('');
  const [saving, setSaving] = useState(false);
  const [pendingCode, setPendingCode] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    adminFetch<{ items: CommerceSku[] }>(`/admin/commerce/skus${queryFor(tab)}`, { token })
      .then((body) => {
        if (!cancelled) {
          setItems(body.items);
          setError('');
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          if (leave(caught, navigate)) {
            return;
          }
          setError(caught instanceof Error ? caught.message : '列表加载失败');
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
  }, [navigate, reloadToken, tab, token]);

  function openCreate(): void {
    setEditorError('');
    setEditor({
      mode: 'create',
      code: '',
      type: 'member',
      name: '',
      priceYuan: '',
      durationDays: '30',
      sessions: '5',
      summary: '',
      enabled: true,
      recommended: false,
    });
  }

  function openEdit(sku: CommerceSku): void {
    setEditorError('');
    setEditor({
      mode: 'edit',
      code: sku.code,
      type: sku.type,
      name: sku.name,
      priceYuan: formatPriceYuan(sku.priceFen),
      durationDays: sku.durationDays === null ? '' : String(sku.durationDays),
      sessions: sku.sessions === null ? '' : String(sku.sessions),
      summary: sku.summary,
      enabled: sku.enabled,
      recommended: sku.recommended,
    });
  }

  async function saveEditor(): Promise<void> {
    if (!editor) {
      return;
    }
    const priceFen = priceFenFromYuanInput(editor.priceYuan);
    if (priceFen === null) {
      setEditorError('试用价只接受到分，例如 28 或 28.50');
      return;
    }
    setSaving(true);
    setEditorError('');
    try {
      if (editor.mode === 'create') {
        const parsed = parseSkuCreate({
          code: editor.code.trim(),
          type: editor.type,
          name: editor.name,
          priceFen,
          summary: editor.summary,
          enabled: editor.enabled,
          recommended: editor.recommended,
          sortOrder: 100,
          ...(editor.type === 'member'
            ? { durationDays: Number(editor.durationDays) }
            : { sessions: Number(editor.sessions) }),
        });
        if (!parsed.ok) {
          setEditorError(parsed.message);
          return;
        }
        await adminFetch('/admin/commerce/skus', { method: 'POST', token, body: parsed.value });
      } else {
        const parsed = parseSkuUpdate(
          {
            name: editor.name,
            priceFen,
            summary: editor.summary,
            enabled: editor.enabled,
            recommended: editor.recommended,
            ...(editor.type === 'member'
              ? { durationDays: Number(editor.durationDays) }
              : { sessions: Number(editor.sessions) }),
          },
          editor.type,
        );
        if (!parsed.ok) {
          setEditorError(parsed.message);
          return;
        }
        await adminFetch(`/admin/commerce/skus/${encodeURIComponent(editor.code)}`, {
          method: 'PUT',
          token,
          body: parsed.value,
        });
      }
      setEditor(null);
      setReloadToken((value) => value + 1);
    } catch (caught: unknown) {
      if (!leave(caught, navigate)) {
        setEditorError(caught instanceof Error ? caught.message : '保存失败');
      }
    } finally {
      setSaving(false);
    }
  }

  async function setEnabled(code: string, enabled: boolean): Promise<void> {
    setSaving(true);
    setError('');
    try {
      await adminFetch(`/admin/commerce/skus/${encodeURIComponent(code)}/${enabled ? 'enable' : 'disable'}`, {
        method: 'POST',
        token,
      });
      setPendingCode(null);
      setReloadToken((value) => value + 1);
    } catch (caught: unknown) {
      if (!leave(caught, navigate)) {
        setError(caught instanceof Error ? caught.message : '状态更新失败');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page commerce-page" data-frame="13:3">
      <header className="commerce-head">
        <div>
          <h1>权益 SKU</h1>
          <p className="commerce-kicker">
            v2.0.0 · 试用价可改；下单写入价格快照。不做证书通关包。加油包是场次库存。
          </p>
        </div>
        <button type="button" onClick={openCreate}>
          新建 SKU
        </button>
      </header>
      <div className="commerce-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            className={tab === item.id ? 'commerce-tab is-on' : 'commerce-tab'}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-card">
        <table className="data">
          <thead>
            <tr>
              <th>code</th>
              <th>名称</th>
              <th>类型</th>
              <th>试用价</th>
              <th>有效期</th>
              <th>权益摘要</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {items.map((sku) => (
              <tr key={sku.code}>
                <td>{sku.code}</td>
                <td>{sku.name}</td>
                <td>{SKU_TYPE_LABELS[sku.type]}</td>
                <td>¥{formatPriceYuan(sku.priceFen)}</td>
                <td>{validity(sku)}</td>
                <td>{sku.summary}</td>
                <td>
                  <span className={sku.enabled ? 'pill' : 'pill off'}>{sku.enabled ? '启用' : '停用'}</span>
                </td>
                <td className="commerce-row-actions">
                  <button type="button" className="link" onClick={() => openEdit(sku)}>
                    编辑
                  </button>
                  <button
                    type="button"
                    className="link"
                    onClick={() => (sku.enabled ? setPendingCode(sku.code) : void setEnabled(sku.code, true))}
                  >
                    {sku.enabled ? '停用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 ? <p className="commerce-empty">没有符合筛选的 SKU</p> : null}
        {loading ? <p className="muted">读取中</p> : null}
      </div>
      <p className="commerce-foot">
        权益摘要文案同步小程序会员定价页；改价不影响已支付订单快照。场次加油包默认 +5 / ¥6 / 购后 365 天。停用后不可新购，已购权益仍有效。
      </p>
      <Drawer
        open={editor !== null}
        title={editor?.mode === 'create' ? '新建 SKU · v2.0.0' : '编辑 SKU · v2.0.0'}
        onClose={() => setEditor(null)}
      >
        {editor ? (
          <div data-frame="13:476">
            {editorError ? (
              <p className="form-error" role="alert">
                {editorError}
              </p>
            ) : null}
            <label>
              code{editor.mode === 'edit' ? '（只读）' : ''}
              <input
                value={editor.code}
                readOnly={editor.mode === 'edit'}
                onChange={(event) => setEditor({ ...editor, code: event.target.value })}
              />
              <span className="commerce-hint">下单快照用；创建后不可改 code</span>
            </label>
            <label>
              类型
              <select
                value={editor.type}
                disabled={editor.mode === 'edit'}
                onChange={(event) => setEditor({ ...editor, type: event.target.value as SkuType })}
              >
                <option value="member">会员</option>
                <option value="session_pack">加油包</option>
              </select>
            </label>
            <label>
              显示名称
              <input value={editor.name} onChange={(event) => setEditor({ ...editor, name: event.target.value })} />
            </label>
            <label>
              试用价（元）
              <input
                inputMode="decimal"
                value={editor.priceYuan}
                onChange={(event) => setEditor({ ...editor, priceYuan: event.target.value })}
              />
              <span className="commerce-hint">可改；已支付订单不受影响。写入按分保存。</span>
            </label>
            {editor.type === 'member' ? (
              <label>
                有效天数
                <input
                  inputMode="numeric"
                  value={editor.durationDays}
                  onChange={(event) => setEditor({ ...editor, durationDays: event.target.value })}
                />
              </label>
            ) : (
              <label>
                有效天数
                <input value="—" readOnly disabled />
              </label>
            )}
            <label>
              权益摘要（C 端展示）
              <textarea
                value={editor.summary}
                onChange={(event) => setEditor({ ...editor, summary: event.target.value })}
              />
            </label>
            <label>
              加油包场次数（仅 pack）
              {editor.type === 'session_pack' ? (
                <input
                  inputMode="numeric"
                  value={editor.sessions}
                  onChange={(event) => setEditor({ ...editor, sessions: event.target.value })}
                />
              ) : (
                <input value="—" readOnly disabled />
              )}
              <span className="commerce-hint">会员 SKU 留空。库存有效天数默认 365，不在这里改。</span>
            </label>
            <label className="commerce-check">
              <input
                type="checkbox"
                checked={editor.enabled}
                onChange={(event) => setEditor({ ...editor, enabled: event.target.checked })}
              />
              启用
            </label>
            <label className="commerce-check">
              <input
                type="checkbox"
                checked={editor.recommended}
                onChange={(event) => setEditor({ ...editor, recommended: event.target.checked })}
              />
              推荐角标
            </label>
            <p className="commerce-hint">
              不做证书通关包 / 按证售卖。停用后不可新购，已购权益仍有效。
            </p>
            <div className="drawer-actions">
              <button type="button" className="secondary" onClick={() => setEditor(null)} disabled={saving}>
                取消
              </button>
              <button type="button" onClick={() => void saveEditor()} disabled={saving}>
                {saving ? '保存中' : '保存并记审计'}
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={pendingCode !== null}
        title="停用 SKU"
        body={pendingCode ? `停用 ${pendingCode} 后，新购入口不再使用它。` : ''}
        note="已购权益不受影响。本页不处理订单。"
        confirmLabel={saving ? '停用中' : '确认停用'}
        pending={saving}
        onCancel={() => setPendingCode(null)}
        onConfirm={() => {
          if (pendingCode) {
            void setEnabled(pendingCode, false);
          }
        }}
      />
    </section>
  );
}

function queryFor(tab: Tab): string {
  if (tab === 'member') {
    return '?type=member';
  }
  if (tab === 'session_pack') {
    return '?type=session_pack';
  }
  if (tab === 'disabled') {
    return '?status=disabled';
  }
  return '';
}

function validity(sku: CommerceSku): string {
  if (sku.type === 'member') {
    return sku.durationDays === null ? '—' : `${sku.durationDays} 天`;
  }
  return `购后 ${sku.inventoryExpireDays ?? 365} 天`;
}

function leave(caught: unknown, navigate: ReturnType<typeof useNavigate>): boolean {
  if (caught instanceof AdminApiError && caught.status === 401) {
    clearAdminSession();
    navigate('/login', { replace: true });
    return true;
  }
  return false;
}
