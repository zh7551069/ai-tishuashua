import type { AdminDomain, PublishStatus } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import {
  createDomain,
  deleteDomain,
  listDomains,
  updateDomain,
} from '../../catalog-api';
import { ConfirmDialog, Drawer } from '../../content/Drawer';
import { CLOSED_EDITOR, createEditor, editEditor, matchesQuery, matchesStatus } from '../../content/drawer-state';
import { normalizeCode, normalizeName, parseSortOrder } from '../../content/form';
import { useAdminAction } from '../../content/use-admin-action';
import { useEditorParams } from '../../content/use-editor-params';

interface Draft {
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: string;
}

const EMPTY: Draft = { code: '', name: '', status: 'online', sortOrder: '0' };

export function DomainsPage() {
  const { token, pending, error, report, run } = useAdminAction();
  const { editor, list, setEditor, setList } = useEditorParams();
  const [items, setItems] = useState<AdminDomain[]>([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeded, setSeeded] = useState('');
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
          setReady(true);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setReady(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reload, report, token]);

  const editorKey = `${editor.mode}:${editor.id ?? ''}`;
  useEffect(() => {
    if (editor.mode === 'closed') {
      setDraft(null);
      setSeeded('');
      setFormError('');
      return;
    }
    if (seeded === editorKey && draft) {
      return;
    }
    if (editor.mode === 'create') {
      setDraft(EMPTY);
      setSeeded(editorKey);
      setFormError('');
      return;
    }
    const item = items.find((row) => row.id === editor.id);
    if (!item) {
      return;
    }
    setDraft({
      code: item.code,
      name: item.name,
      status: item.status,
      sortOrder: String(item.sortOrder),
    });
    setSeeded(editorKey);
    setFormError('');
  }, [draft, editor.id, editor.mode, editorKey, items, seeded]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }
      if (deleteId) {
        setDeleteId(null);
        return;
      }
      if (editor.mode !== 'closed') {
        setEditor(CLOSED_EDITOR);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [deleteId, editor.mode, setEditor]);

  const visible = items.filter(
    (item) =>
      matchesStatus(item.status, list.status) &&
      matchesQuery(`${item.name} ${item.code}`, list.q),
  );
  const deleting = items.find((item) => item.id === deleteId) ?? null;

  async function save(): Promise<void> {
    if (!draft) {
      return;
    }
    const code = normalizeCode(draft.code);
    const name = normalizeName(draft.name);
    const sortOrder = parseSortOrder(draft.sortOrder);
    if (!code) {
      setFormError('编码只能用小写字母、数字和连字符');
      return;
    }
    if (!name) {
      setFormError('名称不能为空');
      return;
    }
    if (sortOrder === null) {
      setFormError('排序需要是 0 到 10000 的整数');
      return;
    }
    setFormError('');
    const body = { code, name, status: draft.status, sortOrder };
    const ok = await run(async () => {
      if (editor.mode === 'edit' && editor.id) {
        await updateDomain(token, editor.id, body);
      } else {
        await createDomain(token, body);
      }
    });
    if (ok) {
      setReload((value) => value + 1);
      setEditor(CLOSED_EDITOR);
    }
  }

  async function toggle(item: AdminDomain): Promise<void> {
    const status: PublishStatus = item.status === 'online' ? 'offline' : 'online';
    const ok = await run(async () => {
      await updateDomain(token, item.id, { status });
    });
    if (ok) {
      setReload((value) => value + 1);
    }
  }

  return (
    <section className="page">
      <h1>领域</h1>
      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索领域名称 / code"
          value={list.q}
          onChange={(event) => setList(event.target.value, list.status)}
        />
        <div className="seg" role="group" aria-label="上下架筛选">
          <FilterButton current={list.status} value="all" label="全部" onPick={(status) => setList(list.q, status)} />
          <FilterButton current={list.status} value="online" label="上架" onPick={(status) => setList(list.q, status)} />
          <FilterButton current={list.status} value="offline" label="下架" onPick={(status) => setList(list.q, status)} />
        </div>
        <div className="toolbar-end">
          <button type="button" onClick={() => setEditor(createEditor())} disabled={pending}>
            新建领域
          </button>
        </div>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="table-card">
        <table className="grid">
          <thead>
            <tr>
              <th>名称</th>
              <th>Code</th>
              <th>状态</th>
              <th>排序</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={5}>正在读取领域…</td>
              </tr>
            ) : null}
            {ready && visible.length === 0 ? (
              <tr>
                <td colSpan={5}>没有符合条件的领域。</td>
              </tr>
            ) : null}
            {visible.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td className="mono">{item.code}</td>
                <td>
                  <span className={item.status === 'online' ? 'pill' : 'pill off'}>
                    {item.status === 'online' ? '上架' : '下架'}
                  </span>
                </td>
                <td>{item.sortOrder}</td>
                <td className="ops">
                  <button type="button" className="link" onClick={() => setEditor(editEditor(item.id))}>
                    编辑
                  </button>
                  <span className="op-sep">·</span>
                  <button type="button" className="link" disabled={pending} onClick={() => void toggle(item)}>
                    {item.status === 'online' ? '下架' : '上架'}
                  </button>
                  <span className="op-sep">·</span>
                  <button type="button" className="link danger-link" onClick={() => setDeleteId(item.id)}>
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">图标和说明不在当前目录接口里，抽屉只保存编码、名称、状态和排序。</p>
      <Drawer
        open={editor.mode !== 'closed'}
        title="新建 / 编辑领域"
        onClose={() => setEditor(CLOSED_EDITOR)}
      >
        {editor.mode === 'edit' && !draft ? <p className="muted">找不到这个领域。</p> : null}
        {draft ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              code
              <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} required />
            </label>
            <label>
              name
              <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
            </label>
            <label>
              status
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({ ...draft, status: event.target.value === 'offline' ? 'offline' : 'online' })
                }
              >
                <option value="online">上架</option>
                <option value="offline">下架</option>
              </select>
            </label>
            <label>
              sortOrder
              <input
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
            </label>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="drawer-actions">
              <button type="submit" disabled={pending}>
                保存
              </button>
              <button type="button" className="secondary" onClick={() => setEditor(CLOSED_EDITOR)}>
                取消
              </button>
            </div>
          </form>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="确认删除该领域？"
        body={deleting ? `删除「${deleting.name}」。下面还有证书时会失败，可以改为下架。` : ''}
        confirmLabel="确认删除"
        pending={pending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void run(async () => {
            await deleteDomain(token, deleting.id);
          }).then((ok) => {
            if (ok) {
              setDeleteId(null);
              if (editor.id === deleting.id) {
                setEditor(CLOSED_EDITOR);
              }
              setReload((value) => value + 1);
            }
          });
        }}
      />
    </section>
  );
}

function FilterButton(props: {
  current: string;
  value: 'all' | 'online' | 'offline';
  label: string;
  onPick: (value: 'all' | 'online' | 'offline') => void;
}) {
  return (
    <button
      type="button"
      className={props.current === props.value ? 'on' : undefined}
      onClick={() => props.onPick(props.value)}
    >
      {props.label}
    </button>
  );
}
