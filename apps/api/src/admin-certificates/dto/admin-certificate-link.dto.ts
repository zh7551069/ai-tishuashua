import { ApiProperty } from '@nestjs/swagger';
import type {
  AdminCertificateLinkDetail,
  AdminCertificateLinkList,
  AdminCertificateLinkSummary,
} from '@tishuashua/shared';
import { CertificateLatestScoreDto } from '../../certificate/dto/certificate.dto';

export class AdminCertificateLinkSummaryDto implements AdminCertificateLinkSummary {
  @ApiProperty()
  userId!: string;

  @ApiProperty({ nullable: true })
  userNick!: string | null;

  @ApiProperty({ description: '证书 id。一行的身份是 userId + id。' })
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  domainName!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: AdminCertificateLinkSummary['status'];

  @ApiProperty()
  unavailable!: boolean;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty({ nullable: true })
  passScore!: number | null;

  @ApiProperty({ type: [String] })
  enabledQuestionTypeCodes!: string[];

  @ApiProperty({ nullable: true })
  extraConstraint!: string | null;

  @ApiProperty()
  packCount!: number;

  @ApiProperty({ nullable: true })
  activePackId!: string | null;

  @ApiProperty()
  submittedCount!: number;

  @ApiProperty()
  pendingWrongCount!: number;

  @ApiProperty()
  uploadCount!: number;

  @ApiProperty({ type: CertificateLatestScoreDto, nullable: true })
  latestScore!: AdminCertificateLinkSummary['latestScore'];

  @ApiProperty({ nullable: true })
  touchedAt!: string | null;
}

export class AdminCertificateLinkListDto implements AdminCertificateLinkList {
  @ApiProperty({ type: [AdminCertificateLinkSummaryDto] })
  items!: AdminCertificateLinkSummaryDto[];

  @ApiProperty()
  total!: number;

  @ApiProperty()
  page!: number;

  @ApiProperty()
  pageSize!: number;
}

export class AdminCertificateLinkDetailDto
  extends AdminCertificateLinkSummaryDto
  implements AdminCertificateLinkDetail
{
  @ApiProperty({ nullable: true })
  packTouchedAt!: string | null;

  @ApiProperty({ nullable: true })
  wrongTouchedAt!: string | null;

  @ApiProperty({ nullable: true })
  uploadTouchedAt!: string | null;

  @ApiProperty({ nullable: true })
  submittedTouchedAt!: string | null;
}
