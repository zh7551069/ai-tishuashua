import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PACK_KNOWLEDGE_POINT_MAX,
  PACK_NAME_MAX_LENGTH,
  type CreatePackRequest,
  type DeletePackResult,
  type PackKnowledgePoint,
  type PackList,
  type PackView,
  type UpdatePackRequest,
} from '@tishuashua/shared';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

function trimToUndefined(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CreatePackDto implements CreatePackRequest {
  @ApiProperty()
  @IsUUID('4', { message: 'domainId 必须是 UUID' })
  domainId!: string;

  @ApiProperty()
  @IsUUID('4', { message: 'certId 必须是 UUID' })
  certId!: string;

  @ApiProperty({ type: [String] })
  @IsArray({ message: 'knowledgePointIds 必须是数组' })
  @ArrayNotEmpty({ message: '请至少选择一个知识点' })
  @ArrayUnique({ message: '知识点不能重复' })
  @ArrayMaxSize(PACK_KNOWLEDGE_POINT_MAX, { message: '一次最多选择 200 个知识点' })
  @IsUUID('4', { each: true, message: '知识点 id 不正确' })
  knowledgePointIds!: string[];

  @ApiPropertyOptional({ description: '不传则使用证书名称。' })
  @Transform(({ value }: { value: unknown }) => trimToUndefined(value))
  @IsOptional()
  @IsString({ message: 'name 必须是字符串' })
  @MaxLength(PACK_NAME_MAX_LENGTH, { message: '刷题包名称不能超过 40 个字符' })
  name?: string;
}

export class UpdatePackDto implements UpdatePackRequest {
  @ApiPropertyOptional()
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsOptional()
  @IsString({ message: 'name 必须是字符串' })
  @MinLength(1, { message: '请填写刷题包名称' })
  @MaxLength(PACK_NAME_MAX_LENGTH, { message: '刷题包名称不能超过 40 个字符' })
  name?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray({ message: 'knowledgePointIds 必须是数组' })
  @ArrayNotEmpty({ message: '请至少选择一个知识点' })
  @ArrayUnique({ message: '知识点不能重复' })
  @ArrayMaxSize(PACK_KNOWLEDGE_POINT_MAX, { message: '一次最多选择 200 个知识点' })
  @IsUUID('4', { each: true, message: '知识点 id 不正确' })
  knowledgePointIds?: string[];
}

export class PackKnowledgePointDto implements PackKnowledgePoint {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;
}

export class PackViewDto implements PackView {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  certId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [String] })
  knowledgePointIds!: string[];

  @ApiProperty({ type: [PackKnowledgePointDto] })
  knowledgePoints!: PackKnowledgePointDto[];

  @ApiProperty()
  knowledgePointCount!: number;

  @ApiProperty()
  domainName!: string;

  @ApiProperty()
  certName!: string;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty({ type: [String] })
  enabledQuestionTypeCodes!: string[];

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ description: '关联证书已下架时为 true。此时只可删除。' })
  unavailable!: boolean;
}

export class PackListDto implements PackList {
  @ApiProperty({ nullable: true })
  activePackId!: string | null;

  @ApiProperty({ type: [PackViewDto] })
  items!: PackViewDto[];
}

export class DeletePackResultDto implements DeletePackResult {
  @ApiProperty()
  id!: string;

  @ApiProperty({
    nullable: true,
    description: '删掉当前包后自动选中的下一个包。没有剩余包时为 null。',
  })
  activePackId!: string | null;
}
