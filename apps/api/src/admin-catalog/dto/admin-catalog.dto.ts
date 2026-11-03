import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CATALOG_CODE_MAX_LENGTH,
  CATALOG_CODE_PATTERN,
  CATALOG_EXTRA_MAX_LENGTH,
  CATALOG_NAME_MAX_LENGTH,
  CATALOG_PROMPT_MAX_LENGTH,
  CATALOG_SCORE_MAX,
  CATALOG_SORT_MAX,
  CATALOG_SOURCE_REF_MAX_LENGTH,
  QUIZ_TYPES,
  type AdminCatalogDeleteResult,
  type AdminCatalogTree,
  type AdminCertificate,
  type AdminCertificateList,
  type AdminCertificatePatch,
  type AdminCertificateWrite,
  type AdminDomain,
  type AdminDomainList,
  type AdminDomainPatch,
  type AdminDomainWrite,
  type AdminKnowledgeNode,
  type AdminKnowledgePatch,
  type AdminKnowledgeWrite,
  type AdminTextbook,
  type AdminTextbookLink,
  type AdminTextbookPatch,
  type AdminTextbookSummary,
  type AdminTextbookWrite,
  type CatalogNodeKind,
  type PublishStatus,
} from '@tishuashua/shared';
import { Transform } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function catalogCode(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

function trimToNull(value: unknown): unknown {
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function whenPresent(_object: object, value: unknown): boolean {
  return value !== undefined;
}

function whenText(_object: object, value: unknown): boolean {
  return value !== undefined && value !== null;
}

export class AdminDomainWriteDto implements AdminDomainWrite {
  @ApiProperty({ description: '小写编码，创建后仍可改，不能与已有编码重复。' })
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name!: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminDomainPatchDto implements AdminDomainPatch {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name?: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminCertificateWriteDto implements AdminCertificateWrite {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name!: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiProperty()
  @IsInt({ message: 'totalScore 必须是整数' })
  @Min(1, { message: '总分至少为 1' })
  @Max(CATALOG_SCORE_MAX, { message: '总分不能大于 1000' })
  totalScore!: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @ValidateIf(whenText)
  @IsInt({ message: 'passScore 必须是整数' })
  @Min(0, { message: '及格分不能小于 0' })
  @Max(CATALOG_SCORE_MAX, { message: '及格分不能大于 1000' })
  passScore?: number | null;

  @ApiPropertyOptional({ enum: QUIZ_TYPES, isArray: true })
  @ValidateIf(whenPresent)
  @IsArray({ message: 'enabledQuestionTypeCodes 必须是数组' })
  @ArrayNotEmpty({ message: '请至少选择一种题型' })
  @ArrayUnique({ message: '题型不能重复' })
  @IsIn(QUIZ_TYPES, { each: true, message: '题型不正确' })
  enabledQuestionTypeCodes?: string[];

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'extraConstraint 必须是字符串' })
  @MaxLength(CATALOG_EXTRA_MAX_LENGTH, { message: 'extraConstraint 不能超过 500 个字符' })
  extraConstraint?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminCertificatePatchDto implements AdminCertificatePatch {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name?: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'totalScore 必须是整数' })
  @Min(1, { message: '总分至少为 1' })
  @Max(CATALOG_SCORE_MAX, { message: '总分不能大于 1000' })
  totalScore?: number;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => (value === '' ? null : value))
  @ValidateIf(whenText)
  @IsInt({ message: 'passScore 必须是整数' })
  @Min(0, { message: '及格分不能小于 0' })
  @Max(CATALOG_SCORE_MAX, { message: '及格分不能大于 1000' })
  passScore?: number | null;

  @ApiPropertyOptional({ enum: QUIZ_TYPES, isArray: true })
  @ValidateIf(whenPresent)
  @IsArray({ message: 'enabledQuestionTypeCodes 必须是数组' })
  @ArrayNotEmpty({ message: '请至少选择一种题型' })
  @ArrayUnique({ message: '题型不能重复' })
  @IsIn(QUIZ_TYPES, { each: true, message: '题型不正确' })
  enabledQuestionTypeCodes?: string[];

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'extraConstraint 必须是字符串' })
  @MaxLength(CATALOG_EXTRA_MAX_LENGTH, { message: 'extraConstraint 不能超过 500 个字符' })
  extraConstraint?: string | null;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminTextbookWriteDto implements AdminTextbookWrite {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name!: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminTextbookPatchDto implements AdminTextbookPatch {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name?: string;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;
}

export class AdminTextbookLinkDto implements AdminTextbookLink {
  @ApiProperty()
  @IsUUID('4', { message: 'textbookId 必须是 UUID' })
  textbookId!: string;
}

export class AdminKnowledgeWriteDto implements AdminKnowledgeWrite {
  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code!: string;

  @ApiProperty()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name!: string;

  @ApiPropertyOptional({ enum: ['knowledge_point', 'group'] })
  @ValidateIf(whenPresent)
  @IsIn(['knowledge_point', 'group'], { message: 'kind 只能是知识点或分组' })
  kind?: CatalogNodeKind;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'promptHint 必须是字符串' })
  @MaxLength(CATALOG_PROMPT_MAX_LENGTH, { message: 'promptHint 不能超过 500 个字符' })
  promptHint?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'sourceRef 必须是字符串' })
  @MaxLength(CATALOG_SOURCE_REF_MAX_LENGTH, { message: 'sourceRef 不能超过 200 个字符' })
  sourceRef?: string | null;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(whenText)
  @IsUUID('4', { message: 'parentId 必须是 UUID' })
  parentId?: string | null;
}

export class AdminKnowledgePatchDto implements AdminKnowledgePatch {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => catalogCode(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'code 必须是字符串' })
  @Matches(CATALOG_CODE_PATTERN, { message: 'code 只能使用小写字母、数字和连字符' })
  @MaxLength(CATALOG_CODE_MAX_LENGTH, { message: 'code 不能超过 64 个字符' })
  code?: string;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @ValidateIf(whenPresent)
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(CATALOG_NAME_MAX_LENGTH, { message: 'name 不能超过 80 个字符' })
  @MinLength(1, { message: 'name 不能为空' })
  name?: string;

  @ApiPropertyOptional({ enum: ['knowledge_point', 'group'] })
  @ValidateIf(whenPresent)
  @IsIn(['knowledge_point', 'group'], { message: 'kind 只能是知识点或分组' })
  kind?: CatalogNodeKind;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'promptHint 必须是字符串' })
  @MaxLength(CATALOG_PROMPT_MAX_LENGTH, { message: 'promptHint 不能超过 500 个字符' })
  promptHint?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @Transform(({ value }: { value: unknown }) => trimToNull(value))
  @ValidateIf(whenText)
  @IsString({ message: 'sourceRef 必须是字符串' })
  @MaxLength(CATALOG_SOURCE_REF_MAX_LENGTH, { message: 'sourceRef 不能超过 200 个字符' })
  sourceRef?: string | null;

  @ApiPropertyOptional({ enum: ['online', 'offline'] })
  @ValidateIf(whenPresent)
  @IsIn(['online', 'offline'], { message: 'status 只能是 online 或 offline' })
  status?: PublishStatus;

  @ApiPropertyOptional()
  @ValidateIf(whenPresent)
  @IsInt({ message: 'sortOrder 必须是整数' })
  @Min(0, { message: 'sortOrder 不能小于 0' })
  @Max(CATALOG_SORT_MAX, { message: 'sortOrder 不能大于 10000' })
  sortOrder?: number;

  @ApiPropertyOptional({ nullable: true })
  @ValidateIf(whenText)
  @IsUUID('4', { message: 'parentId 必须是 UUID' })
  parentId?: string | null;
}

export class AdminDomainDto implements AdminDomain {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;

  @ApiProperty()
  sortOrder!: number;
}

export class AdminDomainListDto implements AdminDomainList {
  @ApiProperty({ type: [AdminDomainDto] })
  items!: AdminDomainDto[];
}

export class AdminCertificateDto implements AdminCertificate {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty({ nullable: true })
  passScore!: number | null;

  @ApiProperty({ type: [String] })
  enabledQuestionTypeCodes!: string[];

  @ApiProperty({ nullable: true })
  extraConstraint!: string | null;

  @ApiProperty()
  sortOrder!: number;
}

export class AdminCertificateListDto implements AdminCertificateList {
  @ApiProperty({ type: [AdminCertificateDto] })
  items!: AdminCertificateDto[];
}

export class AdminKnowledgeNodeDto implements AdminKnowledgeNode {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['knowledge_point', 'group'] })
  kind!: CatalogNodeKind;

  @ApiProperty({ nullable: true })
  promptHint!: string | null;

  @ApiProperty({ nullable: true })
  sourceRef!: string | null;

  @ApiProperty()
  level!: number;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty({ type: () => [AdminKnowledgeNodeDto] })
  children!: AdminKnowledgeNodeDto[];
}

export class AdminTextbookSummaryDto implements AdminTextbookSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;

  @ApiProperty()
  sortOrder!: number;

  @ApiProperty({ type: [String] })
  certificateIds!: string[];
}

export class AdminTextbookDto extends AdminTextbookSummaryDto implements AdminTextbook {
  @ApiProperty({ type: [AdminKnowledgeNodeDto] })
  nodes!: AdminKnowledgeNodeDto[];
}

export class AdminCatalogTreeDto implements AdminCatalogTree {
  @ApiProperty()
  certificateId!: string;

  @ApiProperty()
  certificateName!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  certificateStatus!: PublishStatus;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  domainName!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  domainStatus!: PublishStatus;

  @ApiProperty({ type: [AdminTextbookDto] })
  textbooks!: AdminTextbookDto[];

  @ApiProperty({ type: [AdminKnowledgeNodeDto] })
  independentPoints!: AdminKnowledgeNodeDto[];

  @ApiProperty({ type: [AdminTextbookSummaryDto] })
  linkableTextbooks!: AdminTextbookSummaryDto[];
}

export class AdminCatalogDeleteResultDto implements AdminCatalogDeleteResult {
  @ApiProperty()
  id!: string;
}
