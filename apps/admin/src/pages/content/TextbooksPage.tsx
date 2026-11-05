import type { AdminCertificate, AdminTextbookSummary, PublishStatus } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  createTextbook,
  deleteTextbook,
  getCatalogTree,
  linkTextbook,
  listCertificates,
  listDomains,
  unlinkTextbook,
  updateTextbook,
} from '../../catalog-api';
import { ConfirmDialog, Drawer } from '../../content/Drawer';
import { CLOSED_EDITOR, createEditor, editEditor, matchesQuery } from '../../content/drawer-state';
import { normalizeCode, normalizeName, parseSortOrder } from '../../content/form';
import { useAdminAction } from '../../content/use-admin-action';
import { useEditorParams } from '../../content/use-editor-params';

interface CertOption {
  id: string;
  name: string;
  domainName: string;
}

interface BookRow {
  id: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: number;
  certificateIds: string[];
}

interface Draft {
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: string;
  certificateIds: string[];
}

export function TextbooksPage() {
  const { token, pending, error, report, run } = useAdminAction();
  const { editor, list, setEditor, setList } = useEditorParams();
  const [certs, setCerts] = useState<CertOption[]>([]);
  const [books, setBooks] = useState<BookRow[]>([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeded, setSeeded] = useState('');
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadBooks(token)
      .then((result) => {
        if (!cancelled) {
          setCerts(result.certs);
          setBooks(result.books);
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
      setDraft({
        code: '',
        name: '',
        status: 'online',
        sortOrder: '0',
        certificateIds: certs[0] ? [certs[0].id] : [],
      });
      setSeeded(editorKey);
      setFormError('');
      return;
    }
    const book = books.find((item) => item.id === editor.id);
    if (!book) {
      return;
    }
    setDraft({
      code: book.code,
      name: book.name,
      status: book.status,
      sortOrder: String(book.sortOrder),
      certificateIds: [...book.certificateIds],
    });
    setSeeded(editorKey);
    setFormError('');
  }, [books, certs, draft, editor.id, editor.mode, editorKey, seeded]);

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

  const visible = books.filter((book) => matchesQuery(`${book.name} ${book.code}`, list.q));
  const deleting = books.find((book) => book.id === deleteId) ?? null;
  const names = new Map(certs.map((item) => [item.id, item.name]));

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
    if (draft.certificateIds.length === 0) {
      setFormError('至少关联一张证书');
      return;
    }
    setFormError('');
    const body = { code, name, status: draft.status, sortOrder };
    const certificateIds = draft.certificateIds;
    const ok = await run(async () => {
      if (editor.mode === 'edit' && editor.id) {
        const current = books.find((item) => item.id === editor.id);
        await updateTextbook(token, editor.id, body);
        const previous = new Set(current?.certificateIds ?? []);
        const next = new Set(certificateIds);
        for (const id of next) {
          if (!previous.has(id)) {
            await linkTextbook(token, id, editor.id);
          }
        }
        for (const id of previous) {
          if (!next.has(id)) {
            await unlinkTextbook(token, id, editor.id);
          }
        }
      } else {
        const [primary, ...rest] = certificateIds;
        if (!primary) {
          return;
        }
        const created = await createTextbook(token, primary, body);
        for (const id of rest) {
          await linkTextbook(token, id, created.id);
        }
      }
    });
    if (ok) {
      setReload((value) => value + 1);
      setEditor(CLOSED_EDITOR);
    }
  }

  async function toggle(book: BookRow): Promise<void> {
    const status: PublishStatus = book.status === 'online' ? 'offline' : 'online';
    const ok = await run(async () => {
      await updateTextbook(token, book.id, { status });
    });
    if (ok) {
      setReload((value) => value + 1);
    }
  }

  return (
    <section className="page">
      <h1>教材</h1>
      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索教材名称"
          value={list.q}
          onChange={(event) => setList(event.target.value, 'all')}
        />
        <div className="toolbar-end">
          <button type="button" disabled={pending || certs.length === 0} onClick={() => setEditor(createEditor())}>
            新建教材
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
              <th>教材</th>
              <th>关联证书</th>
              <th>版本</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={5}>正在读取教材…</td>
              </tr>
            ) : null}
            {ready && visible.length === 0 ? (
              <tr>
                <td colSpan={5}>没有符合条件的官方教材。</td>
              </tr>
            ) : null}
            {visible.map((book) => (
              <tr key={book.id}>
                <td>{book.name}</td>
                <td>{labelCerts(book.certificateIds, names)}</td>
                <td title="目录接口没有版次字段">—</td>
                <td>
                  <span className={book.status === 'online' ? 'pill' : 'pill off'}>
                    {book.status === 'online' ? '启用' : '停用'}
                  </span>
                </td>
                <td className="ops">
                  <button type="button" className="link" onClick={() => setEditor(editEditor(book.id))}>
                    编辑
                  </button>
                  <span className="op-sep">·</span>
                  <button type="button" className="link" disabled={pending} onClick={() => void toggle(book)}>
                    {book.status === 'online' ? '停用' : '启用'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        版本列留空，因为目录接口没有版次。用户上传的课件不在这里，到
        <Link to="/courseware">用户上传教材</Link>
        只读查看。
      </p>
      <Drawer
        open={editor.mode !== 'closed'}
        title={editor.mode === 'edit' ? '编辑教材' : '新建教材'}
        onClose={() => setEditor(CLOSED_EDITOR)}
      >
        {editor.mode === 'edit' && !draft ? <p className="muted">找不到这本教材。</p> : null}
        {draft ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              code
              <input value={draft.code} required onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
            </label>
            <label>
              name
              <input value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <fieldset className="type-set">
              <legend>certificateIds</legend>
              {certs.length === 0 ? <p className="hint">还没有证书，不能挂教材。</p> : null}
              {certs.map((cert) => (
                <label key={cert.id}>
                  <input
                    type="checkbox"
                    checked={draft.certificateIds.includes(cert.id)}
                    onChange={() =>
                      setDraft({
                        ...draft,
                        certificateIds: toggleId(draft.certificateIds, cert.id),
                      })
                    }
                  />
                  {cert.domainName} / {cert.name}
                </label>
              ))}
            </fieldset>
            <label>
              status
              <select
                value={draft.status}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    status: event.target.value === 'offline' ? 'offline' : 'online',
                  })
                }
              >
                <option value="online">启用</option>
                <option value="offline">停用</option>
              </select>
            </label>
            <label>
              sortOrder
              <input
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
            </label>
            <p className="hint">版次不在当前目录接口，不会保存。</p>
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
            {editor.mode === 'edit' && editor.id ? (
              <button type="button" className="link danger-link delete-link" onClick={() => setDeleteId(editor.id)}>
                删除
              </button>
            ) : null}
          </form>
        ) : null}
      </Drawer>
      <ConfirmDialog
        open={Boolean(deleting)}
        title="确认删除该教材？"
        body={
          deleting
            ? `删除「${deleting.name}」及其知识点。仍被其他证书或刷题包使用时会失败，可以改为停用或只卸下关联。`
            : ''
        }
        confirmLabel="确认删除"
        pending={pending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleting) {
            return;
          }
          void run(async () => {
            await deleteTextbook(token, deleting.id);
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

async function loadBooks(token: string): Promise<{ certs: CertOption[]; books: BookRow[] }> {
  const domains = await listDomains(token);
  const groups = await Promise.all(
    domains.items.map(async (domain) => {
      const list = await listCertificates(token, domain.id);
      return list.items.map((certificate: AdminCertificate) => ({
        id: certificate.id,
        name: certificate.name,
        domainName: domain.name,
      }));
    }),
  );
  const certs = groups.flat();
  const trees = await Promise.all(certs.map((cert) => getCatalogTree(token, cert.id)));
  const map = new Map<string, AdminTextbookSummary>();
  for (const tree of trees) {
    for (const book of tree.textbooks) {
      map.set(book.id, book);
    }
    for (const book of tree.linkableTextbooks) {
      if (!map.has(book.id)) {
        map.set(book.id, book);
      }
    }
  }
  return {
    certs,
    books: [...map.values()].map((book) => ({
      id: book.id,
      code: book.code,
      name: book.name,
      status: book.status,
      sortOrder: book.sortOrder,
      certificateIds: book.certificateIds,
    })),
  };
}

function labelCerts(ids: string[], names: Map<string, string>): string {
  if (ids.length === 0) {
    return '未关联';
  }
  return ids.map((id) => names.get(id) ?? id).join('、');
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}
