import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QUIZ_MODES, QUIZ_SESSION_SOURCES, QUIZ_SUBMIT_REASONS } from '@tishuashua/shared';
import type {
  AdminPracticeRecordDetail,
  AdminPracticeRecordList,
  AdminPracticeRecordSummary,
} from '@tishuashua/shared';

export class AdminPracticeRecordSummaryDto implements AdminPracticeRecordSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ enum: QUIZ_MODES })
  mode!: AdminPracticeRecordSummary['mode'];

  @ApiProperty({ enum: QUIZ_SESSION_SOURCES })
  source!: AdminPracticeRecordSummary['source'];

  @ApiProperty({ nullable: true })
  score!: number | null;

  @ApiProperty({ nullable: true })
  totalScore!: number | null;

  @ApiProperty({ nullable: true })
  passed!: boolean | null;

  @ApiProperty()
  scoreReadable!: boolean;

  @ApiProperty({ nullable: true })
  durationSeconds!: number | null;

  @ApiProperty({ nullable: true })
  packId!: string | null;

  @ApiProperty()
  packName!: string;

  @ApiProperty({ nullable: true })
  certId!: string | null;

  @ApiProperty({ nullable: true })
  certName!: string | null;

  @ApiProperty({ nullable: true })
  domainName!: string | null;

  @ApiProperty({ nullable: true })
  startedAt!: string | null;

  @ApiProperty({ nullable: true })
  submittedAt!: string | null;
}

export class AdminPracticeRecordListDto implements AdminPracticeRecordList {
  @ApiProperty({ type: [AdminPracticeRecordSummaryDto] })
  items!: AdminPracticeRecordSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminPracticeRecordDetailDto
  extends AdminPracticeRecordSummaryDto
  implements AdminPracticeRecordDetail
{
  @ApiProperty({ nullable: true })
  correctCount!: number | null;

  @ApiProperty({ nullable: true })
  wrongCount!: number | null;

  @ApiProperty({ nullable: true })
  partialCount!: number | null;

  @ApiProperty({ nullable: true })
  unansweredCount!: number | null;

  @ApiProperty({ nullable: true })
  accuracy!: number | null;

  @ApiProperty({ nullable: true })
  scoreRate!: number | null;

  @ApiPropertyOptional({ enum: QUIZ_SUBMIT_REASONS, nullable: true })
  submitReason!: AdminPracticeRecordDetail['submitReason'];
}
