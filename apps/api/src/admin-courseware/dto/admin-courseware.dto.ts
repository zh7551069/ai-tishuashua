import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminCoursewareDetail,
  AdminCoursewareList,
  AdminCoursewareSummary,
} from '@tishuashua/shared';
import { COURSEWARE_EXTENSIONS, EXTRACT_JOB_STATUSES, EXTRACT_STAGES } from '@tishuashua/shared';

export class AdminCoursewareSummaryDto implements AdminCoursewareSummary {
  @ApiProperty({ description: 'user_uploads.id' })
  id!: string;

  @ApiProperty({ nullable: true, description: 'extract_jobs.id。没有提炼任务时为空。' })
  jobId!: string | null;

  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ nullable: true })
  certId!: string | null;

  @ApiProperty({ nullable: true })
  certName!: string | null;

  @ApiProperty({ nullable: true })
  domainId!: string | null;

  @ApiProperty({ nullable: true })
  domainName!: string | null;

  @ApiProperty({ enum: EXTRACT_JOB_STATUSES })
  status!: AdminCoursewareSummary['status'];

  @ApiProperty({ enum: EXTRACT_STAGES, nullable: true })
  stage!: AdminCoursewareSummary['stage'];

  @ApiProperty()
  progress!: number;

  @ApiProperty({ nullable: true })
  estimatedMinutes!: number | null;

  @ApiProperty()
  fileName!: string;

  @ApiProperty({ enum: COURSEWARE_EXTENSIONS, nullable: true })
  extension!: AdminCoursewareSummary['extension'];

  @ApiProperty()
  byteSize!: number;

  @ApiProperty()
  committed!: boolean;

  @ApiProperty({ description: '草稿 jsonb 数组长度。详情里读不出来的项不计入正文。' })
  draftCount!: number;

  @ApiProperty({ nullable: true })
  errorCode!: string | null;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  updatedAt!: string;
}

export class AdminCoursewareListDto implements AdminCoursewareList {
  @ApiProperty({ type: [AdminCoursewareSummaryDto] })
  items!: AdminCoursewareSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminCoursewareErrorDto {
  @ApiProperty()
  code!: string;

  @ApiProperty()
  message!: string;
}

export class AdminCoursewareDetailDto
  extends AdminCoursewareSummaryDto
  implements AdminCoursewareDetail
{
  @ApiProperty({
    type: 'array',
    description: '库里能读出来的草稿。不按状态隐藏。不含对象键。',
  })
  drafts!: AdminCoursewareDetail['drafts'];

  @ApiProperty({ type: [String], description: 'extract_jobs.extracted_kp_ids。不解析名称。' })
  extractedKpIds!: string[];

  @ApiProperty({ type: [String] })
  acceptedDraftIds!: string[];

  @ApiProperty({ type: AdminCoursewareErrorDto, nullable: true })
  error!: AdminCoursewareDetail['error'];
}
