import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminWrongBookDetail,
  AdminWrongBookList,
  AdminWrongBookSummary,
} from '@tishuashua/shared';
import { WRONG_ITEM_STATUSES } from '@tishuashua/shared';

export class AdminWrongBookSummaryDto implements AdminWrongBookSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty()
  certId!: string;

  @ApiProperty()
  certName!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  domainName!: string;

  @ApiProperty({ enum: WRONG_ITEM_STATUSES })
  status!: AdminWrongBookSummary['status'];

  @ApiProperty()
  wrongCount!: number;

  @ApiProperty({ nullable: true })
  type!: AdminWrongBookSummary['type'];

  @ApiProperty()
  stem!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AdminWrongBookListDto implements AdminWrongBookList {
  @ApiProperty({ type: [AdminWrongBookSummaryDto] })
  items!: AdminWrongBookSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminWrongBookDetailDto
  extends AdminWrongBookSummaryDto
  implements AdminWrongBookDetail
{
  @ApiProperty({ type: 'array' })
  options!: AdminWrongBookDetail['options'];

  @ApiProperty({ type: [String] })
  answer!: string[];

  @ApiProperty()
  analysis!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ type: [String], description: 'wrong_items.kp_ids。不解析知识点名称。' })
  kpIds!: string[];
}
