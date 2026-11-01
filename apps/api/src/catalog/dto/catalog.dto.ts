import { ApiProperty } from '@nestjs/swagger';
import type {
  CatalogTreeNode,
  CertificateList,
  CertificateSummary,
  DomainList,
  DomainSummary,
  KnowledgePointNode,
  KnowledgeTree,
  PublishStatus,
  TextbookNode,
} from '@tishuashua/shared';

export class DomainSummaryDto implements DomainSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;
}

export class DomainListDto implements DomainList {
  @ApiProperty({ type: [DomainSummaryDto] })
  items!: DomainSummaryDto[];
}

export class CertificateSummaryDto implements CertificateSummary {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  code!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: ['online', 'offline'] })
  status!: PublishStatus;

  @ApiProperty()
  totalScore!: number;

  @ApiProperty({ nullable: true })
  passScore!: number | null;

  @ApiProperty({ type: [String] })
  enabledQuestionTypeCodes!: string[];

  @ApiProperty({ nullable: true })
  extraConstraint!: string | null;
}

export class CertificateListDto implements CertificateList {
  @ApiProperty({ type: [CertificateSummaryDto] })
  items!: CertificateSummaryDto[];
}

export class KnowledgePointNodeDto implements KnowledgePointNode {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['knowledge_point'] })
  kind!: 'knowledge_point';

  @ApiProperty()
  name!: string;

  @ApiProperty()
  promptHint!: string;

  @ApiProperty({ nullable: true })
  sourceRef!: string | null;

  @ApiProperty({ nullable: true })
  parentId!: string | null;

  @ApiProperty()
  level!: number;
}

export class TextbookNodeDto implements TextbookNode {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['textbook'] })
  kind!: 'textbook';

  @ApiProperty()
  name!: string;

  @ApiProperty({ type: [KnowledgePointNodeDto] })
  children!: KnowledgePointNodeDto[];
}

export class KnowledgeTreeDto implements KnowledgeTree {
  @ApiProperty()
  certificateId!: string;

  @ApiProperty()
  certificateName!: string;

  @ApiProperty()
  domainId!: string;

  @ApiProperty()
  domainName!: string;

  @ApiProperty({
    type: 'array',
    items: { oneOf: [{ $ref: '#/components/schemas/TextbookNodeDto' }] },
    description: '教材节点，或未挂教材的独立知识点。',
  })
  nodes!: CatalogTreeNode[];
}
