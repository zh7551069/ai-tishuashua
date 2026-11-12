import type { QuestionTypeView } from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { useAdminAction } from '../content/use-admin-action';
import { createQuestionType, listQuestionTypes, updateQuestionType } from '../generation-config-api';

interface Draft {
  code: string;
  name: string;
  appRendererKey: string;
  gradingRuleBrief: string;
  sortOrder: string;
  enabled: boolean;
}

const EMPTY: Draft = {
  code: '',
  name: '',
  appRendererKey: 'single',
  gradingRuleBrief: '',
  sortOrder: '0',
  enabled: false,
};

export function QuestionTypesPage() {
  const { token, pending, error, setError, run } = useAdminAction();
  const [items, setItems] = useState<QuestionTypeView[]>([]);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [notice, setNotice] = useState('');

  async function reload(): Promise<void> {
    const result = await listQuestionTypes(token);
    setItems(result.items);
  }

  useEffect(() => {
    let cancelled = false;
    listQuestionTypes(token)
      .then((result) => {
        if (!cancelled) {
          setItems(result.items);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '题型加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setError, token]);

  const visible = items.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (!needle) {
      return true;
    }
    return item.code.includes(needle) || item.name.toLowerCase().includes(needle);
  });

  return (
    <section className="page gc-page">
      <header className="gc-head">
        <div>
          <p className="gc-crumb">出题配置 / 题型管理</p>
          <h1>题型管理</h1>
        </div>
      </header>
      <div className="gc-filters">
        <label>
          搜索
          <input
            className="search"
            value={query}
            placeholder="搜索题型 code"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <form
        className="gc-filters"
        onSubmit={(event) => {
          event.preventDefault();
          setNotice('');
          void run(async () => {
            await createQuestionType(token, {
              code: draft.code.trim(),
              name: draft.name.trim(),
              optionStructure: { selection: draft.appRendererKey },
              appRendererKey: draft.appRendererKey.trim(),
              gradingRuleBrief: draft.gradingRuleBrief.trim(),
              sortOrder: Number(draft.sortOrder),
              enabled: draft.enabled,
            });
            setDraft(EMPTY);
            await reload();
            setNotice('题型已登记。');
          });
        }}
      >
        <label>
          新 code
          <input value={draft.code} onChange={(event) => setDraft({ ...draft, code: event.target.value })} />
        </label>
        <label>
          名称
          <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </label>
        <label>
          Renderer
          <input
            value={draft.appRendererKey}
            onChange={(event) => setDraft({ ...draft, appRendererKey: event.target.value })}
          />
        </label>
        <label>
          判分说明
          <input
            value={draft.gradingRuleBrief}
            onChange={(event) => setDraft({ ...draft, gradingRuleBrief: event.target.value })}
          />
        </label>
        <button type="submit" disabled={pending}>
          登记新题型
        </button>
      </form>
      {error ? <p className="gc-error">{error}</p> : null}
      {notice ? <p className="gc-note">{notice}</p> : null}
      <div className="table-card">
        <table className="grid">
          <thead>
            <tr>
              <th>Code</th>
              <th>名称</th>
              <th>Renderer</th>
              <th>Enabled</th>
              <th>排序</th>
              <th>判分说明</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((item) => (
              <TypeRow
                key={item.code}
                item={item}
                pending={pending}
                onSave={(body) => {
                  setNotice('');
                  void run(async () => {
                    await updateQuestionType(token, item.code, body);
                    await reload();
                    setNotice(`${item.code} 已保存。`);
                  });
                }}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="gc-foot">规则：code 创建后不可改；无对应 App renderer 发版前不可 enabled=true。</p>
    </section>
  );
}

function TypeRow(props: {
  item: QuestionTypeView;
  pending: boolean;
  onSave: (body: {
    name: string;
    enabled: boolean;
    sortOrder: number;
    gradingRuleBrief: string;
  }) => void;
}) {
  const [name, setName] = useState(props.item.name);
  const [enabled, setEnabled] = useState(props.item.enabled);
  const [sortOrder, setSortOrder] = useState(String(props.item.sortOrder));
  const [brief, setBrief] = useState(props.item.gradingRuleBrief);

  useEffect(() => {
    setName(props.item.name);
    setEnabled(props.item.enabled);
    setSortOrder(String(props.item.sortOrder));
    setBrief(props.item.gradingRuleBrief);
  }, [props.item]);

  return (
    <tr>
      <td className="mono">
        {props.item.code}
        <div className="gc-foot">{props.item.rendererSupported ? '本期内置' : '须 App 发版后才可 enabled'}</div>
      </td>
      <td>
        <input value={name} onChange={(event) => setName(event.target.value)} />
      </td>
      <td className="mono">{props.item.appRendererKey}</td>
      <td>
        <label className="gc-check">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!props.item.rendererSupported && !enabled}
            onChange={(event) => setEnabled(event.target.checked)}
          />
          {enabled ? 'true' : 'false'}
        </label>
      </td>
      <td>
        <input value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} />
      </td>
      <td>
        <input value={brief} onChange={(event) => setBrief(event.target.value)} />
      </td>
      <td>
        <button
          type="button"
          className="secondary"
          disabled={props.pending}
          onClick={() =>
            props.onSave({
              name: name.trim(),
              enabled,
              sortOrder: Number(sortOrder),
              gradingRuleBrief: brief.trim(),
            })
          }
        >
          保存
        </button>
      </td>
    </tr>
  );
}
