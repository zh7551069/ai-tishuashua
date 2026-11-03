import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminQuizSessionDetail,
  AdminQuizSessionError,
  AdminQuizSessionList,
  AdminQuizSessionProgress,
  AdminQuizSessionSummary,
  QuizSettings,
} from '@tishuashua/shared';
import {
  ADMIN_QUIZ_SESSION_SOURCES,
  ADMIN_QUIZ_SESSION_STATUSES,
  QUIZ_MODES,
} from '@tishuashua/shared';

export class AdminQuizSessionProgressDto implements AdminQuizSessionProgress {
  @ApiProperty()
  generated!: number;

  @ApiProperty()
  total!: number;
}

export class AdminQuizSessionErrorDto implements AdminQuizSessionError {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;
}

export class AdminQuizSessionSummaryDto implements AdminQuizSessionSummary {
  @ApiProperty({ description: '未交卷的 quiz_sessions.id' })
  id!: string;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true, description: '脱敏昵称。' })
  userNick!: string | null;

  @ApiProperty({ nullable: true })
  packId!: string | null;

  @ApiProperty()
  packName!: string;

  @ApiProperty({ nullable: true, description: '来自 pack_snapshot，不对照现在的目录。' })
  domainName!: string | null;

  @ApiProperty({ nullable: true, description: '来自 pack_snapshot，不对照现在的目录。' })
  certName!: string | null;

  @ApiProperty({ enum: QUIZ_MODES })
  mode!: AdminQuizSessionSummary['mode'];

  @ApiProperty({ enum: ADMIN_QUIZ_SESSION_STATUSES })
  status!: AdminQuizSessionSummary['status'];

  @ApiProperty({ enum: ADMIN_QUIZ_SESSION_SOURCES, description: '会话来源。不是成绩。' })
  source!: AdminQuizSessionSummary['source'];

  @ApiProperty({ type: AdminQuizSessionProgressDto })
  progress!: AdminQuizSessionProgressDto;

  @ApiProperty({ type: AdminQuizSessionErrorDto, nullable: true })
  error!: AdminQuizSessionErrorDto | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;

  @ApiProperty({ nullable: true })
  startedAt!: string | null;
}

export class AdminQuizSessionListDto implements AdminQuizSessionList {
  @ApiProperty({ type: [AdminQuizSessionSummaryDto] })
  items!: AdminQuizSessionSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminQuizSessionDetailDto
  extends AdminQuizSessionSummaryDto
  implements AdminQuizSessionDetail
{
  @ApiProperty({ description: 'settings 能读出声明过的字段时为 true。' })
  settingsReadable!: boolean;

  @ApiProperty({
    nullable: true,
    description: '只含题量、难度、题型、计时和模式。不回传原始 JSON。',
  })
  settings!: QuizSettings | null;

  @ApiProperty({ nullable: true, description: '考试且设置可读时的截止时间。练习为 null。' })
  deadlineAt!: string | null;
}
