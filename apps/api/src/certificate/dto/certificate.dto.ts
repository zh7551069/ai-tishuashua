import { ApiProperty } from '@nestjs/swagger';
import type {
  CertificateLatestScore,
  CertificateQueryItem,
  CertificateQueryList,
  PublishStatus,
} from '@tishuashua/shared';

export class CertificateLatestScoreDto implements CertificateLatestScore {
  @ApiProperty()
  sessionId!: string;

  @ApiProperty()
  earnedScore!: number;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty({ nullable: true })
  passed!: boolean | null;

  @ApiProperty()
  submittedAt!: string;
}

export class CertificateQueryItemDto implements CertificateQueryItem {
  @ApiProperty()
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
  status!: PublishStatus;

  @ApiProperty({ description: '证书不是 online。和刷题包的不可用是同一条规则。' })
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
  latestScore!: CertificateLatestScoreDto | null;
}

export class CertificateQueryListDto implements CertificateQueryList {
  @ApiProperty({ type: [CertificateQueryItemDto] })
  items!: CertificateQueryItemDto[];
}
