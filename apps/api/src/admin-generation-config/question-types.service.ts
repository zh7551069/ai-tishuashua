import { Inject, Injectable } from '@nestjs/common';
import {
  parseQuestionTypeCreate,
  parseQuestionTypeUpdate,
  rendererSupported,
  type QuestionTypeView,
} from '@tishuashua/shared';
import type { PoolClient } from 'pg';
import {
  GenerationConfigNotFoundError,
  GenerationConfigValidationError,
} from './generation-config.errors';
import { GenerationConfigStore } from './generation-config.store';

interface TypeRow {
  code: string;
  name: string;
  option_structure: unknown;
  app_renderer_key: string;
  enabled: boolean;
  sort_order: number;
  grading_rule_brief: string;
  updated_at: Date | string | null;
  updated_by: string | null;
}

@Injectable()
export class QuestionTypeService {
  constructor(@Inject(GenerationConfigStore) private readonly store: GenerationConfigStore) {}

  async list(): Promise<{ items: QuestionTypeView[] }> {
    const rows = await this.store.pool().query<TypeRow>(
      `
        SELECT
          code, name, option_structure, app_renderer_key, enabled, sort_order,
          grading_rule_brief, updated_at, updated_by
        FROM question_types
        ORDER BY sort_order ASC, code ASC
      `,
    );
    return { items: rows.rows.map(toView) };
  }

  async create(body: unknown, actor: string): Promise<QuestionTypeView> {
    const parsed = parseQuestionTypeCreate(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const input = parsed.value;
    return this.store.write(async (client) => {
      await client.query(
        `
          INSERT INTO question_types (
            code, name, option_structure, app_renderer_key, enabled, sort_order,
            grading_rule_brief, updated_at, updated_by
          )
          VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, now(), $8)
        `,
        [
          input.code,
          input.name,
          JSON.stringify(input.optionStructure),
          input.appRendererKey,
          input.enabled,
          input.sortOrder,
          input.gradingRuleBrief,
          actor,
        ],
      );
      await this.store.audit(client, {
        actor,
        action: 'questionType.create',
        target: `questionType:${input.code}`,
        before: null,
        after: {
          code: input.code,
          name: input.name,
          enabled: input.enabled,
          appRendererKey: input.appRendererKey,
        },
      });
      if (input.enabled) {
        await this.store.audit(client, {
          actor,
          action: 'questionType.enable',
          target: `questionType:${input.code}`,
          before: { enabled: false },
          after: { enabled: true, appRendererKey: input.appRendererKey },
        });
      }
      return toView(await requireType(client, input.code));
    });
  }

  async update(code: string, body: unknown, actor: string): Promise<QuestionTypeView> {
    const parsed = parseQuestionTypeUpdate(body);
    if (!parsed.ok) {
      throw new GenerationConfigValidationError(parsed.message);
    }
    const input = parsed.value;
    if (input.code !== undefined && input.code !== code) {
      throw new GenerationConfigValidationError('code 创建后不可改');
    }
    return this.store.write(async (client) => {
      const current = await lockType(client, code);
      const next = {
        name: input.name ?? current.name,
        optionStructure: input.optionStructure ?? readStructure(current.option_structure),
        appRendererKey: input.appRendererKey ?? current.app_renderer_key,
        gradingRuleBrief: input.gradingRuleBrief ?? current.grading_rule_brief,
        enabled: input.enabled ?? current.enabled,
        sortOrder: input.sortOrder ?? Number(current.sort_order),
      };
      if (next.enabled && !rendererSupported(next.appRendererKey)) {
        throw new GenerationConfigValidationError('未登记的题型渲染器不能启用');
      }
      await client.query(
        `
          UPDATE question_types
          SET
            name = $2,
            option_structure = $3::jsonb,
            app_renderer_key = $4,
            enabled = $5,
            sort_order = $6,
            grading_rule_brief = $7,
            updated_at = now(),
            updated_by = $8
          WHERE code = $1
        `,
        [
          code,
          next.name,
          JSON.stringify(next.optionStructure),
          next.appRendererKey,
          next.enabled,
          next.sortOrder,
          next.gradingRuleBrief,
          actor,
        ],
      );
      await this.store.audit(client, {
        actor,
        action: 'questionType.update',
        target: `questionType:${code}`,
        before: { name: current.name, enabled: current.enabled, sortOrder: Number(current.sort_order) },
        after: { name: next.name, enabled: next.enabled, sortOrder: next.sortOrder },
      });
      if (current.enabled !== next.enabled) {
        await this.store.audit(client, {
          actor,
          action: next.enabled ? 'questionType.enable' : 'questionType.disable',
          target: `questionType:${code}`,
          before: { enabled: current.enabled },
          after: { enabled: next.enabled, appRendererKey: next.appRendererKey },
        });
      }
      return toView(await requireType(client, code));
    });
  }
}

async function lockType(client: PoolClient, code: string): Promise<TypeRow> {
  const result = await client.query<TypeRow>(
    `
      SELECT
        code, name, option_structure, app_renderer_key, enabled, sort_order,
        grading_rule_brief, updated_at, updated_by
      FROM question_types
      WHERE code = $1
      FOR UPDATE
    `,
    [code],
  );
  const row = result.rows[0];
  if (!row) {
    throw new GenerationConfigNotFoundError('题型不存在');
  }
  return row;
}

async function requireType(client: PoolClient, code: string): Promise<TypeRow> {
  const result = await client.query<TypeRow>(
    `
      SELECT
        code, name, option_structure, app_renderer_key, enabled, sort_order,
        grading_rule_brief, updated_at, updated_by
      FROM question_types
      WHERE code = $1
    `,
    [code],
  );
  const row = result.rows[0];
  if (!row) {
    throw new GenerationConfigNotFoundError('题型不存在');
  }
  return row;
}

function toView(row: TypeRow): QuestionTypeView {
  return {
    code: row.code,
    name: row.name,
    optionStructure: readStructure(row.option_structure),
    appRendererKey: row.app_renderer_key,
    enabled: row.enabled,
    sortOrder: Number(row.sort_order),
    gradingRuleBrief: row.grading_rule_brief,
    rendererSupported: rendererSupported(row.app_renderer_key),
    updatedAt: row.updated_at ? iso(row.updated_at) : null,
    updatedBy: row.updated_by,
  };
}

function readStructure(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function iso(value: Date | string): string {
  return (value instanceof Date ? value : new Date(value)).toISOString();
}
