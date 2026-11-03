import {
  QUIZ_TYPE_LABELS,
  QUIZ_TYPES,
  type AdminCertificate,
  type AdminCertificatePatch,
  type AdminCertificateWrite,
  type PublishStatus,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useState } from 'react';
import { statusLabel } from '../CatalogPage';
import { AreaField, Field, StatusField } from './fields';

interface Draft {
  id?: string;
  code: string;
  name: string;
  status: PublishStatus;
  totalScore: string;
  passScore: string;
  extraConstraint: string;
  sortOrder: string;
  types: QuizTypeCode[];
}

export function CertificateColumn(props: {
  domainId: string | null;
  items: AdminCertificate[];
  selectedId: string | null;
  pending: boolean;
  onSelect: (id: string) => void;
  onCreate: (body: AdminCertificateWrite) => Promise<boolean>;
  onUpdate: (id: string, body: AdminCertificatePatch) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);

  function startCreate(): void {
    setDraft({
      code: '',
      name: '',
      status: 'online',
      totalScore: '100',
      passScore: '',
      extraConstraint: '',
      sortOrder: '0',
      types: [...QUIZ_TYPES],
    });
  }

  function startEdit(item: AdminCertificate): void {
    setDraft({
      id: item.id,
      code: item.code,
      name: item.name,
      status: item.status,
      totalScore: String(item.totalScore),
      passScore: item.passScore === null ? '' : String(item.passScore),
      extraConstraint: item.extraConstraint ?? '',
      sortOrder: String(item.sortOrder),
      types: item.enabledQuestionTypeCodes.filter(isQuizType),
    });
  }

  async function save(): Promise<void> {
    if (!draft || draft.types.length === 0) {
      window.alert('请至少选择一种题型');
      return;
    }
    const totalScore = Number(draft.totalScore);
    if (!Number.isInteger(totalScore) || totalScore < 1) {
      window.alert('总分必须是正整数');
      return;
    }
    const passScore = draft.passScore.trim() === '' ? null : Number(draft.passScore);
    if (passScore !== null && (!Number.isInteger(passScore) || passScore < 0)) {
      window.alert('及格分必须是不小于 0 的整数，或留空');
      return;
    }
    const body = {
      code: draft.code,
      name: draft.name,
      status: draft.status,
      totalScore,
      passScore,
      extraConstraint: draft.extraConstraint.trim() === '' ? null : draft.extraConstraint.trim(),
      sortOrder: numberOrZero(draft.sortOrder),
      enabledQuestionTypeCodes: draft.types,
    };
    const ok = draft.id ? await props.onUpdate(draft.id, body) : await props.onCreate(body);
    if (ok) {
      setDraft(null);
    }
  }

  return (
    <section className="panel">
      <div className="catalog-head">
        <h1>证书</h1>
        <button
          type="button"
          className="secondary tiny"
          onClick={startCreate}
          disabled={props.pending || !props.domainId}
        >
          新建
        </button>
      </div>
      {!props.domainId ? <p className="muted">先选择一个领域。</p> : null}
      {props.domainId && props.items.length === 0 ? (
        <p className="muted">这个领域还没有证书。</p>
      ) : null}
      {props.items.map((item) => (
        <div key={item.id} className={item.id === props.selectedId ? 'entity selected' : 'entity'}>
          <button type="button" className="entity-title" onClick={() => props.onSelect(item.id)}>
            <strong>{item.name}</strong>
            <span className={item.status === 'online' ? 'tag' : 'tag off'}>
              {statusLabel(item.status)}
            </span>
          </button>
          <p className="hint">
            {item.code} · 总分 {item.totalScore}
            {item.passScore === null ? '' : ` · 及格 ${item.passScore}`}
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
                    `下架「${item.name}」后，已有刷题包只能删除，不能改名、换知识点或开始刷题。`,
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
                  !window.confirm(
                    `删除证书「${item.name}」？仍被刷题包、错题或课件引用时会失败，请改为下架。`,
                  )
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
          <h2>{draft.id ? '编辑证书' : '新建证书'}</h2>
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
            label="总分"
            value={draft.totalScore}
            required
            onChange={(totalScore) => setDraft({ ...draft, totalScore })}
          />
          <Field
            label="及格分（可空）"
            value={draft.passScore}
            onChange={(passScore) => setDraft({ ...draft, passScore })}
          />
          <AreaField
            label="额外约束（可空）"
            value={draft.extraConstraint}
            onChange={(extraConstraint) => setDraft({ ...draft, extraConstraint })}
          />
          <Field
            label="排序"
            value={draft.sortOrder}
            onChange={(sortOrder) => setDraft({ ...draft, sortOrder })}
          />
          <StatusField value={draft.status} onChange={(status) => setDraft({ ...draft, status })} />
          <div className="check-row">
            {QUIZ_TYPES.map((type) => (
              <label key={type}>
                <input
                  type="checkbox"
                  checked={draft.types.includes(type)}
                  onChange={() => {
                    const types = draft.types.includes(type)
                      ? draft.types.filter((item) => item !== type)
                      : [...draft.types, type];
                    setDraft({ ...draft, types });
                  }}
                />
                {QUIZ_TYPE_LABELS[type]}
              </label>
            ))}
          </div>
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

function isQuizType(value: string): value is QuizTypeCode {
  return (QUIZ_TYPES as readonly string[]).includes(value);
}

function numberOrZero(value: string): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}
