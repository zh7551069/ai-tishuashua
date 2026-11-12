import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import {
  normalizePromptTemplates,
  parsePromptCreate,
  parsePromptUpdate,
  parseRollbackVersion,
  promptDigest,
  promptExcerpt,
  templatesToJson,
  validatePromptPublish,
  type PromptPublishResult,
  type PromptScope,
  type PromptTemplateDetail,
  type PromptTemplateList,
  type PromptTemplateStats,
  type PromptVersionList,
} from '@tishuashua/shared';
import type { PoolClient } from 'pg';
import {
  GenerationConfigNotFoundError,
  GenerationConfigValidationError,
} from './generation-config.errors';
import { GenerationConfigStore } from './generation-config.store';
import type { PromptListQuery } from './prompt-templates.query';

interface TemplateRow {
  id: string;
  code: string;
  name: string;
  scope: PromptScope;
  scope_ref_id: string | null;
  status: 'draft' | 'published';
  version: number;
  locked: boolean;
  templates: unknown;
  variables: unknown;
  current_published_version: number | null;
  updated_at: Date | string;
  updated_by: string | null;
  has_dirty_draft: boolean;
}

const DIRTY_SQL = `
  (
    template.current_published_version IS NULL
    OR snapshot.id IS NULL
    OR template.templates IS DISTINCT FROM snapshot.templates
    OR template.variables IS DISTINCT FROM snapshot.variables
  )
`;

@Injectable()
export class PromptTemplateService {
  constructor(@Inject(GenerationConfigStore) private readonly store: GenerationConfigStore) {}

  async list(query: PromptListQuery): Promise<PromptTemplateList> {
    const pattern = query.q ? likePattern(query.q) : null;
    const params = [query.scope, query.status, pattern];
    const where = filterSql();
    const total = await this.store.pool().query<{ total: number }>(
      `SELECT count(*)::int AS total FROM prompt_templates AS template WHERE ${where}`,
      params,
    );
    const rows = await this.store.pool().query<TemplateRow>(
      `
        SELECT
          template.id, template.code, template.name, template.scope, template.scope_ref_id,
          template.status, template.version, template.locked, template.updated_at,
          ${DIRTY_SQL} AS has_dirty_draft
        FROM prompt_templates AS template
        LEFT JOIN prompt_template_versions AS snapshot
          ON snapshot.template_id = template.id
         AND snapshot.version = template.current_published_version
        WHERE ${where}
        ORDER BY template.updated_at DESC, template.code ASC
        LIMIT $4 OFFSET $5
      `,
      [...params, query.pageSize, (query.page - 1) * query.pageSize],
    );
    return {
      items: rows.rows.map(toSummary),
      total: total.rows[0]?.total ?? 0,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async stats(): Promise<PromptTemplateStats> {
    const result = await this.store.pool().query<{
      never_published_count: number;
      dirty_draft_count: number;
      published_count: number;
      pending_draft_count: number;
    }>(
      `
        SELECT
          count(*) FILTER (WHERE template.current_published_version IS NULL)::int AS never_published_count,
          count(*) FILTER (WHERE template.status = 'published')::int AS published_count,
          count(*) FILTER (
            WHERE template.current_published_version IS NOT NULL AND ${DIRTY_SQL}
          )::int AS dirty_draft_count,
          count(*) FILTER (WHERE ${DIRTY_SQL})::int AS pending_draft_count
        FROM prompt_templates AS template
        LEFT JOIN prompt_template_versions AS snapshot
          ON snapshot.template_id = template.id
         AND snapshot.version = template.current_published_version
      `,
    );
    const row = result.rows[0];
    return {
      neverPublishedCount: row?.never_published_count ?? 0,
      dirtyDraftCount: row?.dirty_draft_count ?? 0,
      publishedCount: row?.published_count ?? 0,
      pendingDraftCount: row?.pending_draft_count ?? 0,
    };
  }

  async get(id: string): Promise<PromptTemplateDetail> {
    const row = await this.findDetail(id);
    if (!row) {
      throw new GenerationConfigNotFoundError('模板不存在');
    }
    return toDetail(row);
  }

  async versions(id: string, includeBody: boolean): Promise<PromptVersionList> {
    const current = await this.store.pool().query<{ current_published_version: number | null }>(
      `SELECT current_published_version FROM prompt_templates WHERE id = $1`,
      [id],
    );
    if (!current.rowCount) {
      throw new GenerationConfigNotFoundError('模板不存在');
    }
    const published = current.rows[0]?.current_published_version ?? null;
    const rows = await this.store.pool().query<{
      version: number;
      published_at: Date | string;
      published_by: string;
      templates: unknown;
      variables: unknown;
    }>(
      `
        SELECT version, published_at, published_by, templates, variables
        FROM prompt_template_versions
        WHERE template_id = $1
        ORDER BY version DESC
      `,
      [id],
    );
    return {
      items: rows.rows.map((row) => ({
        version: Number(row.version),
        publishedAt: iso(row.published_at),
        publishedBy: row.published_by,
        current: published !== null && Number(row.version) === Number(published),
        ...(includeBody ? bodyOf(row.templates, row.variables) : {}),
      })),
    };
  }

  async create(body: unknown, actor: string): Promise<PromptTemplateDetail> {
    const parsed = parsePromptCreate(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const input = parsed.value;
    const id = randomUUID();
    return this.store.write(async (client) => {
      await assertScopeRef(client, input.scope, input.scopeRefId);
      await client.query(
        `
          INSERT INTO prompt_templates (
            id, scope, scope_ref_id, templates, variables, version, status,
            name, code, locked, current_published_version, updated_by
          )
          VALUES (
            $1, $2, $3, $4::jsonb, $5::jsonb, 0, 'draft',
            $6, $7, false, NULL, $8
          )
        `,
        [
          id,
          input.scope,
          input.scopeRefId,
          JSON.stringify(templatesToJson(input.templates)),
          JSON.stringify(input.variables),
          input.name,
          input.code,
          actor,
        ],
      );
      await this.store.audit(client, {
        actor,
        action: 'prompt.create',
        target: `prompt:${input.code}`,
        before: null,
        after: {
          id,
          code: input.code,
          name: input.name,
          scope: input.scope,
          scopeRefId: input.scopeRefId,
        },
      });
      const row = await findDetailOn(client, id);
      if (!row) {
        throw new GenerationConfigNotFoundError('模板不存在');
      }
      return toDetail(row);
    });
  }

  async save(id: string, body: unknown, actor: string): Promise<PromptTemplateDetail> {
    const parsed = parsePromptUpdate(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const input = parsed.value;
    return this.store.write(async (client) => {
      const row = await lockTemplate(client, id);
      if (input.code !== undefined && input.code !== row.code) {
        throw new GenerationConfigValidationError('code 创建后不可改');
      }
      if (row.locked) {
        throw new GenerationConfigValidationError('模板已锁定');
      }
      const next = nextBinding(row, input.scope, input.scopeRefProvided, input.scopeRefId);
      if (row.current_published_version !== null) {
        if (next.scope !== row.scope || next.scopeRefId !== row.scope_ref_id) {
          throw new GenerationConfigValidationError('已发布模板不能改 scope');
        }
      } else {
        await assertScopeRef(client, next.scope, next.scopeRefId);
      }
      const templates = input.templates ?? normalizePromptTemplates(row.templates);
      if (!templates) {
        throw new GenerationConfigValidationError('提示词格式不正确');
      }
      const variables = input.variables ?? readVariables(row.variables);
      await client.query(
        `
          UPDATE prompt_templates
          SET
            name = $2,
            scope = $3,
            scope_ref_id = $4,
            templates = $5::jsonb,
            variables = $6::jsonb,
            updated_by = $7,
            updated_at = now()
          WHERE id = $1
        `,
        [
          id,
          input.name ?? row.name,
          next.scope,
          next.scopeRefId,
          JSON.stringify(templatesToJson(templates)),
          JSON.stringify(variables),
          actor,
        ],
      );
      await this.store.audit(client, {
        actor,
        action: 'prompt.update',
        target: `prompt:${row.code}`,
        before: { name: row.name, version: row.current_published_version, digest: promptDigest(row.templates) },
        after: {
          name: input.name ?? row.name,
          version: row.current_published_version,
          digest: promptDigest(templatesToJson(templates)),
          excerpt: promptExcerpt(templates.user),
        },
      });
      const saved = await findDetailOn(client, id);
      if (!saved) {
        throw new GenerationConfigNotFoundError('模板不存在');
      }
      return toDetail(saved);
    });
  }

  async publish(id: string, actor: string): Promise<PromptPublishResult> {
    return this.store.write(async (client) => {
      const row = await lockTemplate(client, id);
      if (row.locked) {
        throw new GenerationConfigValidationError('模板已锁定');
      }
      const templates = normalizePromptTemplates(row.templates);
      if (!templates) {
        throw new GenerationConfigValidationError('提示词格式不正确');
      }
      const variables = readVariables(row.variables);
      const checked = validatePromptPublish(templates, variables);
      if (!checked.ok) {
        throw new GenerationConfigValidationError(checked.message);
      }
      const version = (await maxVersion(client, id)) + 1;
      const document = templatesToJson(templates);
      await client.query(
        `
          INSERT INTO prompt_template_versions (
            id, template_id, version, templates, variables, published_by
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
        `,
        [randomUUID(), id, version, JSON.stringify(document), JSON.stringify(variables), actor],
      );
      await client.query(
        `
          UPDATE prompt_templates
          SET
            templates = $2::jsonb,
            variables = $3::jsonb,
            status = 'published',
            version = $4,
            current_published_version = $4,
            updated_by = $5,
            updated_at = now()
          WHERE id = $1
        `,
        [id, JSON.stringify(document), JSON.stringify(variables), version, actor],
      );
      await this.store.audit(client, {
        actor,
        action: 'prompt.publish',
        target: `prompt:${row.code}`,
        before: { version: row.current_published_version },
        after: {
          version,
          digest: promptDigest(document),
          excerpt: promptExcerpt(templates.user),
        },
      });
      return {
        id,
        code: row.code,
        version,
        status: 'published',
        warnings: checked.warnings,
      };
    });
  }

  async rollback(id: string, body: unknown, actor: string): Promise<PromptPublishResult> {
    const parsed = parseRollbackVersion(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const sourceVersion = parsed.value;
    return this.store.write(async (client) => {
      const row = await lockTemplate(client, id);
      if (row.locked) {
        throw new GenerationConfigValidationError('模板已锁定');
      }
      const source = await client.query<{ templates: unknown; variables: unknown }>(
        `
          SELECT templates, variables
          FROM prompt_template_versions
          WHERE template_id = $1 AND version = $2
        `,
        [id, sourceVersion],
      );
      const snapshot = source.rows[0];
      if (!snapshot) {
        throw new GenerationConfigNotFoundError('版本不存在');
      }
      const version = (await maxVersion(client, id)) + 1;
      await client.query(
        `
          INSERT INTO prompt_template_versions (
            id, template_id, version, templates, variables, published_by
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)
        `,
        [
          randomUUID(),
          id,
          version,
          JSON.stringify(snapshot.templates),
          JSON.stringify(snapshot.variables),
          actor,
        ],
      );
      await client.query(
        `
          UPDATE prompt_templates
          SET
            templates = $2::jsonb,
            variables = $3::jsonb,
            status = 'published',
            version = $4,
            current_published_version = $4,
            updated_by = $5,
            updated_at = now()
          WHERE id = $1
        `,
        [id, JSON.stringify(snapshot.templates), JSON.stringify(snapshot.variables), version, actor],
      );
      await this.store.audit(client, {
        actor,
        action: 'prompt.rollback',
        target: `prompt:${row.code}`,
        before: { version: row.current_published_version },
        after: { version, rolledBackFrom: sourceVersion },
      });
      return {
        id,
        code: row.code,
        version,
        status: 'published',
        warnings: [],
      };
    });
  }

  async setLocked(id: string, locked: boolean, actor: string): Promise<PromptTemplateDetail> {
    return this.store.write(async (client) => {
      const row = await lockTemplate(client, id);
      await client.query(
        `
          UPDATE prompt_templates
          SET locked = $2, updated_by = $3, updated_at = now()
          WHERE id = $1
        `,
        [id, locked, actor],
      );
      await this.store.audit(client, {
        actor,
        action: locked ? 'prompt.lock' : 'prompt.unlock',
        target: `prompt:${row.code}`,
        before: { locked: row.locked },
        after: { locked },
      });
      const saved = await findDetailOn(client, id);
      if (!saved) {
        throw new GenerationConfigNotFoundError('模板不存在');
      }
      return toDetail(saved);
    });
  }

  private async findDetail(id: string): Promise<TemplateRow | null> {
    const result = await this.store.pool().query<TemplateRow>(detailSql(), [id]);
    return result.rows[0] ?? null;
  }
}

function filterSql(): string {
  return `
    ($1::text IS NULL OR template.scope = $1)
    AND ($2::text IS NULL OR template.status = $2)
    AND (
      $3::text IS NULL
      OR template.name ILIKE $3 ESCAPE '\\'
      OR template.code ILIKE $3 ESCAPE '\\'
    )
  `;
}

function detailSql(): string {
  return `
    SELECT
      template.id, template.code, template.name, template.scope, template.scope_ref_id,
      template.status, template.version, template.locked, template.templates, template.variables,
      template.current_published_version, template.updated_at, template.updated_by,
      ${DIRTY_SQL} AS has_dirty_draft
    FROM prompt_templates AS template
    LEFT JOIN prompt_template_versions AS snapshot
      ON snapshot.template_id = template.id
     AND snapshot.version = template.current_published_version
    WHERE template.id = $1
  `;
}

async function findDetailOn(client: PoolClient, id: string): Promise<TemplateRow | null> {
  const result = await client.query<TemplateRow>(detailSql(), [id]);
  return result.rows[0] ?? null;
}

async function lockTemplate(client: PoolClient, id: string): Promise<TemplateRow> {
  const result = await client.query<TemplateRow>(
    `
      SELECT
        id, code, name, scope, scope_ref_id, status, version, locked,
        templates, variables, current_published_version, updated_at, updated_by,
        false AS has_dirty_draft
      FROM prompt_templates
      WHERE id = $1
      FOR UPDATE
    `,
    [id],
  );
  const row = result.rows[0];
  if (!row) {
    throw new GenerationConfigNotFoundError('模板不存在');
  }
  return row;
}

async function maxVersion(client: PoolClient, id: string): Promise<number> {
  const result = await client.query<{ version: number | null }>(
    `SELECT max(version)::int AS version FROM prompt_template_versions WHERE template_id = $1`,
    [id],
  );
  return Number(result.rows[0]?.version ?? 0);
}

async function assertScopeRef(
  client: PoolClient,
  scope: PromptScope,
  scopeRefId: string | null,
): Promise<void> {
  if (scope === 'global') {
    if (scopeRefId) {
      throw new GenerationConfigValidationError('全局模板不能绑定 scopeRefId');
    }
    return;
  }
  if (!scopeRefId) {
    throw new GenerationConfigValidationError('scopeRefId 不正确');
  }
  const table = scope === 'certificate' ? 'certificates' : 'domains';
  const found = await client.query(`SELECT 1 FROM ${table} WHERE id = $1`, [scopeRefId]);
  if (!found.rowCount) {
    throw new GenerationConfigValidationError('scopeRefId 不存在');
  }
}

function nextBinding(
  row: TemplateRow,
  scope: PromptScope | undefined,
  scopeRefProvided: boolean,
  scopeRefId: string | null | undefined,
): { scope: PromptScope; scopeRefId: string | null } {
  const nextScope = scope ?? row.scope;
  let nextRef = scopeRefProvided ? (scopeRefId ?? null) : row.scope_ref_id;
  if (nextScope === 'global') {
    if (scopeRefProvided && scopeRefId) {
      throw new GenerationConfigValidationError('全局模板不能绑定 scopeRefId');
    }
    nextRef = null;
  } else if (!nextRef) {
    throw new GenerationConfigValidationError('scopeRefId 不正确');
  }
  return { scope: nextScope, scopeRefId: nextRef };
}

function toSummary(row: TemplateRow): PromptTemplateList['items'][number] {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    scope: row.scope,
    scopeRefId: row.scope_ref_id,
    status: row.status,
    version: Number(row.version),
    locked: row.locked,
    updatedAt: iso(row.updated_at),
    hasDirtyDraft: Boolean(row.has_dirty_draft),
  };
}

function toDetail(row: TemplateRow): PromptTemplateDetail {
  const templates = normalizePromptTemplates(row.templates) ?? {
    system: '',
    user: '',
    variant: null,
  };
  const document = templatesToJson(templates);
  return {
    ...toSummary(row),
    templates: document,
    systemPrompt: templates.system,
    userPromptTemplate: templates.user,
    variantPrompt: templates.variant,
    variables: readVariables(row.variables),
    currentPublishedVersion:
      row.current_published_version === null ? null : Number(row.current_published_version),
    updatedBy: row.updated_by,
  };
}

function bodyOf(templates: unknown, variables: unknown): {
  templates: PromptTemplateDetail['templates'];
  variables: string[];
} {
  const normalized = normalizePromptTemplates(templates) ?? { system: '', user: '', variant: null };
  return { templates: templatesToJson(normalized), variables: readVariables(variables) };
}

function readVariables(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
