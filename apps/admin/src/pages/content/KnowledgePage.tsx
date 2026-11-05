import {
  CATALOG_PROMPT_MAX_LENGTH,
  CATALOG_SOURCE_REF_MAX_LENGTH,
  type AdminCatalogTree,
  type AdminCertificate,
  type AdminKnowledgeNode,
  type CatalogNodeKind,
  type PublishStatus,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  createIndependentPoint,
  createTextbookNode,
  deleteKnowledge,
  getCatalogTree,
  listCertificates,
  listDomains,
  updateKnowledge,
} from '../../catalog-api';
import { ConfirmDialog } from '../../content/Drawer';
import { normalizeCode, normalizeName, parseSortOrder } from '../../content/form';
import { useAdminAction } from '../../content/use-admin-action';

interface CertOption {
  id: string;
  name: string;
  domainName: string;
}

interface Draft {
  id?: string;
  textbookId: string | null;
  parentId: string | null;
  independent: boolean;
  code: string;
  name: string;
  kind: CatalogNodeKind;
  promptHint: string;
  sourceRef: string;
  status: PublishStatus;
  sortOrder: string;
}

export function KnowledgePage() {
  const { token, pending, error, report, run } = useAdminAction();
  const [params, setParams] = useSearchParams();
  const certificateId = params.get('certificate') ?? '';
  const [certs, setCerts] = useState<CertOption[]>([]);
  const [tree, setTree] = useState<AdminCatalogTree | null>(null);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then(async (domains) => {
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
        if (cancelled) {
          return;
        }
        const options = groups.flat();
        setCerts(options);
        setReady(true);
        const first = options[0];
        if (!first) {
          return;
        }
        setParams(
          (current) => {
            if (current.get('certificate')) {
              return current;
            }
            const next = new URLSearchParams(current);
            next.set('certificate', first.id);
            return next;
          },
          { replace: true },
        );
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
  }, [report, setParams, token]);

  useEffect(() => {
    if (!certificateId) {
      setTree(null);
      return;
    }
    let cancelled = false;
    getCatalogTree(token, certificateId)
      .then((result) => {
        if (!cancelled) {
          setTree(result);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          report(caught);
          setTree(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [certificateId, reload, report, token]);

  function chooseCertificate(id: string): void {
    const next = new URLSearchParams(params);
    next.set('certificate', id);
    setParams(next, { replace: true });
    setDraft(null);
    setFormError('');
  }

  function startCreate(textbookId: string | null, parentId: string | null, independent: boolean): void {
    setFormError('');
    setDraft({
      textbookId,
      parentId,
      independent,
      code: '',
      name: '',
      kind: 'knowledge_point',
      promptHint: '',
      sourceRef: '',
      status: 'offline',
      sortOrder: '0',
    });
  }

  function editNode(node: AdminKnowledgeNode, textbookId: string | null, independent: boolean): void {
    setFormError('');
    setDraft({
      id: node.id,
      textbookId,
      parentId: node.parentId,
      independent,
      code: node.code,
      name: node.name,
      kind: node.kind,
      promptHint: node.promptHint ?? '',
      sourceRef: node.sourceRef ?? '',
      status: node.status,
      sortOrder: String(node.sortOrder),
    });
  }

  async function save(): Promise<void> {
    if (!draft || !certificateId) {
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
      setFormError('标题不能为空');
      return;
    }
    if (sortOrder === null) {
      setFormError('排序需要是 0 到 10000 的整数');
      return;
    }
    const hint = draft.promptHint.trim();
    if (draft.kind === 'knowledge_point' && !hint) {
      setFormError('知识点需要 promptHint，未填写不能保存或启用');
      return;
    }
    if (draft.kind === 'knowledge_point' && draft.status === 'online' && !hint) {
      setFormError('知识点无 promptHint 不可启用');
      return;
    }
    if (hint.length > CATALOG_PROMPT_MAX_LENGTH) {
      setFormError('promptHint 不能超过 500 字');
      return;
    }
    if (draft.sourceRef.trim().length > CATALOG_SOURCE_REF_MAX_LENGTH) {
      setFormError('sourceRef 不能超过 200 字');
      return;
    }
    setFormError('');
    const body = {
      code,
      name,
      kind: draft.independent ? ('knowledge_point' as const) : draft.kind,
      promptHint: draft.kind === 'group' ? null : hint,
      sourceRef: draft.sourceRef.trim() ? draft.sourceRef.trim() : null,
      status: draft.status,
      sortOrder,
      parentId: draft.independent ? null : draft.parentId,
    };
    const ok = await run(async () => {
      if (draft.id) {
        await updateKnowledge(token, draft.id, body);
      } else if (draft.independent) {
        await createIndependentPoint(token, certificateId, body);
      } else if (draft.textbookId) {
        await createTextbookNode(token, draft.textbookId, body);
      }
    });
    if (ok) {
      setDraft(null);
      setReload((value) => value + 1);
    }
  }

  const deletingName = deleteId ? findNodeName(tree, deleteId) : '';

  return (
    <section className="page">
      <h1>章节知识点</h1>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="split">
        <section className="card-panel tree-pane">
          <label>
            证书
            <select value={certificateId} onChange={(event) => chooseCertificate(event.target.value)}>
              {certs.length === 0 ? <option value="">还没有证书</option> : null}
              {certs.map((cert) => (
                <option key={cert.id} value={cert.id}>
                  {cert.domainName} / {cert.name}
                </option>
              ))}
            </select>
          </label>
          {!ready || (certificateId && !tree) ? <p className="muted">正在读取知识点…</p> : null}
          {tree
            ? tree.textbooks.map((book) => (
                <div key={book.id} className="tree-book">
                  <div className="tree-book-head">
                    <strong>{book.name}</strong>
                    <button
                      type="button"
                      className="secondary tiny"
                      disabled={pending}
                      onClick={() => startCreate(book.id, null, false)}
                    >
                      新建节点
                    </button>
                  </div>
                  {book.nodes.length === 0 ? <p className="hint">这本教材还没有章节。</p> : null}
                  {book.nodes.map((node) => (
                    <TreeButton
                      key={node.id}
                      node={node}
                      selectedId={draft?.id ?? null}
                      onPick={(current) => editNode(current, book.id, false)}
                    />
                  ))}
                </div>
              ))
            : null}
          {tree ? (
            <div className="tree-book">
              <div className="tree-book-head">
                <strong>不挂教材</strong>
                <button
                  type="button"
                  className="secondary tiny"
                  disabled={pending || !certificateId}
                  onClick={() => startCreate(null, null, true)}
                >
                  新建节点
                </button>
              </div>
              {tree.independentPoints.length === 0 ? <p className="hint">没有独立知识点。</p> : null}
              {tree.independentPoints.map((node) => (
                <TreeButton
                  key={node.id}
                  node={node}
                  selectedId={draft?.id ?? null}
                  onPick={(current) => editNode(current, null, true)}
                />
              ))}
            </div>
          ) : null}
          <p className="hint">无 weight；仅知识点可被 App 勾选。</p>
        </section>
        <section className="card-panel">
          {!draft ? <p className="muted">选择左侧章节或知识点，或新建节点。</p> : null}
          {draft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <div className="drawer-head">
                <h2>{draft.id ? (draft.kind === 'group' ? '编辑章节' : '编辑知识点') : '新建节点'}</h2>
                <span className={draft.kind === 'group' ? 'badge chapter' : 'badge'}>
                  level = {draft.kind}
                </span>
              </div>
              <label>
                标题
                <input
                  value={draft.name}
                  required
                  onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                />
              </label>
              <label>
                code
                <input
                  value={draft.code}
                  required
                  onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                />
              </label>
              {draft.independent ? null : (
                <label>
                  类型
                  <select
                    value={draft.kind}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        kind: event.target.value === 'group' ? 'group' : 'knowledge_point',
                      })
                    }
                  >
                    <option value="knowledge_point">知识点</option>
                    <option value="group">章节</option>
                  </select>
                </label>
              )}
              {draft.kind === 'knowledge_point' ? (
                <label>
                  promptHint（必填）
                  <textarea
                    value={draft.promptHint}
                    onChange={(event) => setDraft({ ...draft, promptHint: event.target.value })}
                  />
                </label>
              ) : (
                <p className="hint">章节分组不填写出题提示，也不会被 App 勾选。</p>
              )}
              <label>
                sourceRef（选配）
                <input
                  value={draft.sourceRef}
                  onChange={(event) => setDraft({ ...draft, sourceRef: event.target.value })}
                />
              </label>
              <label>
                sortOrder
                <input
                  value={draft.sortOrder}
                  onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
                />
              </label>
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={draft.status === 'online'}
                  onChange={(event) =>
                    setDraft({ ...draft, status: event.target.checked ? 'online' : 'offline' })
                  }
                />
                启用
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
                {draft.id && draft.status === 'online' ? (
                  <button
                    type="button"
                    className="secondary"
                    disabled={pending}
                    onClick={() => {
                      const id = draft.id;
                      if (!id) {
                        return;
                      }
                      void run(async () => {
                        await updateKnowledge(token, id, { status: 'offline' });
                      }).then((ok) => {
                        if (ok) {
                          setDraft({ ...draft, status: 'offline' });
                          setReload((value) => value + 1);
                        }
                      });
                    }}
                  >
                    停用
                  </button>
                ) : null}
              </div>
              <p className="hint">规则：知识点无 promptHint 不可启用；不做 weight。</p>
              {draft.id && draft.kind === 'group' ? (
                <button
                  type="button"
                  className="secondary tiny"
                  onClick={() => startCreate(draft.textbookId, draft.id ?? null, false)}
                >
                  在此章节下新建
                </button>
              ) : null}
              {draft.id ? (
                <button type="button" className="link danger-link delete-link" onClick={() => setDeleteId(draft.id ?? null)}>
                  删除
                </button>
              ) : null}
            </form>
          ) : null}
        </section>
      </div>
      <ConfirmDialog
        open={Boolean(deleteId)}
        title="确认删除该节点？"
        body={`删除「${deletingName || '该节点'}」及其子节点。仍在刷题包里时会失败，可以改为停用。`}
        confirmLabel="确认删除"
        pending={pending}
        onCancel={() => setDeleteId(null)}
        onConfirm={() => {
          if (!deleteId) {
            return;
          }
          const id = deleteId;
          void run(async () => {
            await deleteKnowledge(token, id);
          }).then((ok) => {
            if (ok) {
              setDeleteId(null);
              if (draft?.id === id) {
                setDraft(null);
              }
              setReload((value) => value + 1);
            }
          });
        }}
      />
    </section>
  );
}

function TreeButton(props: {
  node: AdminKnowledgeNode;
  selectedId: string | null;
  onPick: (node: AdminKnowledgeNode) => void;
}) {
  const node = props.node;
  return (
    <>
      <button
        type="button"
        className={props.selectedId === node.id ? 'tree-node selected' : 'tree-node'}
        style={{ paddingLeft: 8 + Math.max(0, node.level - 1) * 16 }}
        onClick={() => props.onPick(node)}
      >
        <span>{node.name}</span>
        <span className={node.kind === 'group' ? 'badge chapter' : 'badge'}>
          {node.kind === 'group' ? '章节' : 'KP'}
        </span>
      </button>
      {node.children.map((child) => (
        <TreeButton key={child.id} node={child} selectedId={props.selectedId} onPick={props.onPick} />
      ))}
    </>
  );
}

function findNodeName(tree: AdminCatalogTree | null, id: string): string {
  if (!tree) {
    return '';
  }
  for (const book of tree.textbooks) {
    const found = findIn(book.nodes, id);
    if (found) {
      return found;
    }
  }
  return findIn(tree.independentPoints, id) ?? '';
}

function findIn(nodes: AdminKnowledgeNode[], id: string): string | null {
  for (const node of nodes) {
    if (node.id === id) {
      return node.name;
    }
    const child = findIn(node.children, id);
    if (child) {
      return child;
    }
  }
  return null;
}
