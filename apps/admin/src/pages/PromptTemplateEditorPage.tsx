import {
  STANDARD_PROMPT_VARIABLES,
  VARIANT_PROMPT_VARIABLES,
  type AdminCertificate,
  type AdminDomain,
  type PromptScope,
  type PromptTemplateDetail,
} from '@tishuashua/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listCertificates, listDomains } from '../catalog-api';
import { useAdminAction } from '../content/use-admin-action';
import {
  createPromptTemplate,
  getPromptTemplate,
  lockPromptTemplate,
  publishPromptTemplate,
  savePromptTemplate,
} from '../generation-config-api';

interface FormState {
  name: string;
  code: string;
  scope: PromptScope;
  scopeRefId: string;
  systemPrompt: string;
  userPromptTemplate: string;
  variantSystem: string;
  variantUser: string;
}

const EMPTY: FormState = {
  name: '',
  code: '',
  scope: 'global',
  scopeRefId: '',
  systemPrompt: '',
  userPromptTemplate: '',
  variantSystem: '',
  variantUser: '',
};

export function PromptTemplateEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { token, pending, error, setError, run } = useAdminAction();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [detail, setDetail] = useState<PromptTemplateDetail | null>(null);
  const [domains, setDomains] = useState<AdminDomain[]>([]);
  const [certificates, setCertificates] = useState<Array<AdminCertificate & { domainName: string }>>([]);
  const [notice, setNotice] = useState('');
  const creating = !id;

  useEffect(() => {
    let cancelled = false;
    listDomains(token)
      .then(async (result) => {
        const groups = await Promise.all(
          result.items.map(async (domain) => {
            const list = await listCertificates(token, domain.id);
            return list.items.map((item) => ({ ...item, domainName: domain.name }));
          }),
        );
        if (!cancelled) {
          setDomains(result.items);
          setCertificates(groups.flat());
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '目录加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [setError, token]);

  useEffect(() => {
    if (!id) {
      return;
    }
    let cancelled = false;
    getPromptTemplate(token, id)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setForm(formFrom(result));
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : '模板加载失败');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id, setError, token]);

  const locked = Boolean(detail?.locked);
  const published = detail?.currentPublishedVersion !== null && detail?.currentPublishedVersion !== undefined;

  function patch(partial: Partial<FormState>): void {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function save(): Promise<void> {
    setNotice('');
    const ok = await run(async () => {
      if (creating) {
        const created = await createPromptTemplate(token, payload(form));
        navigate(`/config/prompts/${created.id}`, { replace: true });
        return;
      }
      if (!id) {
        return;
      }
      const saved = await savePromptTemplate(token, id, payload(form, false));
      setDetail(saved);
      setForm(formFrom(saved));
      setNotice('草稿已保存。出题仍使用当前已发布快照，直到再次发布。');
    });
    if (!ok) {
      return;
    }
  }

  async function publish(): Promise<void> {
    setNotice('');
    await run(async () => {
      let templateId = id;
      if (!templateId) {
        const created = await createPromptTemplate(token, payload(form));
        templateId = created.id;
        navigate(`/config/prompts/${templateId}`, { replace: true });
      } else {
        await savePromptTemplate(token, templateId, payload(form, false));
      }
      const result = await publishPromptTemplate(token, templateId);
      const fresh = await getPromptTemplate(token, templateId);
      setDetail(fresh);
      setForm(formFrom(fresh));
      setNotice(
        result.warnings.length > 0
          ? `已发布 v${result.version}。${result.warnings.join(' ')}`
          : `已发布 v${result.version}。出题会读这一版快照。`,
      );
    });
  }

  async function toggleLock(): Promise<void> {
    if (!id) {
      return;
    }
    setNotice('');
    await run(async () => {
      const saved = await lockPromptTemplate(token, id, !locked);
      setDetail(saved);
      setNotice(saved.locked ? '模板已锁定。' : '模板已解锁。');
    });
  }

  return (
    <section className="page gc-page">
      <header className="gc-head">
        <div>
          <p className="gc-crumb">
            出题配置 / Prompt 模板{detail ? ` / ${detail.code}` : ' / 新建'}
            {locked ? ' / 已锁定' : ''}
          </p>
          <h1>编辑 Prompt 模板</h1>
        </div>
        <div className="gc-actions">
          <button type="button" className="gc-muted" disabled>
            试出题（下版）
          </button>
          <button type="button" className="secondary gc-muted" disabled={locked || pending} onClick={() => void save()}>
            保存草稿
          </button>
          <button type="button" className="gc-muted" disabled={locked || pending} onClick={() => void publish()}>
            发布
          </button>
          {id ? (
            <button type="button" disabled={pending} onClick={() => void toggleLock()}>
              {locked ? '解锁' : '锁定'}
            </button>
          ) : null}
        </div>
      </header>
      {locked ? (
        <p className="gc-lock">模板已锁定。不能保存草稿、发布或回滚；须先解锁。</p>
      ) : null}
      <p className="gc-status">
        {detail ? `${detail.status} / ${detail.locked ? '已锁定' : '未锁定'}` : 'draft / 未锁定'}
        {detail?.currentPublishedVersion ? ` · 当前已发布 v${detail.currentPublishedVersion}` : ''}
        {detail?.hasDirtyDraft && detail.status === 'published' ? ' · 工作草稿尚未发布' : ''}
      </p>
      {error ? <p className="gc-error">{error}</p> : null}
      {notice ? <p className="gc-note">{notice}</p> : null}
      <div className="gc-split">
        <form
          className="card-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label>
            名称
            <input value={form.name} disabled={locked} onChange={(event) => patch({ name: event.target.value })} />
          </label>
          <label>
            Code
            <input
              value={form.code}
              disabled={!creating || locked}
              onChange={(event) => patch({ code: event.target.value })}
            />
          </label>
          <label>
            Scope
            <select
              value={form.scope}
              disabled={locked || published}
              onChange={(event) => patch({ scope: event.target.value as PromptScope, scopeRefId: '' })}
            >
              <option value="global">global</option>
              <option value="domain">domain</option>
              <option value="certificate">certificate</option>
            </select>
          </label>
          {form.scope === 'domain' ? (
            <label>
              领域
              <select
                value={form.scopeRefId}
                disabled={locked || published}
                onChange={(event) => patch({ scopeRefId: event.target.value })}
              >
                <option value="">选择领域</option>
                {domains.map((domain) => (
                  <option key={domain.id} value={domain.id}>
                    {domain.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {form.scope === 'certificate' ? (
            <label>
              证书
              <select
                value={form.scopeRefId}
                disabled={locked || published}
                onChange={(event) => patch({ scopeRefId: event.target.value })}
              >
                <option value="">选择证书</option>
                {certificates.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.domainName} / {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            systemPrompt
            <textarea
              value={form.systemPrompt}
              disabled={locked}
              onChange={(event) => patch({ systemPrompt: event.target.value })}
            />
          </label>
          <label>
            userPromptTemplate
            <textarea
              className="gc-tall"
              value={form.userPromptTemplate}
              disabled={locked}
              onChange={(event) => patch({ userPromptTemplate: event.target.value })}
            />
          </label>
          <p className="gc-foot">变量高亮示意：{highlight(form.userPromptTemplate)}</p>
          <label>
            变异 system（可选）
            <textarea
              value={form.variantSystem}
              disabled={locked}
              onChange={(event) => patch({ variantSystem: event.target.value })}
            />
          </label>
          <label>
            变异 user（可选）
            <textarea
              value={form.variantUser}
              disabled={locked}
              onChange={(event) => patch({ variantUser: event.target.value })}
            />
          </label>
        </form>
        <aside className="card-panel">
          <h2>可用变量</h2>
          <p className="gc-foot">现网可注入（标准 8 个）</p>
          <div>
            {STANDARD_PROMPT_VARIABLES.map((name) => (
              <span key={name} className="gc-var">{`{{${name}}}`}</span>
            ))}
          </div>
          <p className="gc-foot">变异段另 3 个（仅当该模板含 variant 时可注入）</p>
          <div>
            {VARIANT_PROMPT_VARIABLES.map((name) => (
              <span key={name} className="gc-var">{`{{${name}}}`}</span>
            ))}
          </div>
          <p className="gc-foot">仅 published 被出题消费。试出题工具标注「下版」，不阻塞发布。</p>
          {id ? (
            <p>
              <Link to={`/config/prompts/${id}/versions`}>版本列表</Link>
            </p>
          ) : null}
          <p>
            <Link to="/config/prompts">返回列表</Link>
          </p>
        </aside>
      </div>
    </section>
  );
}

function formFrom(detail: PromptTemplateDetail): FormState {
  return {
    name: detail.name,
    code: detail.code,
    scope: detail.scope,
    scopeRefId: detail.scopeRefId ?? '',
    systemPrompt: detail.systemPrompt,
    userPromptTemplate: detail.userPromptTemplate,
    variantSystem: detail.variantPrompt?.system ?? '',
    variantUser: detail.variantPrompt?.user ?? '',
  };
}

function payload(form: FormState, includeIdentity = true): Record<string, unknown> {
  const variant =
    form.variantSystem.trim() || form.variantUser.trim()
      ? { system: form.variantSystem, user: form.variantUser }
      : null;
  const variables = [
    ...STANDARD_PROMPT_VARIABLES,
    ...(variant ? VARIANT_PROMPT_VARIABLES : []),
  ];
  const body: Record<string, unknown> = {
    name: form.name.trim(),
    systemPrompt: form.systemPrompt,
    userPromptTemplate: form.userPromptTemplate,
    variantPrompt: variant,
    variables,
  };
  if (includeIdentity) {
    body.code = form.code.trim();
    body.scope = form.scope;
    body.scopeRefId = form.scope === 'global' ? null : form.scopeRefId;
  }
  return body;
}

function highlight(text: string): string {
  if (!text.trim()) {
    return '还没有用户提示词';
  }
  return text.length > 180 ? `${text.slice(0, 180)}…` : text;
}
