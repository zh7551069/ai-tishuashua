import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type { CommitExtractResult } from '@tishuashua/shared';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsOptional, IsUUID } from 'class-validator';

export class CommitExtractDto {
  @ApiProperty({ type: [String], description: '要写入知识点树的提炼草稿 id' })
  @IsArray({ message: 'draftIds 必须是数组' })
  @ArrayNotEmpty({ message: '请至少勾选一个知识点' })
  @ArrayUnique({ message: '知识点重复了' })
  @IsUUID('4', { each: true, message: '知识点 id 不正确' })
  draftIds!: string[];

  @ApiPropertyOptional({ description: '当前刷题包。传入后会把勾选的知识点并进这个包' })
  @IsOptional()
  @IsUUID('4', { message: '刷题包 id 不正确' })
  packId?: string;
}

export class CommitExtractResultDto implements CommitExtractResult {
  @ApiProperty()
  jobId!: string;

  @ApiProperty()
  certificateId!: string;

  @ApiProperty()
  textbookId!: string;

  @ApiProperty()
  textbookName!: string;

  @ApiProperty({ type: [String] })
  knowledgePointIds!: string[];

  @ApiProperty({ nullable: true })
  packId!: string | null;
}
