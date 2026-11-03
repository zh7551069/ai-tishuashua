import type {
  AdminCatalogTree,
  AdminKnowledgeNode,
  AdminTextbookSummary,
  CatalogNodeKind,
  PublishStatus,
} from '@tishuashua/shared';
import { useState } from 'react';
import {
  createIndependentPoint,
  createTextbook,
  createTextbookNode,
  deleteKnowledge,
  deleteTextbook,
  linkTextbook,
  unlinkTextbook,
  updateKnowledge,
  updateTextbook,
} from '../../catalog-api';
import { statusLabel } from '../CatalogPage';
import { AreaField, Field, StatusField } from './fields';

interface TextbookDraft {
  id?: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: string;
}

interface NodeDraft {
  id?: string;
  textbookId: string | null;
  parentId: string | null;
  code: string;
  name: string;
  kind: CatalogNodeKind;
  promptHint: string;
  sourceRef: string;
  status: PublishStatus;
  sortOrder: string;
  independent: boolean;
}

export function TreeColumn(props: {
  token: string;
  certificateId: string | null;
  tree: AdminCatalogTree | null;
  pending: boolean;
  run: (task: () => Promise<void>) => Promise<boolean>;
  onChanged: () => void;
}) {
  const [textbookDraft, setTextbookDraft] = useState<TextbookDraft | null>(null);
  const [nodeDraft, setNodeDraft] = useState<NodeDraft | null>(null);
  const [linkId, setLinkId] = useState('');
  const tree = props.tree;

  async function saveTextbook(): Promise<void> {
    const certificateId = props.certificateId;
    if (!textbookDraft || !certificateId) {
      return;
    }
    const body = {
      code: textbookDraft.code,
      name: textbookDraft.name,
      status: textbookDraft.status,
      sortOrder: numberOrZero(textbookDraft.sortOrder),
    };
    const ok = await props.run(async () => {
      if (textbookDraft.id) {
        await updateTextbook(props.token, textbookDraft.id, body);
      } else {
        await createTextbook(props.token, certificateId, body);
      }
      props.onChanged();
    });
    if (ok) {
      setTextbookDraft(null);
    }
  }

  async function saveNode(): Promise<void> {
    if (!nodeDraft) {
      return;
    }
    if (nodeDraft.kind === 'knowledge_point' && !nodeDraft.promptHint.trim()) {
      window.alert('知识点需要出题提示');
      return;
    }
    const body = {
      code: nodeDraft.code,
      name: nodeDraft.name,
      kind: nodeDraft.kind,
      promptHint: nodeDraft.kind === 'group' ? null : nodeDraft.promptHint.trim(),
      sourceRef: nodeDraft.sourceRef.trim() === '' ? null : nodeDraft.sourceRef.trim(),
      status: nodeDraft.status,
      sortOrder: numberOrZero(nodeDraft.sortOrder),
      parentId: nodeDraft.parentId,
    };
    const ok = await props.run(async () => {
      if (nodeDraft.id) {
        await updateKnowledge(props.token, nodeDraft.id, body);
      } else if (nodeDraft.independent && props.certificateId) {
        await createIndependentPoint(props.token, props.certificateId, body);
      } else if (nodeDraft.textbookId) {
        await createTextbookNode(props.token, nodeDraft.textbookId, body);
      }
      props.onChanged();
    });
    if (ok) {
      setNodeDraft(null);
    }
  }

  return (
    <section className="panel">
      <div className="catalog-head">
        <h1>知识点树</h1>
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending || !props.certificateId}
          onClick={() => setTextbookDraft({ code: '', name: '', status: 'online', sortOrder: '0' })}
        >
          新建教材
        </button>
      </div>
      {!props.certificateId ? <p className="muted">先选择一张证书。</p> : null}
      {props.certificateId && !tree ? <p className="muted">正在读取知识点…</p> : null}
      {tree ? (
        <>
          <p className="hint">
            {tree.domainName} / {tree.certificateName}
            。空教材、分组和下架知识点会留在这里，小程序树只显示已上架且能入包的知识点。
          </p>
          {tree.linkableTextbooks.length > 0 ? (
            <div className="actions">
              <select value={linkId} onChange={(event) => setLinkId(event.target.value)}>
                <option value="">挂已有教材</option>
                {tree.linkableTextbooks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}（
                    {item.certificateIds.length === 0
                      ? '未挂证书'
                      : `已挂 ${item.certificateIds.length} 张`}
                    ）
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="secondary tiny"
                disabled={props.pending || !linkId}
                onClick={() => {
                  const textbookId = linkId;
                  void props.run(async () => {
                    await linkTextbook(props.token, tree.certificateId, textbookId);
                    props.onChanged();
                  });
                  setLinkId('');
                }}
              >
                挂上
              </button>
              <OrphanDelete
                pending={props.pending}
                item={tree.linkableTextbooks.find((item) => item.id === linkId)}
                onDelete={(id) =>
                  props.run(async () => {
                    await deleteTextbook(props.token, id);
                    props.onChanged();
                  })
                }
              />
            </div>
          ) : null}
          {tree.textbooks.map((textbook) => (
            <TextbookBlock
              key={textbook.id}
              textbook={textbook}
              pending={props.pending}
              onEdit={() =>
                setTextbookDraft({
                  id: textbook.id,
                  code: textbook.code,
                  name: textbook.name,
                  status: textbook.status,
                  sortOrder: String(textbook.sortOrder),
                })
              }
              onToggle={() => {
                const next: PublishStatus = textbook.status === 'online' ? 'offline' : 'online';
                void props.run(async () => {
                  await updateTextbook(props.token, textbook.id, { status: next });
                  props.onChanged();
                });
              }}
              onUnlink={() => {
                if (
                  !window.confirm(`从本证书卸下「${textbook.name}」？教材本身还在，可以再挂上。`)
                ) {
                  return;
                }
                void props.run(async () => {
                  await unlinkTextbook(props.token, tree.certificateId, textbook.id);
                  props.onChanged();
                });
              }}
              onDelete={() => {
                const shared = textbook.certificateIds.length > 1;
                const message = shared
                  ? `「${textbook.name}」还挂在其他 ${textbook.certificateIds.length - 1} 张证书上。删除后这些证书上也会消失。仍被刷题包使用时会失败。`
                  : `删除教材「${textbook.name}」及其知识点？仍被刷题包使用时会失败，可以改为下架。`;
                if (!window.confirm(message)) {
                  return;
                }
                void props.run(async () => {
                  await deleteTextbook(props.token, textbook.id);
                  props.onChanged();
                });
              }}
              onAdd={(parentId) =>
                setNodeDraft({
                  textbookId: textbook.id,
                  parentId,
                  code: '',
                  name: '',
                  kind: 'knowledge_point',
                  promptHint: '',
                  sourceRef: '',
                  status: 'online',
                  sortOrder: '0',
                  independent: false,
                })
              }
              onEditNode={(node) =>
                setNodeDraft({
                  id: node.id,
                  textbookId: textbook.id,
                  parentId: node.parentId,
                  code: node.code,
                  name: node.name,
                  kind: node.kind,
                  promptHint: node.promptHint ?? '',
                  sourceRef: node.sourceRef ?? '',
                  status: node.status,
                  sortOrder: String(node.sortOrder),
                  independent: false,
                })
              }
              onToggleNode={(node) => {
                const next: PublishStatus = node.status === 'online' ? 'offline' : 'online';
                void props.run(async () => {
                  await updateKnowledge(props.token, node.id, { status: next });
                  props.onChanged();
                });
              }}
              onDeleteNode={(node) => {
                if (
                  !window.confirm(
                    `删除「${node.name}」及其子节点？仍在刷题包里时会失败，可以改为下架。`,
                  )
                ) {
                  return;
                }
                void props.run(async () => {
                  await deleteKnowledge(props.token, node.id);
                  props.onChanged();
                });
              }}
            />
          ))}
          <div className="catalog-head">
            <h2>独立知识点</h2>
            <button
              type="button"
              className="secondary tiny"
              disabled={props.pending}
              onClick={() =>
                setNodeDraft({
                  textbookId: null,
                  parentId: null,
                  code: '',
                  name: '',
                  kind: 'knowledge_point',
                  promptHint: '',
                  sourceRef: '',
                  status: 'online',
                  sortOrder: '0',
                  independent: true,
                })
              }
            >
              新建
            </button>
          </div>
          {tree.independentPoints.length === 0 ? (
            <p className="hint">没有不挂教材的知识点。</p>
          ) : null}
          {tree.independentPoints.map((node) => (
            <NodeBlock
              key={node.id}
              node={node}
              pending={props.pending}
              allowChildren={false}
              onAdd={() => undefined}
              onEdit={(current) =>
                setNodeDraft({
                  id: current.id,
                  textbookId: null,
                  parentId: null,
                  code: current.code,
                  name: current.name,
                  kind: 'knowledge_point',
                  promptHint: current.promptHint ?? '',
                  sourceRef: current.sourceRef ?? '',
                  status: current.status,
                  sortOrder: String(current.sortOrder),
                  independent: true,
                })
              }
              onToggle={(current) => {
                const next: PublishStatus = current.status === 'online' ? 'offline' : 'online';
                void props.run(async () => {
                  await updateKnowledge(props.token, current.id, { status: next });
                  props.onChanged();
                });
              }}
              onDelete={(current) => {
                if (!window.confirm(`删除独立知识点「${current.name}」？仍在刷题包里时会失败。`)) {
                  return;
                }
                void props.run(async () => {
                  await deleteKnowledge(props.token, current.id);
                  props.onChanged();
                });
              }}
            />
          ))}
        </>
      ) : null}
      {textbookDraft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveTextbook();
          }}
        >
          <h2>{textbookDraft.id ? '编辑教材' : '新建教材'}</h2>
          <Field
            label="编码"
            value={textbookDraft.code}
            required
            onChange={(code) => setTextbookDraft({ ...textbookDraft, code })}
          />
          <Field
            label="名称"
            value={textbookDraft.name}
            required
            onChange={(name) => setTextbookDraft({ ...textbookDraft, name })}
          />
          <Field
            label="排序"
            value={textbookDraft.sortOrder}
            onChange={(sortOrder) => setTextbookDraft({ ...textbookDraft, sortOrder })}
          />
          <StatusField
            value={textbookDraft.status}
            onChange={(status) => setTextbookDraft({ ...textbookDraft, status })}
          />
          <div className="actions">
            <button type="submit" disabled={props.pending}>
              保存
            </button>
            <button type="button" className="secondary" onClick={() => setTextbookDraft(null)}>
              取消
            </button>
          </div>
        </form>
      ) : null}
      {nodeDraft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveNode();
          }}
        >
          <h2>{nodeDraft.id ? '编辑节点' : '新建节点'}</h2>
          <Field
            label="编码"
            value={nodeDraft.code}
            required
            onChange={(code) => setNodeDraft({ ...nodeDraft, code })}
          />
          <Field
            label="名称"
            value={nodeDraft.name}
            required
            onChange={(name) => setNodeDraft({ ...nodeDraft, name })}
          />
          {nodeDraft.independent ? null : (
            <label>
              类型
              <select
                value={nodeDraft.kind}
                onChange={(event) =>
                  setNodeDraft({
                    ...nodeDraft,
                    kind: event.target.value === 'group' ? 'group' : 'knowledge_point',
                  })
                }
              >
                <option value="knowledge_point">知识点</option>
                <option value="group">分组</option>
              </select>
            </label>
          )}
          {nodeDraft.kind === 'knowledge_point' ? (
            <AreaField
              label="出题提示"
              value={nodeDraft.promptHint}
              onChange={(promptHint) => setNodeDraft({ ...nodeDraft, promptHint })}
            />
          ) : (
            <p className="hint">分组不会出现在小程序树上，它下面的已上架知识点会挂在教材下。</p>
          )}
          <Field
            label="来源（可空）"
            value={nodeDraft.sourceRef}
            onChange={(sourceRef) => setNodeDraft({ ...nodeDraft, sourceRef })}
          />
          <Field
            label="排序"
            value={nodeDraft.sortOrder}
            onChange={(sortOrder) => setNodeDraft({ ...nodeDraft, sortOrder })}
          />
          <StatusField
            value={nodeDraft.status}
            onChange={(status) => setNodeDraft({ ...nodeDraft, status })}
          />
          <div className="actions">
            <button type="submit" disabled={props.pending}>
              保存
            </button>
            <button type="button" className="secondary" onClick={() => setNodeDraft(null)}>
              取消
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function OrphanDelete(props: {
  pending: boolean;
  item: AdminTextbookSummary | undefined;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const item = props.item;
  if (!item || item.certificateIds.length > 0) {
    return null;
  }
  return (
    <button
      type="button"
      className="danger tiny"
      disabled={props.pending}
      onClick={() => {
        if (!window.confirm(`删除未挂证书的教材「${item.name}」？`)) {
          return;
        }
        void props.onDelete(item.id);
      }}
    >
      删除未挂教材
    </button>
  );
}

function TextbookBlock(props: {
  textbook: AdminCatalogTree['textbooks'][number];
  pending: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onUnlink: () => void;
  onDelete: () => void;
  onAdd: (parentId: string | null) => void;
  onEditNode: (node: AdminKnowledgeNode) => void;
  onToggleNode: (node: AdminKnowledgeNode) => void;
  onDeleteNode: (node: AdminKnowledgeNode) => void;
}) {
  const textbook = props.textbook;
  return (
    <article className="entity">
      <div className="entity-title">
        <strong>{textbook.name}</strong>
        <span className={textbook.status === 'online' ? 'tag' : 'tag off'}>
          {statusLabel(textbook.status)}
        </span>
      </div>
      <p className="hint">
        {textbook.code}
        {textbook.certificateIds.length > 1
          ? ` · 还挂在其他 ${textbook.certificateIds.length - 1} 张证书上，改名和上下架会一起生效`
          : ''}
      </p>
      <div className="actions">
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={props.onEdit}
        >
          编辑
        </button>
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={props.onToggle}
        >
          {textbook.status === 'online' ? '下架' : '上架'}
        </button>
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={() => props.onAdd(null)}
        >
          加节点
        </button>
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={props.onUnlink}
        >
          卸下
        </button>
        <button
          type="button"
          className="danger tiny"
          disabled={props.pending}
          onClick={props.onDelete}
        >
          删除
        </button>
      </div>
      {textbook.nodes.length === 0 ? (
        <p className="hint">还没有知识点。空的或下架的教材不会出现在小程序树上。</p>
      ) : null}
      {textbook.nodes.map((node) => (
        <NodeBlock
          key={node.id}
          node={node}
          pending={props.pending}
          allowChildren
          onAdd={props.onAdd}
          onEdit={props.onEditNode}
          onToggle={props.onToggleNode}
          onDelete={props.onDeleteNode}
        />
      ))}
    </article>
  );
}

function NodeBlock(props: {
  node: AdminKnowledgeNode;
  pending: boolean;
  allowChildren: boolean;
  onAdd: (parentId: string) => void;
  onEdit: (node: AdminKnowledgeNode) => void;
  onToggle: (node: AdminKnowledgeNode) => void;
  onDelete: (node: AdminKnowledgeNode) => void;
}) {
  const node = props.node;
  return (
    <div className="node">
      <div className="entity-title">
        <strong>{node.name}</strong>
        <span className={node.status === 'online' ? 'tag' : 'tag off'}>
          {statusLabel(node.status)}
        </span>
      </div>
      <p className="hint">
        {node.kind === 'group' ? '分组' : '知识点'} · {node.code} · {node.level} 级
      </p>
      {node.promptHint ? <p className="hint">{node.promptHint}</p> : null}
      <div className="actions">
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={() => props.onEdit(node)}
        >
          编辑
        </button>
        <button
          type="button"
          className="secondary tiny"
          disabled={props.pending}
          onClick={() => props.onToggle(node)}
        >
          {node.status === 'online' ? '下架' : '上架'}
        </button>
        {props.allowChildren ? (
          <button
            type="button"
            className="secondary tiny"
            disabled={props.pending}
            onClick={() => props.onAdd(node.id)}
          >
            加子节点
          </button>
        ) : null}
        <button
          type="button"
          className="danger tiny"
          disabled={props.pending}
          onClick={() => props.onDelete(node)}
        >
          删除
        </button>
      </div>
      {node.children.map((child) => (
        <NodeBlock
          key={child.id}
          node={child}
          pending={props.pending}
          allowChildren={props.allowChildren}
          onAdd={props.onAdd}
          onEdit={props.onEdit}
          onToggle={props.onToggle}
          onDelete={props.onDelete}
        />
      ))}
    </div>
  );
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
