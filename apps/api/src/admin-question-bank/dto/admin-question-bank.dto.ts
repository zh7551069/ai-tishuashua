import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminQuestionBankDetail,
  AdminQuestionBankList,
  AdminQuestionBankSummary,
} from '@tishuashua/shared';
import { BANK_INGEST_SOURCES, BANK_STATUSES, QUIZ_TYPES } from '@tishuashua/shared';

export class AdminQuestionBankSummaryDto implements AdminQuestionBankSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ description: '题干截断，最多 40 个字，超出以 … 结尾。' })
  summary!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  domainName!: string;

  @ApiProperty()
  certificateId!: string;

  @ApiProperty()
  certificateName!: string;

  @ApiProperty({ type: [String] })
  kpIds!: string[];

  @ApiProperty({ description: '知识点名称用「、」拼接。名称缺失时为空字符串。' })
  knowledgeLabel!: string;

  @ApiProperty({ enum: BANK_INGEST_SOURCES })
  source!: AdminQuestionBankSummary['source'];

  @ApiProperty({ description: '入库时间，ISO-8601。' })
  createdAt!: string;
}

export class AdminQuestionBankListDto implements AdminQuestionBankList {
  @ApiProperty({ type: [AdminQuestionBankSummaryDto] })
  items!: AdminQuestionBankSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminQuestionBankDetailDto
  extends AdminQuestionBankSummaryDto
  implements AdminQuestionBankDetail
{
  @ApiProperty()
  stem!: string;

  @ApiProperty({ enum: QUIZ_TYPES })
  type!: AdminQuestionBankDetail['type'];

  @ApiProperty({ type: 'array' })
  options!: AdminQuestionBankDetail['options'];

  @ApiProperty({ type: [String] })
  answer!: string[];

  @ApiProperty({ nullable: true })
  analysis!: string | null;

  @ApiProperty({ nullable: true })
  difficulty!: AdminQuestionBankDetail['difficulty'];

  @ApiProperty({ enum: BANK_STATUSES, description: '只读展示。本接口不能改状态。' })
  status!: AdminQuestionBankDetail['status'];
}
