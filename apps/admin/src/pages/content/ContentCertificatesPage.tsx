import {
  CATALOG_EXTRA_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  CATALOG_SCORE_MAX,
  QUIZ_TYPE_LABELS,
  QUIZ_TYPES,
  type AdminCertificate,
  type AdminDomain,
  type PublishStatus,
  type QuizTypeCode,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { createCertificate, deleteCertificate, listCertificates, listDomains, updateCertificate } from '../../catalog-api';
import { ConfirmDialog, Drawer } from '../../content/Drawer';
import {
  CLOSED_EDITOR,
  createEditor,
  editEditor,
  matchesQuery,
  matchesStatus,
} from '../../content/drawer-state';
import { normalizeCode, normalizeName, parseScore, parseSortOrder } from '../../content/form';
import { useAdminAction } from '../../content/use-admin-action';
import { useEditorParams } from '../../content/use-editor-params';

interface CertRow {
  certificate: AdminCertificate;
  domainName: string;
}

interface Draft {
  domainId: string;
  code: string;
  name: string;
  status: PublishStatus;
  totalScore: string;
  passScore: string;
  extraConstraint: string;
  sortOrder: string;
  types: string[];
}

export function ContentCertificatesPage() {
  const { token, pending, error, report, run } = useAdminAction();
  const { editor, list, confirmId, setEditor, setList, setConfirm } = useEditorParams();
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [rows, setRows] = useState<CertRow[]>([]);
  const [ready, setReady] = useState(false);
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [seeded, setSeeded] = useState('');
  const [formError, setFormError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then(async (result) => {
        const groups = await Promise.all(
          result.items.map(async (domain) => {
            const listResult = await listCertificates(token, domain.id);
            return listResult.items.map((certificate) => ({
              certificate,
              domainName: domain.name,
            }));
          }),
        );
        if (!cancelled) {
          setDomains(result.items);
          setRows(groups.flat());
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

  const editorKey = `${editor.mode}:${editor.id ?? ''}:${editor.copyFromId ?? ''}`;
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
    if (editor.mode === 'edit') {
      const row = rows.find((item) => item.certificate.id === editor.id);
      if (!row) {
        return;
      }
      setDraft(draftFromRow(row));
      setSeeded(editorKey);
      setFormError('');
      return;
    }
    if (editor.copyFromId) {
      const source = rows.find((item) => item.certificate.id === editor.copyFromId);
      if (!source) {
        return;
      }
      setDraft(draftFromCopy(source));
      setSeeded(editorKey);
      setFormError('');
      return;
    }
    setDraft(emptyDraft(domains[0]?.id ?? ''));
    setSeeded(editorKey);
    setFormError('');
  }, [domains, draft, editor.copyFromId, editor.id, editor.mode, editorKey, rows, seeded]);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (event.key !== 'Escape') {
        return;
      }
      if (confirmId || deleteId) {
        setConfirm(null);
        setDeleteId(null);
        return;
      }
      if (editor.mode !== 'closed') {
        setEditor(CLOSED_EDITOR);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirmId, deleteId, editor.mode, setConfirm, setEditor]);

  const visible = rows.filter(
    (row) =>
      matchesStatus(row.certificate.status, list.status) &&
      matchesQuery(`${row.certificate.name} ${row.certificate.code} ${row.domainName}`, list.q),
  );
  const confirming = rows.find((row) => row.certificate.id === confirmId) ?? null;
  const deleting = rows.find((row) => row.certificate.id === deleteId) ?? null;
  const editing = rows.find((row) => row.certificate.id === editor.id) ?? null;

  async function save(): Promise<void> {
    if (!draft) {
      return;
    }
    const code = normalizeCode(draft.code);
    const name = normalizeName(draft.name);
    const sortOrder = parseSortOrder(draft.sortOrder);
    const totalScore = parseScore(draft.totalScore, false);
    const passScore = parseScore(draft.passScore, true);
    if (!draft.domainId) {
      setFormError('先选择领域');
      return;
    }
    if (!code) {
      setFormError('编码只能用小写字母、数字和连字符');
      return;
    }
    if (!name) {
      setFormError('名称不能为空');
      return;
    }
    if (typeof totalScore !== 'number' || totalScore < 1 || totalScore > CATALOG_SCORE_MAX) {
      setFormError('总分需要是 1 到 1000 的整数');
      return;
    }
    if (passScore === undefined || (passScore !== null && passScore > CATALOG_SCORE_MAX)) {
      setFormError('及格线留空，或填 0 到 1000 的整数');
      return;
    }
    if (passScore !== null && passScore > totalScore) {
      setFormError('及格线不能大于总分');
      return;
    }
    if (draft.types.length === 0) {
      setFormError('至少选择 1 个题型才能保存');
      return;
    }
    if (sortOrder === null) {
      setFormError('排序需要是 0 到 10000 的整数');
      return;
    }
    const extra = draft.extraConstraint.trim();
    if (extra.length > CATALOG_EXTRA_MAX_LENGTH) {
      setFormError('附加约束不能超过 500 字');
      return;
    }
    setFormError('');
    const body = {
      code,
      name,
      status: draft.status,
      totalScore,
      passScore,
      extraConstraint: extra ? extra : null,
      sortOrder,
      enabledQuestionTypeCodes: draft.types,
    };
    const ok = await run(async () => {
      if (editor.mode === 'edit' && editor.id) {
        await updateCertificate(token, editor.id, body);
      } else {
        await createCertificate(token, draft.domainId, body);
      }
    });
    if (ok) {
      setReload((value) => value + 1);
      setEditor(CLOSED_EDITOR);
    }
  }

  async function setStatus(id: string, status: PublishStatus): Promise<void> {
    const ok = await run(async () => {
      await updateCertificate(token, id, { status });
    });
    if (!ok) {
      return;
    }
    setConfirm(null);
    setDraft((current) => (current && editor.id === id ? { ...current, status } : current));
    setReload((value) => value + 1);
  }

  return (
    <section className="page">
      <h1>证书</h1>
      <div className="toolbar">
        <input
          className="search"
          placeholder="搜索证书 / 领域"
          value={list.q}
          onChange={(event) => setList(event.target.value, list.status)}
        />
        <div className="seg" role="group" aria-label="上下架筛选">
          <FilterButton current={list.status} value="all" label="全部" onPick={(status) => setList(list.q, status)} />
          <FilterButton current={list.status} value="online" label="上架" onPick={(status) => setList(list.q, status)} />
          <FilterButton current={list.status} value="offline" label="下架" onPick={(status) => setList(list.q, status)} />
        </div>
        <div className="toolbar-end">
          <button
            type="button"
            className="secondary"
            disabled={pending || rows.length === 0}
            onClick={() => setEditor(createEditor())}
          >
            一键复制
          </button>
          <button type="button" disabled={pending || domains.length === 0} onClick={() => setEditor(createEditor())}>
            新建证书
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
              <th>证书</th>
              <th>领域</th>
              <th>总分</th>
              <th>及格线</th>
              <th>题型</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {!ready ? (
              <tr>
                <td colSpan={7}>正在读取证书…</td>
              </tr>
            ) : null}
            {ready && visible.length === 0 ? (
              <tr>
                <td colSpan={7}>没有符合条件的证书。这不是「证书与成绩」。</td>
              </tr>
            ) : null}
            {visible.map((row) => (
              <tr key={row.certificate.id}>
                <td>{row.certificate.name}</td>
                <td>{row.domainName}</td>
                <td>{row.certificate.totalScore}</td>
                <td>
                  {row.certificate.passScore === null ? (
                    <span className="pass-empty">
                      — <span className="pill warn">默认60</span>
                    </span>
                  ) : (
                    row.certificate.passScore
                  )}
                </td>
                <td>{typeLabels(row.certificate.enabledQuestionTypeCodes)}</td>
                <td>
                  <span className={row.certificate.status === 'online' ? 'pill' : 'pill off'}>
                    {row.certificate.status === 'online' ? '上架' : '下架'}
                  </span>
                </td>
                <td className="ops">
                  <button type="button" className="link" onClick={() => setEditor(editEditor(row.certificate.id))}>
                    编辑
                  </button>
                  <span className="op-sep">·</span>
                  {row.certificate.status === 'online' ? (
                    <button type="button" className="link" onClick={() => setConfirm(row.certificate.id)}>
                      下架
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="link"
                      disabled={pending}
                      onClick={() => void setStatus(row.certificate.id, 'online')}
                    >
                      上架
                    </button>
                  )}
                  <span className="op-sep">·</span>
                  <button
                    type="button"
                    className="link"
                    onClick={() => setEditor(createEditor(row.certificate.id))}
                  >
                    复制
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Drawer
        open={editor.mode !== 'closed'}
        scrim="strong"
        title={editor.mode === 'edit' ? '编辑证书' : '新建证书'}
        onClose={() => setEditor(CLOSED_EDITOR)}
      >
        {editor.mode === 'edit' && !draft ? <p className="muted">找不到这张证书。</p> : null}
        {draft ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            {editor.mode === 'create' && !editor.copyFromId ? (
              <label>
                从已有证书带入
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value) {
                      setEditor(createEditor(event.target.value));
                    }
                  }}
                >
                  <option value="">不复制，空白新建</option>
                  {rows.map((row) => (
                    <option key={row.certificate.id} value={row.certificate.id}>
                      {row.domainName} / {row.certificate.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {editor.copyFromId ? (
              <p className="hint">已带入及格线、总分、题型和附加约束。副本默认下架，编码请另起。</p>
            ) : null}
            <label>
              证书名称
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
            <label>
              所属领域
              {editor.mode === 'edit' ? (
                <input value={editing?.domainName ?? ''} readOnly />
              ) : (
                <select
                  value={draft.domainId}
                  onChange={(event) => setDraft({ ...draft, domainId: event.target.value })}
                >
                  {domains.map((domain) => (
                    <option key={domain.id} value={domain.id}>
                      {domain.name}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <label>
              总分 totalScore
              <input
                value={draft.totalScore}
                required
                onChange={(event) => setDraft({ ...draft, totalScore: event.target.value })}
              />
            </label>
            <label>
              及格线 passScore
              <input
                value={draft.passScore}
                placeholder="可空；空则 App 默认 60"
                onChange={(event) => setDraft({ ...draft, passScore: event.target.value })}
              />
            </label>
            <fieldset className="type-set">
              <legend>启用题型（至少 1 个方可上架）</legend>
              {QUIZ_TYPES.map((type) => (
                <label key={type}>
                  <input
                    type="checkbox"
                    checked={draft.types.includes(type)}
                    onChange={() => setDraft({ ...draft, types: toggleType(draft.types, type) })}
                  />
                  {type} {QUIZ_TYPE_LABELS[type]}
                </label>
              ))}
            </fieldset>
            <label>
              附加约束 extraConstraint
              <textarea
                value={draft.extraConstraint}
                onChange={(event) => setDraft({ ...draft, extraConstraint: event.target.value })}
              />
            </label>
            <p className="hint">选配；注入出题 Prompt</p>
            <label>
              sortOrder
              <input
                value={draft.sortOrder}
                onChange={(event) => setDraft({ ...draft, sortOrder: event.target.value })}
              />
            </label>
            <p className={draft.status === 'online' ? 'status-line on' : 'status-line'}>
              状态：{draft.status === 'online' ? '上架' : '下架'}
              {editor.mode === 'edit' ? ' · 可一键复制' : ''}
            </p>
            {formError ? (
              <p className="form-error" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="drawer-actions">
              <button type="submit" disabled={pending}>
                保存
              </button>
              {editor.mode === 'edit' && editor.id && draft.status === 'online' ? (
                <button type="button" className="danger" onClick={() => setConfirm(editor.id)}>
                  下架
                </button>
              ) : null}
              {editor.mode === 'edit' && editor.id && draft.status === 'offline' ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={pending}
                  onClick={() => void setStatus(editor.id as string, 'online')}
                >
                  上架
                </button>
              ) : null}
              {editor.mode === 'edit' && editor.id ? (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setEditor(createEditor(editor.id))}
                >
                  复制配置
                </button>
              ) : null}
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
        open={Boolean(confirming)}
        title="确认下架该证书？"
        body="下架后：App 端不可再选该证书新建刷题包；已有包将置灰「不可用」，仅可删除、不可继续出题。"
        note="对齐 App：包卡「不可用」· 开始刷题灰显 · 只删不改"
        confirmLabel="确认下架"
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          if (confirming) {
            void setStatus(confirming.certificate.id, 'offline');
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="确认删除该证书？"
        body={
          deleting
            ? `删除「${deleting.certificate.name}」。仍被刷题包、错题或课件引用时会失败，请改为下架。`
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
            await deleteCertificate(token, deleting.certificate.id);
          }).then((ok) => {
            if (ok) {
              setDeleteId(null);
              if (editor.id === deleting.certificate.id) {
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

function emptyDraft(domainId: string): Draft {
  return {
    domainId,
    code: '',
    name: '',
    status: 'online',
    totalScore: '100',
    passScore: '60',
    extraConstraint: '',
    sortOrder: '0',
    types: [...QUIZ_TYPES],
  };
}

function draftFromRow(row: CertRow): Draft {
  return {
    domainId: row.certificate.domainId,
    code: row.certificate.code,
    name: row.certificate.name,
    status: row.certificate.status,
    totalScore: String(row.certificate.totalScore),
    passScore: row.certificate.passScore === null ? '' : String(row.certificate.passScore),
    extraConstraint: row.certificate.extraConstraint ?? '',
    sortOrder: String(row.certificate.sortOrder),
    types: [...row.certificate.enabledQuestionTypeCodes],
  };
}

function draftFromCopy(row: CertRow): Draft {
  const base = draftFromRow(row);
  const copyCode = `${row.certificate.code}-copy`;
  return {
    ...base,
    code: normalizeCode(copyCode) ? copyCode : '',
    name: clip(`${row.certificate.name} 副本`, CATALOG_NAME_MAX_LENGTH),
    status: 'offline',
  };
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function toggleType(types: string[], code: QuizTypeCode): string[] {
  return types.includes(code) ? types.filter((item) => item !== code) : [...types, code];
}

function typeLabels(codes: string[]): string {
  if (codes.length === 0) {
    return '—';
  }
  return codes
    .map((code) => (isQuizType(code) ? QUIZ_TYPE_LABELS[code] : code))
    .join('/');
}

function isQuizType(value: string): value is QuizTypeCode {
  return (QUIZ_TYPES as readonly string[]).includes(value);
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
