import { ApiProperty } from '@nestjs/swagger';
import type { AdminScoreDetail, AdminScoreList, AdminScoreSummary } from '@tishuashua/shared';
import { QUIZ_MODES, QUIZ_SUBMIT_REASONS } from '@tishuashua/shared';

export class AdminScoreSummaryDto implements AdminScoreSummary {
  @ApiProperty({ description: 'quiz_sessions.id' })
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ enum: QUIZ_MODES })
  mode!: AdminScoreSummary['mode'];

  @ApiProperty({ nullable: true })
  certId!: string | null;

  @ApiProperty()
  certName!: string;

  @ApiProperty({ nullable: true })
  resolvedCertName!: string | null;

  @ApiProperty({ nullable: true })
  domainId!: string | null;

  @ApiProperty({ nullable: true })
  domainName!: string | null;

  @ApiProperty({ nullable: true })
  packId!: string | null;

  @ApiProperty()
  packName!: string;

  @ApiProperty({ nullable: true })
  earnedScore!: number | null;

  @ApiProperty({ nullable: true })
  totalScore!: number | null;

  @ApiProperty({ nullable: true })
  accuracy!: number | null;

  @ApiProperty({ nullable: true })
  scoreRate!: number | null;

  @ApiProperty({ nullable: true })
  correctCount!: number | null;

  @ApiProperty({ nullable: true })
  questionCount!: number | null;

  @ApiProperty({ nullable: true })
  passed!: boolean | null;

  @ApiProperty({ nullable: true })
  passScore!: number | null;

  @ApiProperty({ enum: QUIZ_SUBMIT_REASONS, nullable: true })
  reason!: AdminScoreSummary['reason'];

  @ApiProperty({ nullable: true })
  submittedAt!: string | null;

  @ApiProperty()
  readable!: boolean;
}

export class AdminScoreListDto implements AdminScoreList {
  @ApiProperty({ type: [AdminScoreSummaryDto] })
  items!: AdminScoreSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminScoreDetailDto extends AdminScoreSummaryDto implements AdminScoreDetail {
  @ApiProperty({ nullable: true })
  wrongCount!: number | null;

  @ApiProperty({ nullable: true })
  unansweredCount!: number | null;

  @ApiProperty({ nullable: true })
  partialCount!: number | null;

  @ApiProperty({ nullable: true })
  startedAt!: string | null;

  @ApiProperty()
  createdAt!: string;
}
