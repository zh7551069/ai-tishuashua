import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminQuizGenerationLogDetail,
  AdminQuizGenerationLogList,
  AdminQuizGenerationLogStats,
  AdminQuizGenerationLogSummary,
  AdminQuizGenerationRequestSummary,
} from '@tishuashua/shared';

export class AdminQuizGenerationRequestSummaryDto implements AdminQuizGenerationRequestSummary {
  @ApiProperty({ nullable: true })
  count!: number | null;

  @ApiProperty({ nullable: true, type: [String] })
  types!: string[] | null;

  @ApiProperty({ nullable: true })
  difficulty!: string | null;

  @ApiProperty({ nullable: true })
  mode!: string | null;

  @ApiProperty({ nullable: true })
  source!: string | null;

  @ApiProperty({ nullable: true })
  generationStats!: AdminQuizGenerationRequestSummary['generationStats'];
}

export class AdminQuizGenerationLogSummaryDto implements AdminQuizGenerationLogSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty({ nullable: true })
  sessionId!: string | null;

  @ApiProperty({ nullable: true })
  userId!: string | null;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ nullable: true })
  certId!: string | null;

  @ApiProperty({ nullable: true })
  certName!: string | null;

  @ApiProperty({ nullable: true })
  templateId!: string | null;

  @ApiProperty({ nullable: true })
  templateVersion!: number | null;

  @ApiProperty({ nullable: true })
  templateCode!: string | null;

  @ApiProperty()
  usedBuiltin!: boolean;

  @ApiProperty()
  success!: boolean;

  @ApiProperty({ nullable: true })
  errorCode!: string | null;

  @ApiProperty({ nullable: true })
  errorMessage!: string | null;

  @ApiProperty({ nullable: true })
  durationMs!: number | null;

  @ApiProperty()
  createdAt!: string;
}

export class AdminQuizGenerationLogListDto implements AdminQuizGenerationLogList {
  @ApiProperty({ type: [AdminQuizGenerationLogSummaryDto] })
  items!: AdminQuizGenerationLogSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminQuizGenerationLogDetailDto
  extends AdminQuizGenerationLogSummaryDto
  implements AdminQuizGenerationLogDetail
{
  @ApiProperty({ type: AdminQuizGenerationRequestSummaryDto })
  requestSummary!: AdminQuizGenerationRequestSummaryDto;
}

export class AdminQuizGenerationLogStatsDto implements AdminQuizGenerationLogStats {
  @ApiProperty()
  days!: number;

  @ApiProperty()
  since!: string;

  @ApiProperty()
  attemptCount!: number;

  @ApiProperty()
  failureCount!: number;

  @ApiProperty({ nullable: true })
  failureRate!: number | null;

  @ApiProperty()
  builtinFallbackCount!: number;
}
