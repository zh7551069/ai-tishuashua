import { QUIZ_TYPES } from './quiz';

/** 现网 buildPromptVariables 会注入的 8 个名字。不含花括号。 */
export const STANDARD_PROMPT_VARIABLES = [
  'domainName',
  'certificateName',
  'totalScore',
  'difficulty',
  'types',
  'count',
  'knowledgePoints',
  'extraConstraint',
] as const;

/** 仅当模板含 variant 时，变异出题才会注入。 */
export const VARIANT_PROMPT_VARIABLES = [
  'originalType',
  'originalStem',
  'originalOptions',
] as const;

export const PROMPT_CODE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const QUESTION_TYPE_CODE_PATTERN = /^[a-z][a-z0-9_]{0,31}$/;

const NAME_MAX = 80;
const BRIEF_MAX = 200;
const PROMPT_TEXT_MAX = 20_000;
const VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export type PromptScope = 'global' | 'domain' | 'certificate';
export type PromptStatus = 'draft' | 'published';

export interface NormalizedPromptTemplates {
  system: string;
  user: string;
  variant: { system: string; user: string } | null;
}

export interface PromptTemplateSummary {
  id: string;
  code: string;
  name: string;
  scope: PromptScope;
  scopeRefId: string | null;
  status: PromptStatus;
  version: number;
  locked: boolean;
  updatedAt: string;
  hasDirtyDraft: boolean;
}

export interface PromptTemplateDetail extends PromptTemplateSummary {
  templates: {
    system: string;
    user: string;
    variant?: { system: string; user: string };
  };
  systemPrompt: string;
  userPromptTemplate: string;
  variantPrompt: { system: string; user: string } | null;
  variables: string[];
  currentPublishedVersion: number | null;
  updatedBy: string | null;
}

export interface PromptTemplateList {
  items: PromptTemplateSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PromptVersionItem {
  version: number;
  publishedAt: string;
  publishedBy: string;
  current: boolean;
  templates?: PromptTemplateDetail['templates'];
  variables?: string[];
}

export interface PromptVersionList {
  items: PromptVersionItem[];
}

export interface PromptTemplateStats {
  neverPublishedCount: number;
  dirtyDraftCount: number;
  publishedCount: number;
  pendingDraftCount: number;
}

export interface PromptPublishResult {
  id: string;
  code: string;
  version: number;
  status: 'published';
  warnings: string[];
}

export interface QuestionTypeView {
  code: string;
  name: string;
  optionStructure: Record<string, unknown>;
  appRendererKey: string;
  enabled: boolean;
  sortOrder: number;
  gradingRuleBrief: string;
  rendererSupported: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface CertQuestionTypeConfig {
  questionTypeCode: string;
  defaultSelected: boolean;
  minCount: number | null;
  maxCount: number | null;
  defaultCountShare: number | null;
  scorePerQuestion: number | null;
}

export interface CertQuestionTypeConfigView {
  certificateId: string;
  certificateName: string;
  totalScore: number;
  enabledQuestionTypeCodes: string[];
  items: CertQuestionTypeConfig[];
}

export interface PromptCreateInput {
  name: string;
  code: string;
  scope: PromptScope;
  scopeRefId: string | null;
  templates: NormalizedPromptTemplates;
  variables: string[];
}

export interface PromptUpdateInput {
  name?: string;
  code?: string;
  scope?: PromptScope;
  scopeRefProvided: boolean;
  scopeRefId?: string | null;
  templates?: NormalizedPromptTemplates;
  variables?: string[];
}

export interface QuestionTypeCreateInput {
  code: string;
  name: string;
  optionStructure: Record<string, unknown>;
  appRendererKey: string;
  gradingRuleBrief: string;
  enabled: boolean;
  sortOrder: number;
}

export interface QuestionTypeUpdateInput {
  code?: string;
  name?: string;
  optionStructure?: Record<string, unknown>;
  appRendererKey?: string;
  gradingRuleBrief?: string;
  enabled?: boolean;
  sortOrder?: number;
}

type Parsed<T> = { ok: true; value: T } | { ok: false; message: string };

export function rendererSupported(appRendererKey: string): boolean {
  return (QUIZ_TYPES as readonly string[]).includes(appRendererKey);
}

export function templatesToJson(
  templates: NormalizedPromptTemplates,
): { system: string; user: string; variant?: { system: string; user: string } } {
  const body: { system: string; user: string; variant?: { system: string; user: string } } = {
    system: templates.system,
    user: templates.user,
  };
  if (templates.variant) {
    body.variant = {
      system: templates.variant.system,
      user: templates.variant.user,
    };
  }
  return body;
}

export function normalizePromptTemplates(value: unknown): NormalizedPromptTemplates | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.system !== 'string' || typeof record.user !== 'string') {
    return null;
  }
  if (record.system.length > PROMPT_TEXT_MAX || record.user.length > PROMPT_TEXT_MAX) {
    return null;
  }
  if (record.variant === undefined || record.variant === null) {
    return { system: record.system, user: record.user, variant: null };
  }
  if (typeof record.variant !== 'object' || Array.isArray(record.variant)) {
    return null;
  }
  const variant = record.variant as Record<string, unknown>;
  if (typeof variant.system !== 'string' || typeof variant.user !== 'string') {
    return null;
  }
  if (variant.system.length > PROMPT_TEXT_MAX || variant.user.length > PROMPT_TEXT_MAX) {
    return null;
  }
  return {
    system: record.system,
    user: record.user,
    variant: { system: variant.system, user: variant.user },
  };
}

/** 占位符不合法时返回 null。合法时返回名字，不含花括号。 */
export function collectPlaceholders(text: string): string[] | null {
  const found: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf('{{', cursor);
    if (start < 0) {
      return found;
    }
    const end = text.indexOf('}}', start + 2);
    if (end < 0) {
      return null;
    }
    const inner = text.slice(start + 2, end);
    if (!/^\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(inner)) {
      return null;
    }
    found.push(inner.trim());
    cursor = end + 2;
  }
  return found;
}

export function validatePromptPublish(
  templates: NormalizedPromptTemplates,
  declared: readonly string[],
): { ok: true; warnings: string[] } | { ok: false; message: string } {
  if (!templates.system.trim() || !templates.user.trim()) {
    return { ok: false, message: '系统提示词和用户提示词不能为空' };
  }
  if (templates.variant && (!templates.variant.system.trim() || !templates.variant.user.trim())) {
    return { ok: false, message: '变异提示词不能只填一半' };
  }
  const allowed = new Set<string>(STANDARD_PROMPT_VARIABLES);
  if (templates.variant) {
    for (const name of VARIANT_PROMPT_VARIABLES) {
      allowed.add(name);
    }
  }
  const texts = [templates.system, templates.user];
  if (templates.variant) {
    texts.push(templates.variant.system, templates.variant.user);
  }
  const used = new Set<string>();
  for (const text of texts) {
    const names = collectPlaceholders(text);
    if (!names) {
      return { ok: false, message: '占位符格式不正确' };
    }
    for (const name of names) {
      if (!allowed.has(name)) {
        return { ok: false, message: `未知占位符 {{${name}}}` };
      }
      used.add(name);
    }
  }
  const unused = declared.filter((name) => !used.has(name));
  const warnings =
    unused.length > 0 ? [`已声明但正文未使用：${unused.join('、')}`] : [];
  return { ok: true, warnings };
}

export function promptDigest(value: unknown): string {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function promptExcerpt(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 200);
}

export function parsePromptCreate(body: unknown): Parsed<PromptCreateInput> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, PROMPT_WRITE_KEYS);
  if (extra) {
    return extra;
  }
  const name = readName(record.value.name);
  if (!name.ok) {
    return name;
  }
  const code = readCode(record.value.code, PROMPT_CODE_PATTERN, '模板 code');
  if (!code.ok) {
    return code;
  }
  const scope = readScope(record.value.scope);
  if (!scope.ok) {
    return scope;
  }
  const scopeRef = readScopeRef(scope.value, record.value.scopeRefId, true);
  if (!scopeRef.ok) {
    return scopeRef;
  }
  const templates = readTemplates(record.value, true);
  if (!templates.ok) {
    return templates;
  }
  const variables = readVariables(record.value.variables, false);
  if (!variables.ok) {
    return variables;
  }
  return {
    ok: true,
    value: {
      name: name.value,
      code: code.value,
      scope: scope.value,
      scopeRefId: scopeRef.value,
      templates: templates.value,
      variables: variables.value,
    },
  };
}

export function parsePromptUpdate(body: unknown): Parsed<PromptUpdateInput> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, PROMPT_WRITE_KEYS);
  if (extra) {
    return extra;
  }
  const value: PromptUpdateInput = { scopeRefProvided: Object.hasOwn(record.value, 'scopeRefId') };
  if (Object.hasOwn(record.value, 'name')) {
    const name = readName(record.value.name);
    if (!name.ok) {
      return name;
    }
    value.name = name.value;
  }
  if (Object.hasOwn(record.value, 'code')) {
    const code = readCode(record.value.code, PROMPT_CODE_PATTERN, '模板 code');
    if (!code.ok) {
      return code;
    }
    value.code = code.value;
  }
  if (Object.hasOwn(record.value, 'scope')) {
    const scope = readScope(record.value.scope);
    if (!scope.ok) {
      return scope;
    }
    value.scope = scope.value;
  }
  if (value.scopeRefProvided) {
    value.scopeRefId = readOptionalRef(record.value.scopeRefId);
    if (value.scopeRefId === undefined) {
      return { ok: false, message: 'scopeRefId 不正确' };
    }
  }
  if (hasTemplateFields(record.value)) {
    const templates = readTemplates(record.value, false);
    if (!templates.ok) {
      return templates;
    }
    value.templates = templates.value;
  }
  if (Object.hasOwn(record.value, 'variables')) {
    const variables = readVariables(record.value.variables, true);
    if (!variables.ok) {
      return variables;
    }
    value.variables = variables.value;
  }
  return { ok: true, value };
}

export function parseRollbackVersion(body: unknown): Parsed<number> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, ['version']);
  if (extra) {
    return extra;
  }
  const version = readInteger(record.value.version, '版本号', 1, 1_000_000);
  if (!version.ok) {
    return version;
  }
  return { ok: true, value: version.value };
}

export function parseQuestionTypeCreate(body: unknown): Parsed<QuestionTypeCreateInput> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, QUESTION_TYPE_KEYS);
  if (extra) {
    return extra;
  }
  const code = readCode(record.value.code, QUESTION_TYPE_CODE_PATTERN, '题型 code');
  if (!code.ok) {
    return code;
  }
  const name = readName(record.value.name);
  if (!name.ok) {
    return name;
  }
  const optionStructure = readOptionStructure(record.value.optionStructure);
  if (!optionStructure.ok) {
    return optionStructure;
  }
  const appRendererKey = readCode(
    record.value.appRendererKey,
    QUESTION_TYPE_CODE_PATTERN,
    '渲染器',
  );
  if (!appRendererKey.ok) {
    return appRendererKey;
  }
  const gradingRuleBrief = readBrief(record.value.gradingRuleBrief);
  if (!gradingRuleBrief.ok) {
    return gradingRuleBrief;
  }
  const enabled = Object.hasOwn(record.value, 'enabled')
    ? readBoolean(record.value.enabled, 'enabled')
    : { ok: true as const, value: false };
  if (!enabled.ok) {
    return enabled;
  }
  const sortOrder = Object.hasOwn(record.value, 'sortOrder')
    ? readInteger(record.value.sortOrder, '排序', 0, 10_000)
    : { ok: true as const, value: 0 };
  if (!sortOrder.ok) {
    return sortOrder;
  }
  if (enabled.value && !rendererSupported(appRendererKey.value)) {
    return { ok: false, message: '未登记的题型渲染器不能启用' };
  }
  return {
    ok: true,
    value: {
      code: code.value,
      name: name.value,
      optionStructure: optionStructure.value,
      appRendererKey: appRendererKey.value,
      gradingRuleBrief: gradingRuleBrief.value,
      enabled: enabled.value,
      sortOrder: sortOrder.value,
    },
  };
}

export function parseQuestionTypeUpdate(body: unknown): Parsed<QuestionTypeUpdateInput> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, QUESTION_TYPE_KEYS);
  if (extra) {
    return extra;
  }
  const value: QuestionTypeUpdateInput = {};
  if (Object.hasOwn(record.value, 'code')) {
    const code = readCode(record.value.code, QUESTION_TYPE_CODE_PATTERN, '题型 code');
    if (!code.ok) {
      return code;
    }
    value.code = code.value;
  }
  if (Object.hasOwn(record.value, 'name')) {
    const name = readName(record.value.name);
    if (!name.ok) {
      return name;
    }
    value.name = name.value;
  }
  if (Object.hasOwn(record.value, 'optionStructure')) {
    const optionStructure = readOptionStructure(record.value.optionStructure);
    if (!optionStructure.ok) {
      return optionStructure;
    }
    value.optionStructure = optionStructure.value;
  }
  if (Object.hasOwn(record.value, 'appRendererKey')) {
    const appRendererKey = readCode(
      record.value.appRendererKey,
      QUESTION_TYPE_CODE_PATTERN,
      '渲染器',
    );
    if (!appRendererKey.ok) {
      return appRendererKey;
    }
    value.appRendererKey = appRendererKey.value;
  }
  if (Object.hasOwn(record.value, 'gradingRuleBrief')) {
    const gradingRuleBrief = readBrief(record.value.gradingRuleBrief);
    if (!gradingRuleBrief.ok) {
      return gradingRuleBrief;
    }
    value.gradingRuleBrief = gradingRuleBrief.value;
  }
  if (Object.hasOwn(record.value, 'enabled')) {
    const enabled = readBoolean(record.value.enabled, 'enabled');
    if (!enabled.ok) {
      return enabled;
    }
    value.enabled = enabled.value;
  }
  if (Object.hasOwn(record.value, 'sortOrder')) {
    const sortOrder = readInteger(record.value.sortOrder, '排序', 0, 10_000);
    if (!sortOrder.ok) {
      return sortOrder;
    }
    value.sortOrder = sortOrder.value;
  }
  return { ok: true, value };
}

export function parseCertTypeConfigWrite(body: unknown): Parsed<CertQuestionTypeConfig[]> {
  const list = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && !Array.isArray(body) && Array.isArray((body as { items?: unknown }).items)
      ? (body as { items: unknown[] }).items
      : null;
  if (!list) {
    return { ok: false, message: '配置必须是数组' };
  }
  if (
    !Array.isArray(body) &&
    body &&
    typeof body === 'object' &&
    unknownKeys(body as Record<string, unknown>, ['items'])
  ) {
    return { ok: false, message: '不能包含多余字段' };
  }
  const items: CertQuestionTypeConfig[] = [];
  const seen = new Set<string>();
  for (const entry of list) {
    const parsed = parseCertTypeConfigItem(entry);
    if (!parsed.ok) {
      return parsed;
    }
    if (seen.has(parsed.value.questionTypeCode)) {
      return { ok: false, message: '题型配置重复' };
    }
    seen.add(parsed.value.questionTypeCode);
    items.push(parsed.value);
  }
  return { ok: true, value: items };
}

const PROMPT_WRITE_KEYS = [
  'name',
  'code',
  'scope',
  'scopeRefId',
  'systemPrompt',
  'userPromptTemplate',
  'variantPrompt',
  'templates',
  'variables',
];

const QUESTION_TYPE_KEYS = [
  'code',
  'name',
  'optionStructure',
  'appRendererKey',
  'gradingRuleBrief',
  'enabled',
  'sortOrder',
];

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseCertTypeConfigItem(body: unknown): Parsed<CertQuestionTypeConfig> {
  const record = readRecord(body);
  if (!record.ok) {
    return record;
  }
  const extra = unknownKeys(record.value, [
    'questionTypeCode',
    'defaultSelected',
    'minCount',
    'maxCount',
    'defaultCountShare',
    'scorePerQuestion',
  ]);
  if (extra) {
    return extra;
  }
  const questionTypeCode = readCode(
    record.value.questionTypeCode,
    QUESTION_TYPE_CODE_PATTERN,
    '题型 code',
  );
  if (!questionTypeCode.ok) {
    return questionTypeCode;
  }
  const defaultSelected = readBoolean(record.value.defaultSelected, '默认勾选');
  if (!defaultSelected.ok) {
    return defaultSelected;
  }
  const minCount = readOptionalInt(record.value.minCount, '最少题量', 0, 10_000);
  if (!minCount.ok) {
    return minCount;
  }
  const maxCount = readOptionalInt(record.value.maxCount, '最多题量', 0, 10_000);
  if (!maxCount.ok) {
    return maxCount;
  }
  if (
    minCount.value !== null &&
    maxCount.value !== null &&
    minCount.value > maxCount.value
  ) {
    return { ok: false, message: '最少题量不能大于最多题量' };
  }
  const defaultCountShare = readOptionalInt(record.value.defaultCountShare, '占比', 0, 100);
  if (!defaultCountShare.ok) {
    return defaultCountShare;
  }
  const scorePerQuestion = readOptionalScore(record.value.scorePerQuestion);
  if (!scorePerQuestion.ok) {
    return scorePerQuestion;
  }
  return {
    ok: true,
    value: {
      questionTypeCode: questionTypeCode.value,
      defaultSelected: defaultSelected.value,
      minCount: minCount.value,
      maxCount: maxCount.value,
      defaultCountShare: defaultCountShare.value,
      scorePerQuestion: scorePerQuestion.value,
    },
  };
}

function readTemplates(
  record: Record<string, unknown>,
  allowEmpty: boolean,
): Parsed<NormalizedPromptTemplates> {
  const fromFields = Object.hasOwn(record, 'systemPrompt') || Object.hasOwn(record, 'userPromptTemplate') || Object.hasOwn(record, 'variantPrompt');
  const fromObject = Object.hasOwn(record, 'templates');
  if (!fromFields && !fromObject) {
    if (!allowEmpty) {
      return { ok: false, message: '缺少提示词' };
    }
    return { ok: true, value: { system: '', user: '', variant: null } };
  }
  if (fromFields) {
    const system = readPromptText(record.systemPrompt, '系统提示词', !Object.hasOwn(record, 'systemPrompt'));
    if (!system.ok) {
      return system;
    }
    const user = readPromptText(
      record.userPromptTemplate,
      '用户提示词',
      !Object.hasOwn(record, 'userPromptTemplate'),
    );
    if (!user.ok) {
      return user;
    }
    const variant = readVariantPrompt(record.variantPrompt, Object.hasOwn(record, 'variantPrompt'));
    if (!variant.ok) {
      return variant;
    }
    return {
      ok: true,
      value: { system: system.value, user: user.value, variant: variant.value },
    };
  }
  const templates = normalizePromptTemplates(record.templates);
  if (!templates) {
    return { ok: false, message: '提示词格式不正确' };
  }
  return { ok: true, value: templates };
}

function readVariantPrompt(
  value: unknown,
  present: boolean,
): Parsed<{ system: string; user: string } | null> {
  if (!present || value === null) {
    return { ok: true, value: null };
  }
  const record = readRecord(value);
  if (!record.ok) {
    return { ok: false, message: '变异提示词格式不正确' };
  }
  const extra = unknownKeys(record.value, ['system', 'user']);
  if (extra) {
    return extra;
  }
  const system = readPromptText(record.value.system, '变异系统提示词', false);
  if (!system.ok) {
    return system;
  }
  const user = readPromptText(record.value.user, '变异用户提示词', false);
  if (!user.ok) {
    return user;
  }
  return { ok: true, value: { system: system.value, user: user.value } };
}

function readPromptText(
  value: unknown,
  label: string,
  allowMissing: boolean,
): Parsed<string> {
  if (value === undefined && allowMissing) {
    return { ok: true, value: '' };
  }
  if (typeof value !== 'string' || value.length > PROMPT_TEXT_MAX) {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value: value };
}

function readVariables(value: unknown, required: boolean): Parsed<string[]> {
  if (value === undefined && !required) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(value) || value.length > 32) {
    return { ok: false, message: '变量声明不正确' };
  }
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== 'string' || !VARIABLE_NAME.test(item) || item.length > 64) {
      return { ok: false, message: '变量声明不正确' };
    }
    if (!seen.has(item)) {
      seen.add(item);
      names.push(item);
    }
  }
  return { ok: true, value: names };
}

function hasTemplateFields(record: Record<string, unknown>): boolean {
  return (
    Object.hasOwn(record, 'systemPrompt') ||
    Object.hasOwn(record, 'userPromptTemplate') ||
    Object.hasOwn(record, 'variantPrompt') ||
    Object.hasOwn(record, 'templates')
  );
}

function readScope(value: unknown): Parsed<PromptScope> {
  if (value === 'global' || value === 'domain' || value === 'certificate') {
    return { ok: true, value };
  }
  return { ok: false, message: 'scope 不正确' };
}

function readScopeRef(
  scope: PromptScope,
  value: unknown,
  creating: boolean,
): Parsed<string | null> {
  if (!creating && value === undefined) {
    return { ok: true, value: null };
  }
  if (scope === 'global') {
    if (value === undefined || value === null || value === '') {
      return { ok: true, value: null };
    }
    return { ok: false, message: '全局模板不能绑定 scopeRefId' };
  }
  if (typeof value !== 'string' || !UUID_V4.test(value)) {
    return { ok: false, message: 'scopeRefId 不正确' };
  }
  return { ok: true, value: value.toLowerCase() };
}

function readOptionalRef(value: unknown): string | null | undefined {
  if (value === null || value === '') {
    return null;
  }
  if (typeof value === 'string' && UUID_V4.test(value)) {
    return value.toLowerCase();
  }
  return undefined;
}

function readName(value: unknown): Parsed<string> {
  if (typeof value !== 'string') {
    return { ok: false, message: '名称不正确' };
  }
  const name = value.trim();
  if (!name || name.length > NAME_MAX) {
    return { ok: false, message: '名称不正确' };
  }
  return { ok: true, value: name };
}

function readBrief(value: unknown): Parsed<string> {
  if (typeof value !== 'string') {
    return { ok: false, message: '判分说明不正确' };
  }
  const brief = value.trim();
  if (!brief || brief.length > BRIEF_MAX) {
    return { ok: false, message: '判分说明不正确' };
  }
  return { ok: true, value: brief };
}

function readCode(value: unknown, pattern: RegExp, label: string): Parsed<string> {
  if (typeof value !== 'string' || !pattern.test(value)) {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value: value };
}

function readBoolean(value: unknown, label: string): Parsed<boolean> {
  if (typeof value !== 'boolean') {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value };
}

function readInteger(
  value: unknown,
  label: string,
  min: number,
  max: number,
): Parsed<number> {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    return { ok: false, message: `${label}不正确` };
  }
  return { ok: true, value };
}

function readOptionalInt(
  value: unknown,
  label: string,
  min: number,
  max: number,
): Parsed<number | null> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  return readInteger(value, label, min, max);
}

function readOptionalScore(value: unknown): Parsed<number | null> {
  if (value === undefined || value === null) {
    return { ok: true, value: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 1000) {
    return { ok: false, message: '默认分值不正确' };
  }
  const scaled = Math.round(value * 100);
  if (Math.abs(scaled - value * 100) > 1e-6) {
    return { ok: false, message: '默认分值不正确' };
  }
  return { ok: true, value: scaled / 100 };
}

function readOptionStructure(value: unknown): Parsed<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: '选项结构不正确' };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

function readRecord(value: unknown): Parsed<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, message: '请求格式不正确' };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

function unknownKeys(
  record: Record<string, unknown>,
  allowed: readonly string[],
): { ok: false; message: string } | null {
  const permit = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!permit.has(key)) {
      return { ok: false, message: '不能包含多余字段' };
    }
  }
  return null;
}
