import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminCertificateScoreDetail,
  AdminCertificateScoreList,
  AdminCertificateScoreQuestion,
  AdminCertificateScoreSummary,
} from '@tishuashua/shared';
import {
  ADMIN_CERTIFICATE_SOURCES,
  QUESTION_SOURCES,
  QUIZ_MODES,
  QUIZ_SUBMIT_REASONS,
  QUIZ_TYPES,
} from '@tishuashua/shared';

export class AdminCertificateScoreSummaryDto implements AdminCertificateScoreSummary {
  @ApiProperty({ description: '已交卷的 quiz_sessions.id' })
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ nullable: true, description: '能对上的证书。对不上时为空。' })
  certId!: string | null;

  @ApiProperty({ nullable: true })
  certName!: string | null;

  @ApiProperty({ nullable: true })
  domainId!: string | null;

  @ApiProperty({ nullable: true })
  domainName!: string | null;

  @ApiProperty({ nullable: true, description: 'pack_snapshot.certName。证书行不在时仍可能有值。' })
  snapshotCertName!: string | null;

  @ApiProperty({ nullable: true })
  packId!: string | null;

  @ApiProperty()
  packName!: string;

  @ApiProperty({ enum: QUIZ_MODES })
  mode!: AdminCertificateScoreSummary['mode'];

  @ApiProperty({ enum: ADMIN_CERTIFICATE_SOURCES })
  source!: AdminCertificateScoreSummary['source'];

  @ApiProperty({ description: 'pass_snapshot 能读出分数时为 true。' })
  scoreReadable!: boolean;

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
  reason!: AdminCertificateScoreSummary['reason'];

  @ApiProperty({ nullable: true })
  submittedAt!: string | null;
}

export class AdminCertificateScoreListDto implements AdminCertificateScoreList {
  @ApiProperty({ type: [AdminCertificateScoreSummaryDto] })
  items!: AdminCertificateScoreSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminCertificateScoreQuestionDto implements AdminCertificateScoreQuestion {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  ordinal!: number;

  @ApiProperty({ enum: QUIZ_TYPES, nullable: true })
  type!: AdminCertificateScoreQuestion['type'];

  @ApiProperty()
  stem!: string;

  @ApiProperty({ type: 'array' })
  options!: AdminCertificateScoreQuestion['options'];

  @ApiProperty({ type: [String] })
  selected!: string[];

  @ApiProperty({ type: [String] })
  answer!: string[];

  @ApiProperty()
  analysis!: string;

  @ApiProperty()
  score!: number;

  @ApiProperty({ type: [String], description: 'paper_questions.kp_ids。不解析名称。' })
  kpIds!: string[];

  @ApiProperty({ enum: QUESTION_SOURCES, nullable: true })
  source!: AdminCertificateScoreQuestion['source'];
}

export class AdminCertificateScoreDetailDto
  extends AdminCertificateScoreSummaryDto
  implements AdminCertificateScoreDetail
{
  @ApiProperty({ nullable: true })
  startedAt!: string | null;

  @ApiProperty({ nullable: true })
  wrongCount!: number | null;

  @ApiProperty({ nullable: true })
  unansweredCount!: number | null;

  @ApiProperty({ nullable: true })
  partialCount!: number | null;

  @ApiProperty({
    type: [AdminCertificateScoreQuestionDto],
    description: '库里的题目、选择和答案。不含重新判出的得分。',
  })
  questions!: AdminCertificateScoreQuestionDto[];
}
