import type {
  AdminDomain,
  AdminDomainPatch,
  AdminDomainWrite,
  PublishStatus,
} from '@tishuashua/shared';
import { useState } from 'react';
import { statusLabel } from '../CatalogPage';
import { Field, StatusField } from './fields';

interface Draft {
  id?: string;
  code: string;
  name: string;
  status: PublishStatus;
  sortOrder: string;
}

export function DomainColumn(props: {
  items: AdminDomain[];
  selectedId: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  onCreate: (body: AdminDomainWrite) => Promise<boolean>;
  onUpdate: (id: string, body: AdminDomainPatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);

  function startCreate(): void {
    setDraft({ code: '', name: '', status: 'online', sortOrder: '0' });
  }

  function startEdit(item: AdminDomain): void {
    setDraft({
      id: item.id,
      code: item.code,
      name: item.name,
      status: item.status,
      sortOrder: String(item.sortOrder),
    });
  }

  async function save(): Promise<void> {
    if (!draft) {
      return;
    }
    const body = {
      code: draft.code,
      name: draft.name,
      status: draft.status,
      sortOrder: numberOrZero(draft.sortOrder),
    };
    const ok = draft.id ? await props.onUpdate(draft.id, body) : await props.onCreate(body);
    if (ok) {
      setDraft(null);
    }
  }

  return (
    <section className="panel">
      <div className="catalog-head">
        <h1>领域</h1>
        <button
          type="button"
          className="secondary tiny"
          onClick={startCreate}
          disabled={props.pending}
        >
          新建
        </button>
      </div>
      {props.items.length === 0 ? <p className="muted">还没有领域。</p> : null}
      {props.items.map((item) => (
        <div key={item.id} className={item.id === props.selectedId ? 'entity selected' : 'entity'}>
          <button type="button" className="entity-title" onClick={() => props.onSelect(item.id)}>
            <strong>{item.name}</strong>
            <span className={item.status === 'online' ? 'tag' : 'tag off'}>
              {statusLabel(item.status)}
            </span>
          </button>
          <p className="hint">
            {item.code} · 排序 {item.sortOrder}
          </p>
          <div className="actions">
            <button
              type="button"
              className="secondary tiny"
              disabled={props.pending}
              onClick={() => startEdit(item)}
            >
              编辑
            </button>
            <button
              type="button"
              className="secondary tiny"
              disabled={props.pending}
              onClick={() => {
                const next: PublishStatus = item.status === 'online' ? 'offline' : 'online';
                if (
                  next === 'offline' &&
                  !window.confirm(
                    `下架「${item.name}」后，小程序选不到这个领域，也不能在其中新建刷题包。证书仍上架时，已经保存的刷题包还可以刷。`,
                  )
                ) {
                  return;
                }
                void props.onUpdate(item.id, { status: next });
              }}
            >
              {item.status === 'online' ? '下架' : '上架'}
            </button>
            <button
              type="button"
              className="danger tiny"
              disabled={props.pending}
              onClick={() => {
                if (
                  !window.confirm(`删除领域「${item.name}」？下面还有证书时会失败，可以改为下架。`)
                ) {
                  return;
                }
                void props.onDelete(item.id);
              }}
            >
              删除
            </button>
          </div>
        </div>
      ))}
      {draft ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <h2>{draft.id ? '编辑领域' : '新建领域'}</h2>
          <Field
            label="编码"
            value={draft.code}
            required
            onChange={(code) => setDraft({ ...draft, code })}
          />
          <Field
            label="名称"
            value={draft.name}
            required
            onChange={(name) => setDraft({ ...draft, name })}
          />
          <Field
            label="排序"
            value={draft.sortOrder}
            onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
          />
          <StatusField value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
          <div className="actions">
            <button type="submit" disabled={props.pending}>
              保存
            </button>
            <button type="button" className="secondary" onClick={() => setDraft(null)}>
              取消
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
